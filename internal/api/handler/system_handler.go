package handler

import (
	"bufio"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"opshub/internal/config"
	"opshub/internal/model"
)

var appStartTime = time.Now()

// SystemHandler provides health check, host metrics, and audit log endpoints.
type SystemHandler struct {
	db  *sql.DB
	cfg *config.AppConfig
}

// NewSystemHandler constructs a new SystemHandler.
func NewSystemHandler(db *sql.DB, cfg *config.AppConfig) *SystemHandler {
	return &SystemHandler{
		db:  db,
		cfg: cfg,
	}
}

// Health returns the platform health status.
// GET /api/system/health
func (h *SystemHandler) Health(c *gin.Context) {
	dbStatus := "UP"
	if h.db != nil {
		if err := h.db.PingContext(c.Request.Context()); err != nil {
			dbStatus = "DOWN"
		}
	} else {
		dbStatus = "DOWN"
	}

	overallStatus := "UP"
	httpCode := http.StatusOK
	if dbStatus == "DOWN" {
		overallStatus = "DEGRADED"
	}

	c.JSON(httpCode, gin.H{
		"status":    overallStatus,
		"database":  dbStatus,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"uptime":    time.Since(appStartTime).String(),
	})
}

// Metrics returns host CPU, memory, and disk usage statistics.
// GET /api/system/metrics
func (h *SystemHandler) Metrics(c *gin.Context) {
	// 1. Disk statistics
	dataDir := "."
	if h.cfg != nil && h.cfg.DataDir != "" {
		dataDir = h.cfg.DataDir
	}
	_ = os.MkdirAll(dataDir, 0755)

	diskTotal, diskFree := getDiskUsage(dataDir)
	diskUsed := diskTotal - diskFree
	diskPercent := 0.0
	if diskTotal > 0 {
		diskPercent = float64(diskUsed) / float64(diskTotal) * 100
	}

	// 2. Memory statistics
	memTotal, memFree := getMemoryUsage()
	memUsed := memTotal - memFree
	memPercent := 0.0
	if memTotal > 0 {
		memPercent = float64(memUsed) / float64(memTotal) * 100
	}

	// 3. CPU & Load
	load1, load5, load15 := getCPULoad()

	c.JSON(http.StatusOK, gin.H{
		"cpu": gin.H{
			"cores":    runtime.NumCPU(),
			"load_1m":  load1,
			"load_5m":  load5,
			"load_15m": load15,
		},
		"memory": gin.H{
			"total_bytes":  memTotal,
			"used_bytes":   memUsed,
			"free_bytes":   memFree,
			"used_percent": mathRound(memPercent, 1),
		},
		"disk": gin.H{
			"data_dir":     dataDir,
			"total_bytes":  diskTotal,
			"used_bytes":   diskUsed,
			"free_bytes":   diskFree,
			"used_percent": mathRound(diskPercent, 1),
		},
		"host": gin.H{
			"os":             runtime.GOOS,
			"arch":           runtime.GOARCH,
			"go_version":     runtime.Version(),
			"num_goroutines": runtime.NumGoroutine(),
			"uptime_seconds": int(time.Since(appStartTime).Seconds()),
		},
	})
}

