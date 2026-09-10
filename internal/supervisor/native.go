package supervisor

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Ensure NativeSupervisor implements the Supervisor interface.
var _ Supervisor = (*NativeSupervisor)(nil)

type trackedProcess struct {
	cmd  *exec.Cmd
	done chan struct{}
}

// NativeSupervisor manages native OS processes using shell execution,
// process group isolation, and signal handling.
type NativeSupervisor struct {
	mu        sync.RWMutex
	processes map[int]*trackedProcess
}

// NewNativeSupervisor creates a new NativeSupervisor instance.
func NewNativeSupervisor() *NativeSupervisor {
	return &NativeSupervisor{
		processes: make(map[int]*trackedProcess),
	}
}

// Start executes a command within an isolated process group and redirects output to logFile.
func (s *NativeSupervisor) Start(ctx context.Context, dir, command string, envs []string, logFile string) (int, error) {
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	if strings.TrimSpace(command) == "" {
		return 0, fmt.Errorf("command cannot be empty")
	}

	cmd := exec.Command("/bin/sh", "-c", command)
	if dir != "" {
		cmd.Dir = dir
	}

	// Subprocesses must be executed in an isolated process group so children don't become orphaned.
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}

	if len(envs) > 0 {
		cmd.Env = append(os.Environ(), envs...)
	}

	if logFile != "" {
		if logDir := filepath.Dir(logFile); logDir != "" {
			if err := os.MkdirAll(logDir, 0755); err != nil {
				return 0, fmt.Errorf("failed to create log directory: %w", err)
			}
		}

		f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return 0, fmt.Errorf("failed to open log file: %w", err)
		}
		defer f.Close()

		cmd.Stdout = f
		cmd.Stderr = f
	}

	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("failed to start process: %w", err)
	}

	pid := cmd.Process.Pid
	tp := &trackedProcess{
		cmd:  cmd,
		done: make(chan struct{}),
	}

	s.mu.Lock()
	s.processes[pid] = tp
	s.mu.Unlock()

	// Wait in background to reap child process and prevent zombies.
	go func() {
		_ = cmd.Wait()
		close(tp.done)
		s.mu.Lock()
		delete(s.processes, pid)
		s.mu.Unlock()
	}()

	return pid, nil
}

// Stop gracefully terminates a process and its process group via SIGTERM,
// polling for exit within timeout, and sends SIGKILL if it does not exit.
func (s *NativeSupervisor) Stop(ctx context.Context, pid int, timeout time.Duration) error {
	if pid <= 1 {
		return fmt.Errorf("invalid process pid %d: cannot stop init or non-positive pid", pid)
	}

	if !s.IsRunning(pid) {
		return nil
	}

	s.mu.RLock()
	tp, isTracked := s.processes[pid]
	s.mu.RUnlock()

	// Send SIGTERM to process group (-pid) to terminate process and all descendants
	if err := syscall.Kill(-pid, syscall.SIGTERM); err != nil {
		// Fallback to sending SIGTERM directly to pid if process group kill fails
		_ = syscall.Kill(pid, syscall.SIGTERM)
	}

	// Poll or wait for exit within timeout
	if isTracked {
		select {
		case <-tp.done:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(timeout):
			// Timeout reached, proceed to SIGKILL below
		}
	} else {
		deadline := time.Now().Add(timeout)
		ticker := time.NewTicker(50 * time.Millisecond)

		for {
			if !s.IsRunning(pid) {
				ticker.Stop()
				return nil
			}
			if time.Now().After(deadline) {
				break
			}
			select {
			case <-ctx.Done():
				ticker.Stop()
				return ctx.Err()
			case <-ticker.C:
			}
		}
		ticker.Stop()
	}

	// If still running after timeout, send SIGKILL to process group and pid
	if s.IsRunning(pid) {
		_ = syscall.Kill(-pid, syscall.SIGKILL)
		_ = syscall.Kill(pid, syscall.SIGKILL)

		if isTracked {
			select {
			case <-tp.done:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(2 * time.Second):
			}
		} else {
			killDeadline := time.Now().Add(2 * time.Second)
			ticker := time.NewTicker(50 * time.Millisecond)

			for time.Now().Before(killDeadline) {
				if !s.IsRunning(pid) {
					ticker.Stop()
					return nil
				}
				select {
				case <-ctx.Done():
					ticker.Stop()
					return ctx.Err()
				case <-ticker.C:
				}
			}
			ticker.Stop()
		}
	}

	if s.IsRunning(pid) {
		return fmt.Errorf("process %d failed to terminate after SIGKILL", pid)
	}

	return nil
}

// IsRunning checks whether the process with the given PID is currently active.
func (s *NativeSupervisor) IsRunning(pid int) bool {
	if pid <= 0 {
		return false
	}

	s.mu.RLock()
	tp, tracked := s.processes[pid]
	s.mu.RUnlock()

	if tracked {
		select {
		case <-tp.done:
			return false
		default:
			// Process is tracked and cmd.Wait() hasn't completed.
			// Verify signal 0 check.
			return syscall.Kill(pid, 0) == nil
		}
	}

	// External / untracked process: check with signal 0
	if err := syscall.Kill(pid, 0); err != nil {
		return false
	}

	// Verify process state (not a zombie / defunct process)
	return isProcessAlive(pid)
}

// isProcessAlive checks whether an untracked process is truly alive and not a zombie.
func isProcessAlive(pid int) bool {
	// 1. Check Linux /proc/<pid>/stat if available
	statPath := fmt.Sprintf("/proc/%d/stat", pid)
	if data, err := os.ReadFile(statPath); err == nil {
		if alive, ok := ParseProcStatState(string(data)); ok {
			return alive
		}
	}

	// 2. macOS / BSD / fallback using ps
	out, err := exec.Command("ps", "-o", "state=", "-p", strconv.Itoa(pid)).Output()
	if err != nil {
		return false
	}
	state := strings.TrimSpace(string(out))
	if state == "" || strings.HasPrefix(state, "Z") {
		return false
	}
	return true
}

// ParseProcStatState extracts the process state character from /proc/<pid>/stat content.
func ParseProcStatState(content string) (isAlive bool, ok bool) {
	lastParen := strings.LastIndex(content, ")")
	if lastParen != -1 && len(content) > lastParen+2 {
		fields := strings.Fields(content[lastParen+1:])
		if len(fields) > 0 {
			state := fields[0]
			if state == "Z" || state == "X" || state == "x" {
				return false, true
			}
			return true, true
		}
	}
	return false, false
}
