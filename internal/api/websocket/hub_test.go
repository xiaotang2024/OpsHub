package websocket_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	gorilla "github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	ws "opshub/internal/api/websocket"
	"opshub/internal/database"
	"opshub/internal/tailer"
)

func TestHub_ServeWS_StreamsLogs(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "console.log")

	f, err := os.Create(logPath)
	require.NoError(t, err)
	for i := 1; i <= 5; i++ {
		_, _ = f.WriteString(fmt.Sprintf("log line %d\n", i))
	}
	_ = f.Close()

	tl := tailer.NewTailer(tailer.WithPollInterval(20 * time.Millisecond))
	hub := ws.NewHubWithResolver(tl, func(serviceID int64) (string, error) {
		assert.Equal(t, int64(42), serviceID)
		return logPath, nil
	}, ws.WithDefaultTailLines(3))

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, 42)
	}))
	defer server.Close()

	u, err := url.Parse(server.URL)
	require.NoError(t, err)
	wsURL := "ws://" + u.Host + "/"

	dialer := gorilla.DefaultDialer
	conn, resp, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()
	assert.Equal(t, http.StatusSwitchingProtocols, resp.StatusCode)

	// We expect the last 3 lines: 3, 4, 5
	expectedLines := []string{"log line 3\r\n", "log line 4\r\n", "log line 5\r\n"}
	for _, expected := range expectedLines {
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, msg, err := conn.ReadMessage()
		require.NoError(t, err)
		assert.Equal(t, expected, string(msg))
	}

	// Now append a new line and verify real-time streaming
	fAppend, err := os.OpenFile(logPath, os.O_APPEND|os.O_WRONLY, 0644)
	require.NoError(t, err)
	_, _ = fAppend.WriteString("log line 6\n")
	_ = fAppend.Close()

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)
	assert.Equal(t, "log line 6\r\n", string(msg))
}

func TestHub_ServeWS_CustomTailQuery(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "console.log")

	err := os.WriteFile(logPath, []byte("line 1\nline 2\nline 3\n"), 0644)
	require.NoError(t, err)

	tl := tailer.NewTailer(tailer.WithPollInterval(20 * time.Millisecond))
	hub := ws.NewHubWithResolver(tl, func(serviceID int64) (string, error) {
		return logPath, nil
	}, ws.WithDefaultTailLines(3))

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, 1)
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	wsURL := "ws://" + u.Host + "/?tail=1"

	conn, _, err := gorilla.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)
	assert.Equal(t, "line 3\r\n", string(msg))
}

func TestHub_ServeWS_ServiceNotFound(t *testing.T) {
	tl := tailer.NewTailer()
	hub := ws.NewHubWithResolver(tl, func(serviceID int64) (string, error) {
		return "", fmt.Errorf("service %d not found", serviceID)
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, 999)
	}))
	defer server.Close()

	resp, err := http.Get(server.URL)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestHub_ServeWS_LogFileNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	nonExistentLog := filepath.Join(tmpDir, "does-not-exist.log")

	tl := tailer.NewTailer()
	hub := ws.NewHubWithResolver(tl, func(serviceID int64) (string, error) {
		return nonExistentLog, nil
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, 1)
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	wsURL := "ws://" + u.Host + "/"

	conn, _, err := gorilla.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)
	assert.Contains(t, string(msg), "[OpsHub] Failed to tail log")
}

func TestHub_ResolveLogPath_WithDB(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	db, err := database.InitDB(dbPath)
	require.NoError(t, err)
	defer db.Close()

	appDir := filepath.Join(tmpDir, "apps", "user-service")
	require.NoError(t, os.MkdirAll(filepath.Join(appDir, "logs"), 0755))

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config) 
		VALUES (1, 't1', 'java_jar', '` + appDir + `', 'native', '{}')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (10, 'user-service', 1, '` + appDir + `', 'native', 'RUNNING')`)
	require.NoError(t, err)

	tl := tailer.NewTailer()
	hub := ws.NewHub(tl, db)

	// Test default console.log resolution
	req, _ := http.NewRequest("GET", "/ws/logs", nil)
	path, err := hub.ResolveLogPath(req, 10)
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(appDir, "logs", "console.log"), path)

	// Test custom file query parameter
	reqWithFile, _ := http.NewRequest("GET", "/ws/logs?file=error.log", nil)
	pathCustom, err := hub.ResolveLogPath(reqWithFile, 10)
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(appDir, "logs", "error.log"), pathCustom)

	// Test service not found in DB
	_, err = hub.ResolveLogPath(req, 999)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestHub_ServeWS_ClientDisconnectCleanup(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "disconnect.log")

	err := os.WriteFile(logPath, []byte("line 1\n"), 0644)
	require.NoError(t, err)

	tl := tailer.NewTailer(tailer.WithPollInterval(20 * time.Millisecond))
	hub := ws.NewHubWithResolver(tl, func(serviceID int64) (string, error) {
		return logPath, nil
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, 1)
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	wsURL := "ws://" + u.Host + "/"

	conn, _, err := gorilla.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)

	// Read initial line
	_, _, err = conn.ReadMessage()
	require.NoError(t, err)

	// Close connection immediately to simulate browser tab close
	err = conn.Close()
	require.NoError(t, err)

	// Allow goroutines on server side to clean up
	time.Sleep(100 * time.Millisecond)
}
