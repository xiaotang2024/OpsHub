package prober

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// HealthCheckConfig specifies the parameters for performing a health check.
type HealthCheckConfig struct {
	Type               string            `json:"type"`                           // "http", "tcp", or "process"
	URL                string            `json:"url,omitempty"`                  // Full URL for HTTP probe
	Path               string            `json:"path,omitempty"`                 // HTTP probe path (used when URL is not set)
	Host               string            `json:"host,omitempty"`                 // Host for TCP or HTTP probe
	Port               int               `json:"port,omitempty"`                 // Port for TCP or HTTP probe
	ExpectedStatusCode int               `json:"expected_status_code,omitempty"` // Expected HTTP status code (default: 200-299)
	PID                int               `json:"pid,omitempty"`                  // Target PID for process probe
	Timeout            time.Duration     `json:"timeout,omitempty"`              // Individual probe timeout
	Headers            map[string]string `json:"headers,omitempty"`              // Optional HTTP headers
}

// Prober defines the health checking interface.
type Prober interface {
	Probe(ctx context.Context, cfg HealthCheckConfig) (bool, error)
	WaitUntilHealthy(ctx context.Context, cfg HealthCheckConfig, interval, timeout time.Duration) error
}

// DefaultProber is the standard implementation of Prober.
type DefaultProber struct {
	client *http.Client
}

// NewProber creates a new Prober instance.
func NewProber() Prober {
	return &DefaultProber{
		client: &http.Client{
			Transport: &http.Transport{
				Proxy:                 http.ProxyFromEnvironment,
				DialContext:           (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
				ForceAttemptHTTP2:     true,
				MaxIdleConns:          100,
				IdleConnTimeout:       90 * time.Second,
				TLSHandshakeTimeout:   5 * time.Second,
				ExpectContinueTimeout: 1 * time.Second,
			},
		},
	}
}

// Probe executes a single health check probe based on the given configuration.
// It returns (true, nil) if healthy, (false, nil) if unhealthy, or (false, err) on configuration/context error.
func (p *DefaultProber) Probe(ctx context.Context, cfg HealthCheckConfig) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}

	probeType := strings.ToLower(strings.TrimSpace(cfg.Type))
	switch probeType {
	case "http":
		return p.probeHTTP(ctx, cfg)
	case "tcp":
		return p.probeTCP(ctx, cfg)
	case "process":
		return p.probeProcess(ctx, cfg)
	default:
		return false, fmt.Errorf("unsupported probe type: %s", cfg.Type)
	}
}

// WaitUntilHealthy repeatedly performs health probes at the given interval until the service
// is healthy, the timeout expires, or the context is cancelled.
func (p *DefaultProber) WaitUntilHealthy(ctx context.Context, cfg HealthCheckConfig, interval, timeout time.Duration) error {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	if interval <= 0 {
		interval = 1 * time.Second
	}

	deadlineCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Perform initial probe immediately
	ok, err := p.Probe(deadlineCtx, cfg)
	if err != nil {
		if deadlineCtx.Err() != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("health check timed out after %v: %w", timeout, context.DeadlineExceeded)
		}
		return err
	}
	if ok {
		return nil
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-deadlineCtx.Done():
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("health check timed out after %v: %w", timeout, context.DeadlineExceeded)
		case <-ticker.C:
			ok, err := p.Probe(deadlineCtx, cfg)
			if err != nil {
				if deadlineCtx.Err() != nil {
					if ctx.Err() != nil {
						return ctx.Err()
					}
					return fmt.Errorf("health check timed out after %v: %w", timeout, context.DeadlineExceeded)
				}
				return err
			}
			if ok {
				return nil
			}
		}
	}
}

