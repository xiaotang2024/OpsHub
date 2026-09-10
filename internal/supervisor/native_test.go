package supervisor_test

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/supervisor"
)

func TestNativeSupervisor_Lifecycle(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "console.log")

	sup := supervisor.NewNativeSupervisor()

	// Start a long-running process
	cmd := "sleep 10"
	pid, err := sup.Start(context.Background(), tmpDir, cmd, nil, logPath)
	require.NoError(t, err)
	assert.Greater(t, pid, 0)
	assert.True(t, sup.IsRunning(pid))

	// Stop gracefully
	err = sup.Stop(context.Background(), pid, 2*time.Second)
	require.NoError(t, err)
	assert.False(t, sup.IsRunning(pid))
}

func TestNativeSupervisor_LogRedirection(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "logs", "app.log")

	sup := supervisor.NewNativeSupervisor()

	cmd := "echo 'stdout message'; echo 'stderr message' >&2"
	pid, err := sup.Start(context.Background(), tmpDir, cmd, nil, logPath)
	require.NoError(t, err)

	// Wait for short command to complete
	require.Eventually(t, func() bool {
		return !sup.IsRunning(pid)
	}, 3*time.Second, 50*time.Millisecond)

	content, err := os.ReadFile(logPath)
	require.NoError(t, err)
	assert.Contains(t, string(content), "stdout message")
	assert.Contains(t, string(content), "stderr message")
}

func TestNativeSupervisor_EnvironmentVariables(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "env.log")

	sup := supervisor.NewNativeSupervisor()

	envs := []string{"OPSHUB_TEST_VAR=OpsHubSupervisedValue"}
	cmd := "echo ENV=$OPSHUB_TEST_VAR"
	pid, err := sup.Start(context.Background(), tmpDir, cmd, envs, logPath)
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		return !sup.IsRunning(pid)
	}, 3*time.Second, 50*time.Millisecond)

	content, err := os.ReadFile(logPath)
	require.NoError(t, err)
	assert.Contains(t, string(content), "ENV=OpsHubSupervisedValue")
}

func TestNativeSupervisor_ProcessGroupKill_Children(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "pgroup.log")

	sup := supervisor.NewNativeSupervisor()

	// Spawn a parent shell that launches a child sleep in background and waits
	// Without Setpgid and group kill (-pid), the child sleep 30 would remain running.
	childMarker := filepath.Join(tmpDir, "child_pid.txt")
	cmd := fmt.Sprintf("sleep 30 & echo $! > %s; wait", childMarker)

	pid, err := sup.Start(context.Background(), tmpDir, cmd, nil, logPath)
	require.NoError(t, err)
	assert.True(t, sup.IsRunning(pid))

	// Verify child process was started and get child PID
	var childPID int
	require.Eventually(t, func() bool {
		data, err := os.ReadFile(childMarker)
		if err != nil {
			return false
		}
		p, err := strconv.Atoi(strings.TrimSpace(string(data)))
		if err == nil && p > 0 {
			childPID = p
			return true
		}
		return false
	}, 3*time.Second, 50*time.Millisecond)

	// Verify child is running
	assert.NoError(t, syscall.Kill(childPID, 0))

	// Stop supervisor process group
	err = sup.Stop(context.Background(), pid, 2*time.Second)
	require.NoError(t, err)
	assert.False(t, sup.IsRunning(pid))

	// Verify child process in group was also killed
	require.Eventually(t, func() bool {
		err := syscall.Kill(childPID, 0)
		return err != nil
	}, 2*time.Second, 50*time.Millisecond)
}

func TestNativeSupervisor_Stop_SIGKILLFallback(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "sigkill.log")

	sup := supervisor.NewNativeSupervisor()

	// Ignore SIGTERM with trap, so only SIGKILL can kill it
	cmd := "trap '' TERM; while true; do sleep 0.1; done"
	pid, err := sup.Start(context.Background(), tmpDir, cmd, nil, logPath)
	require.NoError(t, err)
	assert.True(t, sup.IsRunning(pid))

	// Allow shell a moment to initialize and execute trap
	time.Sleep(100 * time.Millisecond)

	// Stop with short timeout (200ms) - should exceed timeout on SIGTERM, then escalate to SIGKILL
	start := time.Now()
	err = sup.Stop(context.Background(), pid, 200*time.Millisecond)
	elapsed := time.Since(start)

	require.NoError(t, err)
	assert.GreaterOrEqual(t, elapsed, 200*time.Millisecond)
	assert.False(t, sup.IsRunning(pid))
}

func TestNativeSupervisor_Stop_GuardsAgainstInitAndInvalidPid(t *testing.T) {
	sup := supervisor.NewNativeSupervisor()

	// Guard against pid <= 1 (cannot stop init / broadcast signal)
	err := sup.Stop(context.Background(), 1, time.Second)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cannot stop init or non-positive pid")

	err = sup.Stop(context.Background(), 0, time.Second)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cannot stop init or non-positive pid")

	err = sup.Stop(context.Background(), -1, time.Second)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cannot stop init or non-positive pid")

	// Stopping non-existent PID > 1 returns nil idempotently
	assert.NoError(t, sup.Stop(context.Background(), 9999999, time.Second))
}

