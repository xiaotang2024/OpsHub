package supervisor_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/supervisor"
)

type recordedCommand struct {
	Name string
	Args []string
}

type mockRunner struct {
	mu       sync.Mutex
	commands []recordedCommand
	handlers map[string]func(args []string) ([]byte, error)
}

func newMockRunner() *mockRunner {
	return &mockRunner{
		commands: make([]recordedCommand, 0),
		handlers: make(map[string]func(args []string) ([]byte, error)),
	}
}

func (m *mockRunner) Run(ctx context.Context, name string, args ...string) ([]byte, error) {
	m.mu.Lock()
	m.commands = append(m.commands, recordedCommand{Name: name, Args: args})
	subCmd := ""
	if len(args) > 0 {
		subCmd = args[0]
	}
	handler := m.handlers[subCmd]
	m.mu.Unlock()

	if handler != nil {
		return handler(args)
	}
	return []byte(""), nil
}

func (m *mockRunner) Commands() []recordedCommand {
	m.mu.Lock()
	defer m.mu.Unlock()
	res := make([]recordedCommand, len(m.commands))
	copy(res, m.commands)
	return res
}

func TestSystemdSupervisor_RenderUnit(t *testing.T) {
	sup := supervisor.NewSystemdSupervisor("/tmp/systemd-test")
	unit := sup.RenderUnit("order-service", "/opt/apps/order-service", "/usr/bin/java -jar /opt/apps/order-service/app.jar")

	assert.Contains(t, unit, "[Unit]")
	assert.Contains(t, unit, "Description=OpsHub Managed Service - order-service")
	assert.Contains(t, unit, "After=network.target")
	assert.Contains(t, unit, "[Service]")
	assert.Contains(t, unit, "Type=simple")
	assert.Contains(t, unit, "WorkingDirectory=/opt/apps/order-service")
	assert.Contains(t, unit, "ExecStart=/usr/bin/java -jar /opt/apps/order-service/app.jar")
	assert.Contains(t, unit, "Restart=on-failure")
	assert.Contains(t, unit, "RestartSec=5s")
	assert.Contains(t, unit, "LimitNOFILE=65536")
	assert.Contains(t, unit, "[Install]")
	assert.Contains(t, unit, "WantedBy=multi-user.target")
}

func TestSystemdSupervisor_RenderUnit_EmptyDir(t *testing.T) {
	sup := supervisor.NewSystemdSupervisor("")
	assert.Equal(t, supervisor.DefaultUnitDir, sup.UnitDir())

	unit := sup.RenderUnit("simple-service", "", "/bin/sleep 60")
	assert.NotContains(t, unit, "WorkingDirectory=")
	assert.Contains(t, unit, "ExecStart=/bin/sleep 60")
}

func TestSystemdSupervisor_InstallAndStart(t *testing.T) {
	tmpDir := t.TempDir()
	runner := newMockRunner()
	sup := supervisor.NewSystemdSupervisor(tmpDir, runner.Run)

	ctx := context.Background()
	content := sup.RenderUnit("billing-service", "/opt/billing", "/usr/bin/billing")
	err := sup.InstallAndStart(ctx, "billing-service", content)
	require.NoError(t, err)

	// Verify unit file was written
	writtenPath := filepath.Join(tmpDir, "billing-service.service")
	data, err := os.ReadFile(writtenPath)
	require.NoError(t, err)
	assert.Equal(t, content, string(data))

	// Verify systemctl commands in exact sequence
	cmds := runner.Commands()
	require.Len(t, cmds, 3)
	assert.Equal(t, recordedCommand{Name: "systemctl", Args: []string{"daemon-reload"}}, cmds[0])
	assert.Equal(t, recordedCommand{Name: "systemctl", Args: []string{"enable", "billing-service.service"}}, cmds[1])
	assert.Equal(t, recordedCommand{Name: "systemctl", Args: []string{"start", "billing-service.service"}}, cmds[2])
}

func TestSystemdSupervisor_InstallAndStart_WithServiceSuffix(t *testing.T) {
	tmpDir := t.TempDir()
	runner := newMockRunner()
	sup := supervisor.NewSystemdSupervisor(tmpDir, runner.Run)

	ctx := context.Background()
	content := "[Unit]\nDescription=Test\n"
	err := sup.InstallAndStart(ctx, "payment.service", content)
	require.NoError(t, err)

	writtenPath := filepath.Join(tmpDir, "payment.service")
	assert.FileExists(t, writtenPath)

	cmds := runner.Commands()
	require.Len(t, cmds, 3)
	assert.Equal(t, []string{"enable", "payment.service"}, cmds[1].Args)
	assert.Equal(t, []string{"start", "payment.service"}, cmds[2].Args)
}

