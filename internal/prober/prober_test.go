package prober_test

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/prober"
)

func TestProber_HTTPAndTCP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"UP"}`))
			return
		}
		if r.URL.Path == "/status-201" {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"status":"CREATED"}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	p := prober.NewProber()

	// HTTP Probe test - 200 OK (default 200-299 range)
	httpCfg := prober.HealthCheckConfig{
		Type: "http",
		URL:  server.URL + "/health",
	}
	ok, err := p.Probe(context.Background(), httpCfg)
	require.NoError(t, err)
	assert.True(t, ok)

	// HTTP Probe test - 404 Not Found (expect 200-299 -> false)
	httpNotFoundCfg := prober.HealthCheckConfig{
		Type: "http",
		URL:  server.URL + "/notfound",
	}
	ok, err = p.Probe(context.Background(), httpNotFoundCfg)
	require.NoError(t, err)
	assert.False(t, ok)

	// HTTP Probe test - custom ExpectedStatusCode
	httpCustomCfg := prober.HealthCheckConfig{
		Type:               "http",
		URL:                server.URL + "/status-201",
		ExpectedStatusCode: http.StatusCreated,
	}
	ok, err = p.Probe(context.Background(), httpCustomCfg)
	require.NoError(t, err)
	assert.True(t, ok)

	// HTTP Probe test - custom ExpectedStatusCode mismatch
	httpMismatchCfg := prober.HealthCheckConfig{
		Type:               "http",
		URL:                server.URL + "/status-201",
		ExpectedStatusCode: http.StatusOK,
	}
	ok, err = p.Probe(context.Background(), httpMismatchCfg)
	require.NoError(t, err)
	assert.False(t, ok)

	// TCP Probe test
	host, portStr, err := net.SplitHostPort(server.Listener.Addr().String())
	require.NoError(t, err)
	port, err := strconv.Atoi(portStr)
	require.NoError(t, err)

	tcpCfg := prober.HealthCheckConfig{
		Type: "tcp",
		Host: host,
		Port: port,
	}
	ok, err = p.Probe(context.Background(), tcpCfg)
	require.NoError(t, err)
	assert.True(t, ok)

	// TCP Probe test - closed port
	// Find an available port, close it, and probe it
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	closedPort := l.Addr().(*net.TCPAddr).Port
	require.NoError(t, l.Close())

	tcpClosedCfg := prober.HealthCheckConfig{
		Type: "tcp",
		Host: "127.0.0.1",
		Port: closedPort,
	}
	ok, err = p.Probe(context.Background(), tcpClosedCfg)
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestProber_Process(t *testing.T) {
	p := prober.NewProber()

	// Process probe on current running process (alive)
	currentPid := os.Getpid()
	procCfg := prober.HealthCheckConfig{
		Type: "process",
		PID:  currentPid,
	}
	ok, err := p.Probe(context.Background(), procCfg)
	require.NoError(t, err)
	assert.True(t, ok)

	// Process probe on non-existent PID
	deadProcCfg := prober.HealthCheckConfig{
		Type: "process",
		PID:  99999999,
	}
	ok, err = p.Probe(context.Background(), deadProcCfg)
	require.NoError(t, err)
	assert.False(t, ok)

	// Process probe with invalid PID (<= 0)
	invalidProcCfg := prober.HealthCheckConfig{
		Type: "process",
		PID:  0,
	}
	_, err = p.Probe(context.Background(), invalidProcCfg)
	assert.Error(t, err)
}

func TestProber_WaitUntilHealthy(t *testing.T) {
	p := prober.NewProber()

	t.Run("becomes healthy after retries", func(t *testing.T) {
		var attempts int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			count := atomic.AddInt32(&attempts, 1)
			if count >= 3 {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"status":"UP"}`))
				return
			}
			w.WriteHeader(http.StatusServiceUnavailable)
		}))
		defer server.Close()

		cfg := prober.HealthCheckConfig{
			Type: "http",
			URL:  server.URL + "/health",
		}

		err := p.WaitUntilHealthy(context.Background(), cfg, 20*time.Millisecond, 2*time.Second)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, atomic.LoadInt32(&attempts), int32(3))
	})

	t.Run("times out when never healthy", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()

		cfg := prober.HealthCheckConfig{
			Type: "http",
			URL:  server.URL + "/health",
		}

		err := p.WaitUntilHealthy(context.Background(), cfg, 20*time.Millisecond, 100*time.Millisecond)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "health check timed out")
	})

	t.Run("returns immediately on invalid probe type", func(t *testing.T) {
		cfg := prober.HealthCheckConfig{
			Type: "unsupported_probe",
		}

		start := time.Now()
		err := p.WaitUntilHealthy(context.Background(), cfg, 50*time.Millisecond, 2*time.Second)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unsupported probe type")
		assert.Less(t, time.Since(start), 200*time.Millisecond)
	})

	t.Run("respects context cancellation", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusServiceUnavailable)
		}))
		defer server.Close()

		ctx, cancel := context.WithCancel(context.Background())
		cfg := prober.HealthCheckConfig{
			Type: "http",
			URL:  server.URL + "/health",
		}

		go func() {
			time.Sleep(50 * time.Millisecond)
			cancel()
		}()

		err := p.WaitUntilHealthy(ctx, cfg, 20*time.Millisecond, 5*time.Second)
		require.Error(t, err)
		assert.ErrorIs(t, err, context.Canceled)
	})
}

