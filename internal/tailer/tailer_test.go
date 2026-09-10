package tailer_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/tailer"
)

func TestTailer_TailRecentAndFollow(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "test.log")

	f, err := os.Create(logPath)
	require.NoError(t, err)
	for i := 1; i <= 10; i++ {
		_, _ = f.WriteString(fmt.Sprintf("line %d\n", i))
	}
	_ = f.Close()

	tl := tailer.NewTailer(tailer.WithPollInterval(20 * time.Millisecond))
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	ch, err := tl.TailFile(ctx, logPath, 3)
	require.NoError(t, err)

	first := <-ch
	assert.Contains(t, first, "line 8")

	second := <-ch
	assert.Contains(t, second, "line 9")

	third := <-ch
	assert.Contains(t, third, "line 10")

	// Append newly written lines to test follow behavior
	fAppend, err := os.OpenFile(logPath, os.O_APPEND|os.O_WRONLY, 0644)
	require.NoError(t, err)
	_, _ = fAppend.WriteString("line 11\nline 12\n")
	_ = fAppend.Close()

	select {
	case line11 := <-ch:
		assert.Equal(t, "line 11", line11)
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for line 11")
	}

	select {
	case line12 := <-ch:
		assert.Equal(t, "line 12", line12)
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for line 12")
	}
}

func TestTailer_FewerLinesThanRequested(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "short.log")

	err := os.WriteFile(logPath, []byte("line 1\nline 2\n"), 0644)
	require.NoError(t, err)

	tl := tailer.NewTailer(tailer.WithPollInterval(20 * time.Millisecond))
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ch, err := tl.TailFile(ctx, logPath, 10)
	require.NoError(t, err)

	assert.Equal(t, "line 1", <-ch)
	assert.Equal(t, "line 2", <-ch)
}

func TestTailer_ZeroLines(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "zero.log")

	f, err := os.Create(logPath)
	require.NoError(t, err)
	_, _ = f.WriteString("line 1\nline 2\n")
	_ = f.Close()

	tl := tailer.NewTailer(tailer.WithPollInterval(20 * time.Millisecond))
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// tailLines = 0 means follow only from EOF
	ch, err := tl.TailFile(ctx, logPath, 0)
	require.NoError(t, err)

	// Append line 3
	fAppend, err := os.OpenFile(logPath, os.O_APPEND|os.O_WRONLY, 0644)
	require.NoError(t, err)
	_, _ = fAppend.WriteString("line 3\n")
	_ = fAppend.Close()

	select {
	case l := <-ch:
		assert.Equal(t, "line 3", l)
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for line 3")
	}
}

func TestTailer_Truncation(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "trunc.log")

	err := os.WriteFile(logPath, []byte("line 1\nline 2\nline 3\nline 4\nline 5\n"), 0644)
	require.NoError(t, err)

	tl := tailer.NewTailer(tailer.WithPollInterval(20 * time.Millisecond))
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	ch, err := tl.TailFile(ctx, logPath, 2)
	require.NoError(t, err)

	assert.Equal(t, "line 4", <-ch)
	assert.Equal(t, "line 5", <-ch)

	// Truncate file and write fresh lines
	err = os.WriteFile(logPath, []byte("fresh line 1\n"), 0644)
	require.NoError(t, err)

	select {
	case line := <-ch:
		assert.Equal(t, "fresh line 1", line)
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for fresh line after truncation")
	}
}

func TestTailer_FileRotation(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "rotate.log")
	oldPath := filepath.Join(tmpDir, "rotate.log.1")

	err := os.WriteFile(logPath, []byte("old line 1\nold line 2\n"), 0644)
	require.NoError(t, err)

	tl := tailer.NewTailer(tailer.WithPollInterval(20 * time.Millisecond))
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	ch, err := tl.TailFile(ctx, logPath, 2)
	require.NoError(t, err)

	assert.Equal(t, "old line 1", <-ch)
	assert.Equal(t, "old line 2", <-ch)

	// Rotate: rename old file and create new file at logPath
	err = os.Rename(logPath, oldPath)
	require.NoError(t, err)

	err = os.WriteFile(logPath, []byte("new line after rotate\n"), 0644)
	require.NoError(t, err)

	select {
	case line := <-ch:
		assert.Equal(t, "new line after rotate", line)
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for new line after rotation")
	}
}

func TestTailer_LargeFileReverseSeek(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "large.log")

	f, err := os.Create(logPath)
	require.NoError(t, err)
	for i := 1; i <= 500; i++ {
		_, _ = f.WriteString(fmt.Sprintf("log-event-%04d payload-data-%d\n", i, i))
	}
	_ = f.Close()

	tl := tailer.NewTailer(tailer.WithMaxBytes(32*1024), tailer.WithPollInterval(20*time.Millisecond))
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ch, err := tl.TailFile(ctx, logPath, 3)
	require.NoError(t, err)

	assert.Equal(t, "log-event-0498 payload-data-498", <-ch)
	assert.Equal(t, "log-event-0499 payload-data-499", <-ch)
	assert.Equal(t, "log-event-0500 payload-data-500", <-ch)
}

func TestTailer_NonExistentFile(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "nonexistent.log")

	tl := tailer.NewTailer()
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	ch, err := tl.TailFile(ctx, logPath, 10)
	assert.Error(t, err)
	assert.Nil(t, ch)
}

func TestTailer_ContextCancellation(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "cancel.log")

	err := os.WriteFile(logPath, []byte("line 1\n"), 0644)
	require.NoError(t, err)

	tl := tailer.NewTailer(tailer.WithPollInterval(10 * time.Millisecond))
	ctx, cancel := context.WithCancel(context.Background())

	ch, err := tl.TailFile(ctx, logPath, 1)
	require.NoError(t, err)

	assert.Equal(t, "line 1", <-ch)

	// Cancel context and verify channel closes
	cancel()

	select {
	case _, ok := <-ch:
		assert.False(t, ok, "expected channel to be closed upon context cancellation")
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for channel to close")
	}
}