func TestSystemdSupervisor_Stop(t *testing.T) {
	runner := newMockRunner()
	sup := supervisor.NewSystemdSupervisor("/tmp/test-units", runner.Run)

	err := sup.Stop(context.Background(), "auth-service")
	require.NoError(t, err)

	cmds := runner.Commands()
	require.Len(t, cmds, 1)
	assert.Equal(t, recordedCommand{Name: "systemctl", Args: []string{"stop", "auth-service.service"}}, cmds[0])
}

func TestSystemdSupervisor_Restart(t *testing.T) {
	runner := newMockRunner()
	sup := supervisor.NewSystemdSupervisor("/tmp/test-units", runner.Run)

	err := sup.Restart(context.Background(), "auth-service")
	require.NoError(t, err)

	cmds := runner.Commands()
	require.Len(t, cmds, 1)
	assert.Equal(t, recordedCommand{Name: "systemctl", Args: []string{"restart", "auth-service.service"}}, cmds[0])
}

func TestSystemdSupervisor_IsActive(t *testing.T) {
	t.Run("active service", func(t *testing.T) {
		runner := newMockRunner()
		runner.handlers["is-active"] = func(args []string) ([]byte, error) {
			return []byte("active\n"), nil
		}
		sup := supervisor.NewSystemdSupervisor("/tmp/test-units", runner.Run)

		active, err := sup.IsActive(context.Background(), "web-service")
		require.NoError(t, err)
		assert.True(t, active)
	})

	t.Run("inactive service with non-zero exit code", func(t *testing.T) {
		runner := newMockRunner()
		runner.handlers["is-active"] = func(args []string) ([]byte, error) {
			return []byte("inactive\n"), errors.New("exit status 3")
		}
		sup := supervisor.NewSystemdSupervisor("/tmp/test-units", runner.Run)

		active, err := sup.IsActive(context.Background(), "web-service")
		require.NoError(t, err)
		assert.False(t, active)
	})

	t.Run("failed service with non-zero exit code", func(t *testing.T) {
		runner := newMockRunner()
		runner.handlers["is-active"] = func(args []string) ([]byte, error) {
			return []byte("failed\n"), errors.New("exit status 3")
		}
		sup := supervisor.NewSystemdSupervisor("/tmp/test-units", runner.Run)

		active, err := sup.IsActive(context.Background(), "web-service")
		require.NoError(t, err)
		assert.False(t, active)
	})

	t.Run("runner command execution error", func(t *testing.T) {
		runner := newMockRunner()
		runner.handlers["is-active"] = func(args []string) ([]byte, error) {
			return nil, exec.ErrNotFound
		}
		sup := supervisor.NewSystemdSupervisor("/tmp/test-units", runner.Run)

		active, err := sup.IsActive(context.Background(), "web-service")
		assert.Error(t, err)
		assert.False(t, active)
	})
}

func TestSystemdSupervisor_Uninstall(t *testing.T) {
	tmpDir := t.TempDir()
	unitFile := filepath.Join(tmpDir, "legacy-service.service")
	require.NoError(t, os.WriteFile(unitFile, []byte("[Unit]\n"), 0644))

	runner := newMockRunner()
	sup := supervisor.NewSystemdSupervisor(tmpDir, runner.Run)

	err := sup.Uninstall(context.Background(), "legacy-service")
	require.NoError(t, err)

	// Verify unit file was removed
	assert.NoFileExists(t, unitFile)

	// Verify command calls: stop, disable, daemon-reload, reset-failed
	cmds := runner.Commands()
	require.Len(t, cmds, 4)
	assert.Equal(t, recordedCommand{Name: "systemctl", Args: []string{"stop", "legacy-service.service"}}, cmds[0])
	assert.Equal(t, recordedCommand{Name: "systemctl", Args: []string{"disable", "legacy-service.service"}}, cmds[1])
	assert.Equal(t, recordedCommand{Name: "systemctl", Args: []string{"daemon-reload"}}, cmds[2])
	assert.Equal(t, recordedCommand{Name: "systemctl", Args: []string{"reset-failed", "legacy-service.service"}}, cmds[3])
}

func TestSystemdSupervisor_Uninstall_MissingFile(t *testing.T) {
	tmpDir := t.TempDir()
	runner := newMockRunner()
	sup := supervisor.NewSystemdSupervisor(tmpDir, runner.Run)

	// Calling uninstall on non-existent file should not fail file removal
	err := sup.Uninstall(context.Background(), "nonexistent-service")
	require.NoError(t, err)
}