func TestProber_ConfigAndValidation(t *testing.T) {
	p := prober.NewProber()

	// Unsupported type
	_, err := p.Probe(context.Background(), prober.HealthCheckConfig{Type: "unknown"})
	assert.Error(t, err)

	// HTTP with empty URL and port <= 0
	_, err = p.Probe(context.Background(), prober.HealthCheckConfig{Type: "http"})
	assert.Error(t, err)

	// TCP with invalid port
	_, err = p.Probe(context.Background(), prober.HealthCheckConfig{Type: "tcp", Port: 0})
	assert.Error(t, err)

	_, err = p.Probe(context.Background(), prober.HealthCheckConfig{Type: "tcp", Port: 70000})
	assert.Error(t, err)
}

func TestProber_HTTPExtended(t *testing.T) {
	var receivedHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHeader = r.Header.Get("X-Custom-Probe")
		if r.URL.Path == "/my-health" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	p := prober.NewProber()

	host, portStr, err := net.SplitHostPort(server.Listener.Addr().String())
	require.NoError(t, err)
	port, err := strconv.Atoi(portStr)
	require.NoError(t, err)

	// Test HTTP constructed with Host, Port, Path (without explicit URL)
	cfg := prober.HealthCheckConfig{
		Type:    "http",
		Host:    host,
		Port:    port,
		Path:    "my-health", // without leading slash to test auto-prefixing
		Headers: map[string]string{"X-Custom-Probe": "opshub-check"},
	}
	ok, err := p.Probe(context.Background(), cfg)
	require.NoError(t, err)
	assert.True(t, ok)
	assert.Equal(t, "opshub-check", receivedHeader)

	// Test URL without scheme prefix (e.g. "127.0.0.1:port/my-health")
	noSchemeCfg := prober.HealthCheckConfig{
		Type: "http",
		URL:  server.Listener.Addr().String() + "/my-health",
	}
	ok, err = p.Probe(context.Background(), noSchemeCfg)
	require.NoError(t, err)
	assert.True(t, ok)

	// Test HTTP connection failure on closed port
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	closedPort := l.Addr().(*net.TCPAddr).Port
	require.NoError(t, l.Close())

	closedHTTPCfg := prober.HealthCheckConfig{
		Type: "http",
		URL:  "http://127.0.0.1:" + strconv.Itoa(closedPort) + "/health",
	}
	ok, err = p.Probe(context.Background(), closedHTTPCfg)
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestProber_TCPExtended(t *testing.T) {
	// Start TCP listener on 127.0.0.1
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer l.Close()
	port := l.Addr().(*net.TCPAddr).Port

	p := prober.NewProber()

	// Empty host should default to 127.0.0.1
	cfg := prober.HealthCheckConfig{
		Type: "tcp",
		Host: "",
		Port: port,
	}
	ok, err := p.Probe(context.Background(), cfg)
	require.NoError(t, err)
	assert.True(t, ok)
}

func TestParseProcStatState(t *testing.T) {
	// Normal running process
	alive, ok := prober.ParseProcStatState("1234 (bash) S 1 1234 1234 0 -1 4194304")
	assert.True(t, ok)
	assert.True(t, alive)

	// Running state
	alive, ok = prober.ParseProcStatState("1234 (process_with spaces) R 1 1234 1234")
	assert.True(t, ok)
	assert.True(t, alive)

	// Zombie state
	alive, ok = prober.ParseProcStatState("1234 (defunct_cmd) Z 1 1234 1234")
	assert.True(t, ok)
	assert.False(t, alive)

	// Dead state
	alive, ok = prober.ParseProcStatState("1234 (dead_cmd) X 1 1234 1234")
	assert.True(t, ok)
	assert.False(t, alive)

	// Malformed content
	alive, ok = prober.ParseProcStatState("invalid format")
	assert.False(t, ok)
	assert.False(t, alive)
}

func TestProber_WaitUntilHealthy_ImmediateSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := prober.NewProber()
	cfg := prober.HealthCheckConfig{
		Type: "http",
		URL:  server.URL,
	}

	// Should succeed immediately on first attempt without waiting
	start := time.Now()
	err := p.WaitUntilHealthy(context.Background(), cfg, 0, 0) // zero interval and timeout defaults
	require.NoError(t, err)
	assert.Less(t, time.Since(start), 200*time.Millisecond)
}

func TestProber_HTTPLargeResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		// Send 1MB of payload
		buf := make([]byte, 1024*1024)
		_, _ = w.Write(buf)
	}))
	defer server.Close()

	p := prober.NewProber()
	ok, err := p.Probe(context.Background(), prober.HealthCheckConfig{
		Type: "http",
		URL:  server.URL,
	})
	require.NoError(t, err)
	assert.True(t, ok)
}


