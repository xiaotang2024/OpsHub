package supervisor

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// DefaultUnitDir is the default directory for systemd system units.
const DefaultUnitDir = "/etc/systemd/system"

// CommandRunner executes a system command and returns its combined stdout/stderr.
type CommandRunner func(ctx context.Context, name string, args ...string) ([]byte, error)

// defaultCommandRunner executes real system commands via os/exec.
func defaultCommandRunner(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	return cmd.CombinedOutput()
}

// SystemdSupervisor manages systemd service units and communicates with systemctl.
type SystemdSupervisor struct {
	unitDir string
	runner  CommandRunner
}

// NewSystemdSupervisor creates a new SystemdSupervisor instance.
// If unitDir is empty, DefaultUnitDir is used.
// An optional CommandRunner can be provided for dependency injection during testing.
func NewSystemdSupervisor(unitDir string, runner ...CommandRunner) *SystemdSupervisor {
	if unitDir == "" {
		unitDir = DefaultUnitDir
	}
	var r CommandRunner = defaultCommandRunner
	if len(runner) > 0 && runner[0] != nil {
		r = runner[0]
	}
	return &SystemdSupervisor{
		unitDir: unitDir,
		runner:  r,
	}
}

// UnitDir returns the directory where systemd unit files are stored.
func (s *SystemdSupervisor) UnitDir() string {
	return s.unitDir
}

// RenderUnit generates a standard systemd service unit file configuration.
func (s *SystemdSupervisor) RenderUnit(serviceName, dir, execStart string) string {
	var b strings.Builder
	b.WriteString("[Unit]\n")
	b.WriteString(fmt.Sprintf("Description=OpsHub Managed Service - %s\n", serviceName))
	b.WriteString("After=network.target\n\n")

	b.WriteString("[Service]\n")
	b.WriteString("Type=simple\n")
	if strings.TrimSpace(dir) != "" {
		b.WriteString(fmt.Sprintf("WorkingDirectory=%s\n", dir))
	}
	b.WriteString(fmt.Sprintf("ExecStart=%s\n", execStart))
	b.WriteString("Restart=on-failure\n")
	b.WriteString("RestartSec=5s\n")
	b.WriteString("LimitNOFILE=65536\n\n")

	b.WriteString("[Install]\n")
	b.WriteString("WantedBy=multi-user.target\n")

	return b.String()
}

// normalizeServiceName validates and standardizes a systemd service unit filename.
func normalizeServiceName(serviceName string) (string, error) {
	trimmed := strings.TrimSpace(serviceName)
	if trimmed == "" {
		return "", fmt.Errorf("service name cannot be empty")
	}
	if filepath.Base(trimmed) != trimmed || strings.Contains(trimmed, "/") || strings.Contains(trimmed, "\\") {
		return "", fmt.Errorf("invalid service name: %s", serviceName)
	}
	if !strings.HasSuffix(trimmed, ".service") {
		trimmed += ".service"
	}
	return trimmed, nil
}

// InstallAndStart writes the unit file to unitDir, reloads systemd, enables and starts the service.
func (s *SystemdSupervisor) InstallAndStart(ctx context.Context, serviceName, unitContent string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	unitName, err := normalizeServiceName(serviceName)
	if err != nil {
		return err
	}
	if strings.TrimSpace(unitContent) == "" {
		return fmt.Errorf("unit content cannot be empty")
	}

	if err := os.MkdirAll(s.unitDir, 0755); err != nil {
		return fmt.Errorf("failed to create unit directory %s: %w", s.unitDir, err)
	}

	unitPath := filepath.Join(s.unitDir, unitName)
	if err := os.WriteFile(unitPath, []byte(unitContent), 0644); err != nil {
		return fmt.Errorf("failed to write unit file %s: %w", unitPath, err)
	}

	if out, err := s.runner(ctx, "systemctl", "daemon-reload"); err != nil {
		return fmt.Errorf("systemctl daemon-reload failed: %w (output: %s)", err, strings.TrimSpace(string(out)))
	}

	if out, err := s.runner(ctx, "systemctl", "enable", unitName); err != nil {
		return fmt.Errorf("systemctl enable %s failed: %w (output: %s)", unitName, err, strings.TrimSpace(string(out)))
	}

	if out, err := s.runner(ctx, "systemctl", "start", unitName); err != nil {
		return fmt.Errorf("systemctl start %s failed: %w (output: %s)", unitName, err, strings.TrimSpace(string(out)))
	}

	return nil
}

// Stop stops the specified systemd service via systemctl.
func (s *SystemdSupervisor) Stop(ctx context.Context, serviceName string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	unitName, err := normalizeServiceName(serviceName)
	if err != nil {
		return err
	}

	if out, err := s.runner(ctx, "systemctl", "stop", unitName); err != nil {
		return fmt.Errorf("systemctl stop %s failed: %w (output: %s)", unitName, err, strings.TrimSpace(string(out)))
	}
	return nil
}

// Restart restarts the specified systemd service via systemctl.
func (s *SystemdSupervisor) Restart(ctx context.Context, serviceName string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	unitName, err := normalizeServiceName(serviceName)
	if err != nil {
		return err
	}

	if out, err := s.runner(ctx, "systemctl", "restart", unitName); err != nil {
		return fmt.Errorf("systemctl restart %s failed: %w (output: %s)", unitName, err, strings.TrimSpace(string(out)))
	}
	return nil
}

// IsActive checks if the specified systemd service is active.
// Returns true if active, false if inactive/failed/unknown, or an error if the command failed unexpectedly.
func (s *SystemdSupervisor) IsActive(ctx context.Context, serviceName string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	unitName, err := normalizeServiceName(serviceName)
	if err != nil {
		return false, err
	}

	out, err := s.runner(ctx, "systemctl", "is-active", unitName)
	state := strings.TrimSpace(string(out))

	switch state {
	case "active":
		return true, nil
	case "inactive", "failed", "deactivating", "dead", "unknown", "not-found":
		return false, nil
	}

	if err != nil {
		return false, fmt.Errorf("systemctl is-active %s failed: %w (output: %s)", unitName, err, state)
	}

	// Any other state (e.g. activating, reloading) is not considered active
	return false, nil
}

// Uninstall stops and disables the service, removes the unit file, and reloads systemd.
func (s *SystemdSupervisor) Uninstall(ctx context.Context, serviceName string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	unitName, err := normalizeServiceName(serviceName)
	if err != nil {
		return err
	}

	// 1. Best effort stop
	_, _ = s.runner(ctx, "systemctl", "stop", unitName)

	// 2. Best effort disable
	_, _ = s.runner(ctx, "systemctl", "disable", unitName)

	// 3. Remove unit file
	unitPath := filepath.Join(s.unitDir, unitName)
	if err := os.Remove(unitPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove unit file %s: %w", unitPath, err)
	}

	// 4. Reload daemon
	if out, err := s.runner(ctx, "systemctl", "daemon-reload"); err != nil {
		return fmt.Errorf("systemctl daemon-reload failed: %w (output: %s)", err, strings.TrimSpace(string(out)))
	}

	// 5. Best effort reset failed state
	_, _ = s.runner(ctx, "systemctl", "reset-failed", unitName)

	return nil
}
