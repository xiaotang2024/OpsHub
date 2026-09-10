package websocket

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"opshub/internal/tailer"
)

// LogPathResolver resolves the disk log path for a given service ID.
type LogPathResolver func(serviceID int64) (string, error)

// Hub manages WebSocket connections for streaming real-time service logs.
type Hub struct {
	tailer           tailer.Tailer
	db               *sql.DB
	resolver         LogPathResolver
	defaultTailLines int
	upgrader         websocket.Upgrader
}

// Option configures Hub instances.
type Option func(*Hub)

// WithResolver sets an explicit log path resolver.
func WithResolver(resolver LogPathResolver) Option {
	return func(h *Hub) {
		h.resolver = resolver
	}
}

// WithUpgrader sets a custom WebSocket upgrader.
func WithUpgrader(upgrader websocket.Upgrader) Option {
	return func(h *Hub) {
		h.upgrader = upgrader
	}
}

// WithDefaultTailLines sets the default number of lines to tail initially.
func WithDefaultTailLines(lines int) Option {
	return func(h *Hub) {
		if lines > 0 {
			h.defaultTailLines = lines
		}
	}
}

// NewHub creates a new Hub with database backing and optional configuration.
func NewHub(tl tailer.Tailer, db *sql.DB, opts ...Option) *Hub {
	h := &Hub{
		tailer:           tl,
		db:               db,
		defaultTailLines: 200,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
	for _, opt := range opts {
		opt(h)
	}
	return h
}

// NewHubWithResolver creates a new Hub with an explicit log path resolver.
func NewHubWithResolver(tl tailer.Tailer, resolver LogPathResolver, opts ...Option) *Hub {
	opts = append([]Option{WithResolver(resolver)}, opts...)
	return NewHub(tl, nil, opts...)
}

// ResolveLogPath resolves the disk log path for the specified service ID and request.
func (h *Hub) ResolveLogPath(r *http.Request, serviceID int64) (string, error) {
	if h.resolver != nil {
		return h.resolver(serviceID)
	}

	if h.db == nil {
		return "", errors.New("no database or log resolver configured")
	}

	var installDir string
	err := h.db.QueryRow("SELECT install_dir FROM services WHERE id = ?", serviceID).Scan(&installDir)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", fmt.Errorf("service with ID %d not found", serviceID)
		}
		return "", fmt.Errorf("query service %d failed: %w", serviceID, err)
	}

	fileName := ""
	if r != nil && r.URL != nil {
		fileName = r.URL.Query().Get("file")
	}
	if fileName == "" {
		fileName = "console.log"
	} else {
		fileName = filepath.Base(fileName)
	}

	logPath := filepath.Join(installDir, "logs", fileName)
	if _, err := os.Stat(logPath); os.IsNotExist(err) {
		directPath := filepath.Join(installDir, fileName)
		if _, err2 := os.Stat(directPath); err2 == nil {
			return directPath, nil
		}
	}
	return logPath, nil
}

// ServeWS handles incoming WebSocket connections for tailing logs of the specified service.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, serviceID int) {
	// 1. Resolve log path
	logPath, err := h.ResolveLogPath(r, int64(serviceID))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// 2. Determine tail lines
	tailLines := h.defaultTailLines
	if r.URL != nil {
		if tailParam := r.URL.Query().Get("tail"); tailParam != "" {
			if n, err := strconv.Atoi(tailParam); err == nil && n >= 0 {
				tailLines = n
			}
		} else if linesParam := r.URL.Query().Get("lines"); linesParam != "" {
			if n, err := strconv.Atoi(linesParam); err == nil && n >= 0 {
				tailLines = n
			}
		}
	}

	// 3. Upgrade to WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Gorilla upgrader handles writing HTTP error response
		return
	}
	defer conn.Close()

	// 4. Create cancellable context
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// 5. Start tailing file
	ch, err := h.tailer.TailFile(ctx, logPath, tailLines)
	if err != nil {
		errMsg := fmt.Sprintf("[OpsHub] Failed to tail log: %v\r\n", err)
		_ = conn.WriteMessage(websocket.TextMessage, []byte(errMsg))
		_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "tail error"))
		return
	}

	// 6. Reader pump for detecting client disconnect
	go func() {
		defer cancel()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// 7. Stream lines to client
	for {
		select {
		case <-ctx.Done():
			return
		case line, ok := <-ch:
			if !ok {
				return
			}
			msg := line
			if !strings.HasSuffix(msg, "\n") {
				msg += "\r\n"
			} else if !strings.HasSuffix(msg, "\r\n") {
				msg = strings.TrimSuffix(msg, "\n") + "\r\n"
			}
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
				return
			}
		}
	}
}