func TestNativeSupervisor_IsRunning_InvalidPid(t *testing.T) {
	sup := supervisor.NewNativeSupervisor()

	assert.False(t, sup.IsRunning(0))
	assert.False(t, sup.IsRunning(-1))
	assert.False(t, sup.IsRunning(-100))
	assert.False(t, sup.IsRunning(9999999))
}

func TestNativeSupervisor_Start_ValidationErrors(t *testing.T) {
	sup := supervisor.NewNativeSupervisor()

	// Empty command
	_, err := sup.Start(context.Background(), "", "", nil, "")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "command cannot be empty")

	// Whitespace command
	_, err = sup.Start(context.Background(), "", "   ", nil, "")
	assert.Error(t, err)

	// Pre-cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = sup.Start(ctx, "", "sleep 1", nil, "")
	assert.Error(t, err)
	assert.Equal(t, context.Canceled, err)

	// Invalid working directory
	_, err = sup.Start(context.Background(), "/non/existent/path/for/opshub", "sleep 1", nil, "")
	assert.Error(t, err)
}

func TestNativeSupervisor_Stop_ContextCancelled(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "ctx_cancel.log")

	sup := supervisor.NewNativeSupervisor()

	// Ignore SIGTERM so Stop waits
	cmd := "trap '' TERM; while true; do sleep 0.1; done"
	pid, err := sup.Start(context.Background(), tmpDir, cmd, nil, logPath)
	require.NoError(t, err)

	// Allow shell a moment to initialize and execute trap
	time.Sleep(100 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	// Timeout is 5 seconds, but ctx cancels after 100ms
	err = sup.Stop(ctx, pid, 5*time.Second)
	assert.Error(t, err)
	assert.Equal(t, context.DeadlineExceeded, err)

	// Clean up process
	_ = sup.Stop(context.Background(), pid, 500*time.Millisecond)
}

func TestNativeSupervisor_UntrackedPID_IsRunning(t *testing.T) {
	sup := supervisor.NewNativeSupervisor()

	// Current process is running
	assert.True(t, sup.IsRunning(os.Getpid()))
}

func TestNativeSupervisor_Stop_UntrackedProcess(t *testing.T) {
	sup := supervisor.NewNativeSupervisor()

	// Spawn an external process not tracked in sup.processes
	cmd := exec.Command("sleep", "10")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	require.NoError(t, cmd.Start())
	pid := cmd.Process.Pid
	defer func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	assert.True(t, sup.IsRunning(pid))

	// Stop it via supervisor (triggers untracked polling loop)
	err := sup.Stop(context.Background(), pid, 2*time.Second)
	require.NoError(t, err)
	_ = cmd.Wait()
	assert.False(t, sup.IsRunning(pid))
}

func TestNativeSupervisor_Stop_UntrackedProcess_SIGKILL(t *testing.T) {
	sup := supervisor.NewNativeSupervisor()

	// Spawn an external process that ignores SIGTERM
	cmd := exec.Command("/bin/sh", "-c", "trap '' TERM; while true; do sleep 0.1; done")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	require.NoError(t, cmd.Start())
	pid := cmd.Process.Pid
	defer func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	time.Sleep(100 * time.Millisecond)
	assert.True(t, sup.IsRunning(pid))

	// Stop with short timeout (150ms) to trigger untracked SIGKILL path
	err := sup.Stop(context.Background(), pid, 150*time.Millisecond)
	require.NoError(t, err)
	_ = cmd.Wait()
	assert.False(t, sup.IsRunning(pid))
}

func TestNativeSupervisor_ParseProcStatState(t *testing.T) {
	// Standard running process stat
	statRunning := "1234 (sleep) S 1 1234 1234 0 -1 4194304"
	alive, ok := supervisor.ParseProcStatState(statRunning)
	assert.True(t, ok)
	assert.True(t, alive)

	// Command with spaces and parentheses in comm
	statComplexName := "1234 (bash (subshell)) R 1 1234 1234 0 -1"
	alive, ok = supervisor.ParseProcStatState(statComplexName)
	assert.True(t, ok)
	assert.True(t, alive)

	// Zombie process
	statZombie := "1234 (defunct_proc) Z 1 1234 1234 0 -1"
	alive, ok = supervisor.ParseProcStatState(statZombie)
	assert.True(t, ok)
	assert.False(t, alive)

	// Dead process ('X' / 'x')
	statDead := "1234 (dead_proc) X 1 1234 1234 0 -1"
	alive, ok = supervisor.ParseProcStatState(statDead)
	assert.True(t, ok)
	assert.False(t, alive)

	// Invalid / malformed format
	alive, ok = supervisor.ParseProcStatState("not a stat line")
	assert.False(t, ok)
	assert.False(t, alive)
}