func (p *DefaultProber) probeHTTP(ctx context.Context, cfg HealthCheckConfig) (bool, error) {
	urlStr := strings.TrimSpace(cfg.URL)
	if urlStr == "" {
		if cfg.Port <= 0 {
			return false, fmt.Errorf("http probe requires URL or a valid Port")
		}
		host := strings.TrimSpace(cfg.Host)
		if host == "" {
			host = "127.0.0.1"
		}
		path := strings.TrimSpace(cfg.Path)
		if path == "" {
			path = "/"
		} else if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}
		urlStr = fmt.Sprintf("http://%s:%d%s", host, cfg.Port, path)
	} else if !strings.Contains(urlStr, "://") {
		urlStr = "http://" + urlStr
	}

	probeCtx := ctx
	if cfg.Timeout > 0 {
		var cancel context.CancelFunc
		probeCtx, cancel = context.WithTimeout(ctx, cfg.Timeout)
		defer cancel()
	} else if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		probeCtx, cancel = context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
	}

	req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, urlStr, nil)
	if err != nil {
		return false, fmt.Errorf("failed to create http request: %w", err)
	}

	for k, v := range cfg.Headers {
		req.Header.Set(k, v)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return false, ctx.Err()
		}
		// Connection refused, timeout, or network error indicates the target is unhealthy
		return false, nil
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()

	if cfg.ExpectedStatusCode > 0 {
		return resp.StatusCode == cfg.ExpectedStatusCode, nil
	}

	return resp.StatusCode >= 200 && resp.StatusCode <= 299, nil
}

func (p *DefaultProber) probeTCP(ctx context.Context, cfg HealthCheckConfig) (bool, error) {
	host := strings.TrimSpace(cfg.Host)
	if host == "" {
		host = "127.0.0.1"
	}
	if cfg.Port <= 0 || cfg.Port > 65535 {
		return false, fmt.Errorf("invalid port for tcp probe: %d", cfg.Port)
	}

	addr := net.JoinHostPort(host, strconv.Itoa(cfg.Port))

	dialTimeout := cfg.Timeout
	if dialTimeout <= 0 {
		dialTimeout = 5 * time.Second
	}

	dialCtx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()

	var dialer net.Dialer
	conn, err := dialer.DialContext(dialCtx, "tcp", addr)
	if err != nil {
		if ctx.Err() != nil {
			return false, ctx.Err()
		}
		// Port closed or connect timed out
		return false, nil
	}
	_ = conn.Close()

	return true, nil
}

func (p *DefaultProber) probeProcess(ctx context.Context, cfg HealthCheckConfig) (bool, error) {
	if cfg.PID <= 0 {
		return false, fmt.Errorf("invalid PID for process probe: %d", cfg.PID)
	}

	// Signal 0 verifies process presence and permission
	err := syscall.Kill(cfg.PID, 0)
	if err != nil {
		if errors.Is(err, syscall.ESRCH) {
			return false, nil
		}
		if errors.Is(err, syscall.EPERM) {
			// Process exists but owned by another user
			return isProcessAlive(cfg.PID), nil
		}
		return false, nil
	}

	return isProcessAlive(cfg.PID), nil
}

// isProcessAlive checks whether the process is alive and not in a zombie/defunct state.
func isProcessAlive(pid int) bool {
	// 1. Linux /proc/<pid>/stat
	statPath := fmt.Sprintf("/proc/%d/stat", pid)
	if data, err := os.ReadFile(statPath); err == nil {
		if alive, ok := ParseProcStatState(string(data)); ok {
			return alive
		}
	}

	// 2. macOS / BSD / fallback using ps
	cmd := exec.Command("ps", "-o", "state=", "-p", strconv.Itoa(pid))
	out, err := cmd.Output()
	if err == nil {
		state := strings.TrimSpace(string(out))
		if state == "" || strings.HasPrefix(state, "Z") {
			return false
		}
		return true
	}

	// 3. Fallback: if ps is unavailable, rely on signal 0 success
	return true
}

// ParseProcStatState parses Linux /proc/<pid>/stat to check if state is alive.
func ParseProcStatState(content string) (bool, bool) {
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