// AuditLogs queries system audit logs with optional pagination and filtering.
// GET /api/audit-logs
func (h *SystemHandler) AuditLogs(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"items": []model.AuditLog{}, "total": 0})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	operator := strings.TrimSpace(c.Query("operator"))
	targetType := strings.TrimSpace(c.Query("target_type"))
	action := strings.TrimSpace(c.Query("action"))
	status := strings.TrimSpace(c.Query("status"))

	var whereClauses []string
	var args []interface{}

	if operator != "" {
		whereClauses = append(whereClauses, "operator = ?")
		args = append(args, operator)
	}
	if targetType != "" {
		whereClauses = append(whereClauses, "target_type = ?")
		args = append(args, targetType)
	}
	if action != "" {
		whereClauses = append(whereClauses, "action = ?")
		args = append(args, action)
	}
	if status != "" {
		whereClauses = append(whereClauses, "status = ?")
		args = append(args, status)
	}

	whereSQL := ""
	if len(whereClauses) > 0 {
		whereSQL = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM audit_logs %s", whereSQL)
	var total int
	if err := h.db.QueryRowContext(c.Request.Context(), countQuery, args...).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query audit logs count"})
		return
	}

	offset := (page - 1) * pageSize
	listQuery := fmt.Sprintf(`
		SELECT id, operator, client_ip, action, target_type, target_id, details, status, created_at
		FROM audit_logs
		%s
		ORDER BY id DESC
		LIMIT ? OFFSET ?
	`, whereSQL)

	queryArgs := append(args, pageSize, offset)
	rows, err := h.db.QueryContext(c.Request.Context(), listQuery, queryArgs...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query audit logs"})
		return
	}
	defer rows.Close()

	items := make([]model.AuditLog, 0)
	for rows.Next() {
		var log model.AuditLog
		if err := rows.Scan(
			&log.ID,
			&log.Operator,
			&log.ClientIP,
			&log.Action,
			&log.TargetType,
			&log.TargetID,
			&log.Details,
			&log.Status,
			&log.CreatedAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan audit log"})
			return
		}
		items = append(items, log)
	}

	c.JSON(http.StatusOK, gin.H{
		"items":     items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func getDiskUsage(path string) (uint64, uint64) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0
	}
	total := uint64(stat.Blocks) * uint64(stat.Bsize)
	free := uint64(stat.Bavail) * uint64(stat.Bsize)
	return total, free
}

func getMemoryUsage() (uint64, uint64) {
	// Try Linux /proc/meminfo
	if f, err := os.Open("/proc/meminfo"); err == nil {
		defer f.Close()
		var total, available uint64
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				if parts[0] == "MemTotal:" {
					kb, _ := strconv.ParseUint(parts[1], 10, 64)
					total = kb * 1024
				} else if parts[0] == "MemAvailable:" {
					kb, _ := strconv.ParseUint(parts[1], 10, 64)
					available = kb * 1024
				}
			}
		}
		if total > 0 {
			return total, available
		}
	}

	// macOS / BSD fallback via sysctl
	if out, err := exec.Command("sysctl", "-n", "hw.memsize").Output(); err == nil {
		if totalBytes, err := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64); err == nil && totalBytes > 0 {
			var m runtime.MemStats
			runtime.ReadMemStats(&m)
			// Rough estimate of available
			free := totalBytes - m.Sys
			if free > totalBytes {
				free = totalBytes / 2
			}
			return totalBytes, free
		}
	}

	// General fallback
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return m.Sys * 2, m.Sys
}

func getCPULoad() (float64, float64, float64) {
	// Try Linux /proc/loadavg
	if data, err := os.ReadFile("/proc/loadavg"); err == nil {
		parts := strings.Fields(string(data))
		if len(parts) >= 3 {
			l1, _ := strconv.ParseFloat(parts[0], 64)
			l5, _ := strconv.ParseFloat(parts[1], 64)
			l15, _ := strconv.ParseFloat(parts[2], 64)
			return l1, l5, l15
		}
	}

	// macOS / fallback via uptime command
	if out, err := exec.Command("uptime").Output(); err == nil {
		str := string(out)
		if idx := strings.Index(str, "load averages:"); idx != -1 {
			parts := strings.Fields(str[idx+14:])
			if len(parts) >= 3 {
				l1, _ := strconv.ParseFloat(strings.Trim(parts[0], ","), 64)
				l5, _ := strconv.ParseFloat(strings.Trim(parts[1], ","), 64)
				l15, _ := strconv.ParseFloat(strings.Trim(parts[2], ","), 64)
				return l1, l5, l15
			}
		}
	}

	return 0.0, 0.0, 0.0
}

func mathRound(val float64, precision int) float64 {
	p := 1.0
	for i := 0; i < precision; i++ {
		p *= 10
	}
	return float64(int(val*p+0.5)) / p
}