func TestSystemdSupervisor_ValidationAndErrors(t *testing.T) {
	tmpDir := t.TempDir()
	runner := newMockRunner()
	sup := supervisor.NewSystemdSupervisor(tmpDir, runner.Run)

	ctx := context.Background()

	t.Run("empty service name", func(t *testing.T) {
		assert.Error(t, sup.InstallAndStart(ctx, "", "content"))
		assert.Error(t, sup.Stop(ctx, ""))
		assert.Error(t, sup.Restart(ctx, ""))
		_, err := sup.IsActive(ctx, "")
		assert.Error(t, err)
		assert.Error(t, sup.Uninstall(ctx, ""))
	})

	t.Run("path traversal in service name", func(t *testing.T) {
		assert.Error(t, sup.InstallAndStart(ctx, "../../etc/passwd", "content"))
		assert.Error(t, sup.Stop(ctx, "../bad"))
		assert.Error(t, sup.Restart(ctx, "subdir/name"))
		_, err := sup.IsActive(ctx, "/etc/shadow")
		assert.Error(t, err)
		assert.Error(t, sup.Uninstall(ctx, "a/b/c"))
	})

	t.Run("empty unit content", func(t *testing.T) {
		assert.Error(t, sup.InstallAndStart(ctx, "good-service", "   "))
	})

	t.Run("cancelled context", func(t *testing.T) {
		cancCtx, cancel := context.WithCancel(context.Background())
		cancel()

		assert.ErrorIs(t, sup.InstallAndStart(cancCtx, "svc", "content"), context.Canceled)
		assert.ErrorIs(t, sup.Stop(cancCtx, "svc"), context.Canceled)
		assert.ErrorIs(t, sup.Restart(cancCtx, "svc"), context.Canceled)
		_, err := sup.IsActive(cancCtx, "svc")
		assert.ErrorIs(t, err, context.Canceled)
		assert.ErrorIs(t, sup.Uninstall(cancCtx, "svc"), context.Canceled)
	})

	t.Run("systemctl daemon-reload error during install", func(t *testing.T) {
		failRunner := newMockRunner()
		failRunner.handlers["daemon-reload"] = func(args []string) ([]byte, error) {
			return []byte("reload failed"), errors.New("daemon reload error")
		}
		failSup := supervisor.NewSystemdSupervisor(t.TempDir(), failRunner.Run)
		err := failSup.InstallAndStart(ctx, "test-svc", "unit")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "daemon-reload failed")
	})

	t.Run("systemctl enable error during install", func(t *testing.T) {
		failRunner := newMockRunner()
		failRunner.handlers["enable"] = func(args []string) ([]byte, error) {
			return []byte("enable failed"), errors.New("enable error")
		}
		failSup := supervisor.NewSystemdSupervisor(t.TempDir(), failRunner.Run)
		err := failSup.InstallAndStart(ctx, "test-svc", "unit")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "systemctl enable")
	})

	t.Run("systemctl start error during install", func(t *testing.T) {
		failRunner := newMockRunner()
		failRunner.handlers["start"] = func(args []string) ([]byte, error) {
			return []byte("start failed"), errors.New("start error")
		}
		failSup := supervisor.NewSystemdSupervisor(t.TempDir(), failRunner.Run)
		err := failSup.InstallAndStart(ctx, "test-svc", "unit")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "systemctl start")
	})

	t.Run("systemctl stop error", func(t *testing.T) {
		failRunner := newMockRunner()
		failRunner.handlers["stop"] = func(args []string) ([]byte, error) {
			return []byte("stop failed"), errors.New("stop error")
		}
		failSup := supervisor.NewSystemdSupervisor(t.TempDir(), failRunner.Run)
		err := failSup.Stop(ctx, "test-svc")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "systemctl stop")
	})

	t.Run("systemctl restart error", func(t *testing.T) {
		failRunner := newMockRunner()
		failRunner.handlers["restart"] = func(args []string) ([]byte, error) {
			return []byte("restart failed"), errors.New("restart error")
		}
		failSup := supervisor.NewSystemdSupervisor(t.TempDir(), failRunner.Run)
		err := failSup.Restart(ctx, "test-svc")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "systemctl restart")
	})

	t.Run("systemctl daemon-reload error during uninstall", func(t *testing.T) {
		failRunner := newMockRunner()
		failRunner.handlers["daemon-reload"] = func(args []string) ([]byte, error) {
			return []byte("reload failed"), errors.New("daemon reload error")
		}
		failSup := supervisor.NewSystemdSupervisor(t.TempDir(), failRunner.Run)
		err := failSup.Uninstall(ctx, "test-svc")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "daemon-reload failed")
	})
}

func TestSystemdSupervisor_DefaultRunner(t *testing.T) {
	sup := supervisor.NewSystemdSupervisor("/tmp/test")
	_, err := sup.IsActive(context.Background(), "test-svc")
	if _, lookErr := exec.LookPath("systemctl"); lookErr != nil {
		assert.Error(t, err)
	}
}

