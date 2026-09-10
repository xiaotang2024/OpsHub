package supervisor

import (
	"context"
	"time"
)

// Supervisor defines the lifecycle management interface for background processes.
type Supervisor interface {
	Start(ctx context.Context, dir, command string, envs []string, logFile string) (int, error)
	Stop(ctx context.Context, pid int, timeout time.Duration) error
	IsRunning(pid int) bool
}
