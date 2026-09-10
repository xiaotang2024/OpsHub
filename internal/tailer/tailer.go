package tailer

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"
)

// Tailer defines the interface for reading recent lines and following newly appended lines of a file.
type Tailer interface {
	TailFile(ctx context.Context, path string, tailLines int) (<-chan string, error)
}

// FileTailer implements Tailer with reverse seek and continuous polling/following.
type FileTailer struct {
	pollInterval time.Duration
	maxBytes     int64
}

// Option configures FileTailer.
type Option func(*FileTailer)

// WithPollInterval sets the interval for polling file changes after hitting EOF.
func WithPollInterval(d time.Duration) Option {
	return func(t *FileTailer) {
		if d > 0 {
			t.pollInterval = d
		}
	}
}

// WithMaxBytes sets the maximum reverse-seek window size in bytes.
func WithMaxBytes(n int64) Option {
	return func(t *FileTailer) {
		if n > 0 {
			t.maxBytes = n
		}
	}
}

// NewTailer creates a new FileTailer with sensible defaults (50ms poll, 64KB reverse window).
func NewTailer(opts ...Option) *FileTailer {
	t := &FileTailer{
		pollInterval: 50 * time.Millisecond,
		maxBytes:     64 * 1024,
	}
	for _, opt := range opts {
		opt(t)
	}
	return t
}

// TailFile begins tailing the specified file path. It initially returns the last tailLines lines,
// then continuously follows new lines appended to the file until ctx is canceled.
func (t *FileTailer) TailFile(ctx context.Context, path string, tailLines int) (<-chan string, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open file failed: %w", err)
	}

	var startOffset int64
	if tailLines > 0 {
		startOffset, err = t.findReverseOffset(f, tailLines)
		if err != nil {
			_ = f.Close()
			return nil, fmt.Errorf("reverse seek failed: %w", err)
		}
	} else {
		stat, err := f.Stat()
		if err != nil {
			_ = f.Close()
			return nil, fmt.Errorf("stat file failed: %w", err)
		}
		startOffset = stat.Size()
	}

	if _, err := f.Seek(startOffset, io.SeekStart); err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("seek file failed: %w", err)
	}

	ch := make(chan string, 256)
	go t.follow(ctx, f, path, ch)
	return ch, nil
}

// findReverseOffset computes the byte offset corresponding to the beginning of the last tailLines lines.
func (t *FileTailer) findReverseOffset(f *os.File, tailLines int) (int64, error) {
	stat, err := f.Stat()
	if err != nil {
		return 0, err
	}
	size := stat.Size()
	if size == 0 {
		return 0, nil
	}

	searchBytes := t.maxBytes
	minSearchBytes := int64(tailLines) * 512
	if searchBytes < minSearchBytes {
		searchBytes = minSearchBytes
	}
	if searchBytes > size {
		searchBytes = size
	}

	startSearch := size - searchBytes
	buf := make([]byte, searchBytes)
	n, err := f.ReadAt(buf, startSearch)
	if err != nil && !errors.Is(err, io.EOF) {
		return 0, err
	}
	buf = buf[:n]

	endIdx := len(buf) - 1
	// Skip trailing newline / carriage return of the file so it doesn't count as an empty line after EOF
	if endIdx >= 0 && buf[endIdx] == '\n' {
		endIdx--
		if endIdx >= 0 && buf[endIdx] == '\r' {
			endIdx--
		}
	}

	count := 0
	targetStartInBuf := 0
	found := false

	for i := endIdx; i >= 0; i-- {
		if buf[i] == '\n' {
			count++
			if count == tailLines {
				targetStartInBuf = i + 1
				found = true
				break
			}
		}
	}

	if found {
		return startSearch + int64(targetStartInBuf), nil
	}

	// If the entire file has fewer than or equal to tailLines lines:
	if startSearch == 0 {
		return 0, nil
	}

	// The search window was exhausted before finding tailLines lines.
	// Advance to the next line boundary to avoid yielding a partial sliced line.
	idx := bytes.IndexByte(buf, '\n')
	if idx != -1 {
		return startSearch + int64(idx+1), nil
	}
	return startSearch, nil
}

// follow handles reading from the file descriptor and polling for new content.
func (t *FileTailer) follow(ctx context.Context, initialFile *os.File, path string, ch chan<- string) {
	currentFile := initialFile
	defer func() {
		if currentFile != nil {
			_ = currentFile.Close()
		}
		close(ch)
	}()

	reader := bufio.NewReader(currentFile)
	var pending []byte

	stat, _ := currentFile.Stat()
	var lastSize int64
	if stat != nil {
		lastSize = stat.Size()
	}

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		line, err := reader.ReadString('\n')
		if err == nil {
			var fullLine string
			if len(pending) > 0 {
				fullLine = string(pending) + line
				pending = nil
			} else {
				fullLine = line
			}
			cleanLine := strings.TrimRight(fullLine, "\r\n")
			select {
			case ch <- cleanLine:
			case <-ctx.Done():
				return
			}
			continue
		}

		if errors.Is(err, io.EOF) {
			if len(line) > 0 {
				pending = append(pending, []byte(line)...)
			}

			// Check for file truncation
			curFi, statErr := currentFile.Stat()
			if statErr == nil {
				if curFi.Size() < lastSize {
					// File size shrank (truncated)
					_, _ = currentFile.Seek(0, io.SeekStart)
					reader.Reset(currentFile)
					pending = nil
					lastSize = curFi.Size()
					continue
				}
				lastSize = curFi.Size()
			}

			// Check for file rotation (replacement)
			newFi, statPathErr := os.Stat(path)
			if statPathErr == nil && curFi != nil {
				if !os.SameFile(curFi, newFi) {
					newF, openErr := os.Open(path)
					if openErr == nil {
						_ = currentFile.Close()
						currentFile = newF
						reader.Reset(currentFile)
						pending = nil
						lastSize = newFi.Size()
						continue
					}
				}
			}

			select {
			case <-ctx.Done():
				return
			case <-time.After(t.pollInterval):
			}
			continue
		}

		// Other read errors
		return
	}
}
