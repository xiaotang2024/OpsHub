package api

import (
	"database/sql"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"opshub"
	"opshub/internal/api/handler"
	"opshub/internal/api/middleware"
	"opshub/internal/api/websocket"
	"opshub/internal/config"
	"opshub/internal/model"
	"opshub/internal/prober"
	"opshub/internal/service"
	"opshub/internal/supervisor"
	"opshub/internal/tailer"
	"opshub/internal/template"
)

// RouterOptions allows injecting custom services or supervisors (e.g. for testing).
type RouterOptions struct {
	AuthService       *service.AuthService
	UserService       *service.UserService
	JDKService        *service.JDKService
	ArtifactService   *service.ArtifactService
	DeployPipeline    *service.DeployPipeline
	Supervisor        supervisor.Supervisor
	SystemdSupervisor *supervisor.SystemdSupervisor
	Engine            *template.Engine
	Prober            prober.Prober
	Tailer            tailer.Tailer
	Hub               *websocket.Hub
	StaticFS          http.FileSystem
}

// Option configures RouterOptions.
type Option func(*RouterOptions)

// WithAuthService sets a custom AuthService.
func WithAuthService(svc *service.AuthService) Option {
	return func(o *RouterOptions) {
		o.AuthService = svc
	}
}

// WithUserService sets a custom UserService.
func WithUserService(svc *service.UserService) Option {
	return func(o *RouterOptions) {
		o.UserService = svc
	}
}

// WithDeployPipeline sets a custom DeployPipeline.
func WithDeployPipeline(pipeline *service.DeployPipeline) Option {
	return func(o *RouterOptions) {
		o.DeployPipeline = pipeline
	}
}

// WithHub sets a custom WebSocket Hub.
func WithHub(hub *websocket.Hub) Option {
	return func(o *RouterOptions) {
		o.Hub = hub
	}
}

// WithStaticFS sets a custom StaticFS.
func WithStaticFS(fs http.FileSystem) Option {
	return func(o *RouterOptions) {
		o.StaticFS = fs
	}
}

// SetupRouter initializes the Gin engine and wires all API routes and middleware.
func SetupRouter(cfg *config.AppConfig, db *sql.DB, opts ...Option) *gin.Engine {
	options := &RouterOptions{}
	for _, opt := range opts {
		opt(options)
	}

	// Resolve dependencies with sane defaults
	if options.StaticFS == nil {
		if sfs, err := opshub.StaticFS(); err == nil {
			options.StaticFS = sfs
		}
	}
	if options.Engine == nil {
		options.Engine = template.NewEngine()
	}
	if options.Supervisor == nil {
		options.Supervisor = supervisor.NewNativeSupervisor()
	}
	if options.SystemdSupervisor == nil {
		options.SystemdSupervisor = supervisor.NewSystemdSupervisor("")
	}
	if options.Prober == nil {
		options.Prober = prober.NewProber()
	}
	if options.AuthService == nil {
		jwtSecret := "opshub-default-jwt-secret-replace-me"
		if cfg != nil && cfg.Server.JWTSecret != "" {
			jwtSecret = cfg.Server.JWTSecret
		}
		options.AuthService = service.NewAuthService(db, jwtSecret)
	}
	if options.UserService == nil {
		options.UserService = service.NewUserService(db)
	}
	if options.JDKService == nil {
		options.JDKService = service.NewJDKService(db)
	}
	if options.ArtifactService == nil {
		pkgDir := "."
		if cfg != nil {
			pkgDir = cfg.PackagesDir()
		}
		options.ArtifactService = service.NewArtifactService(db, pkgDir)
	}
	if options.DeployPipeline == nil {
		options.DeployPipeline = service.NewDeployPipeline(
			db,
			options.Supervisor,
			options.Prober,
			options.Engine,
			options.SystemdSupervisor,
		)
	}
	if options.Tailer == nil {
		options.Tailer = tailer.NewTailer()
	}
	if options.Hub == nil {
		options.Hub = websocket.NewHub(options.Tailer, db)
	}

	// Initialize handlers
	authHandler := handler.NewAuthHandler(options.AuthService)
	userHandler := handler.NewUserHandler(options.UserService)
	systemHandler := handler.NewSystemHandler(db, cfg)
	jdkHandler := handler.NewJDKHandler(options.JDKService)
	templateHandler := handler.NewTemplateHandler(db, options.Engine)
	serviceHandler := handler.NewServiceHandler(
		db,
		options.DeployPipeline,
		options.Supervisor,
		options.SystemdSupervisor,
		options.Engine,
		options.Prober,
	)
	artifactHandler := handler.NewArtifactHandler(options.ArtifactService, db)

	// Create Gin engine
	r := gin.New()
	r.Use(gin.Recovery())

	// CORS middleware
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	})

	apiGroup := r.Group("/api")
	{
		// 1. Public endpoints (No authentication required)
		apiGroup.GET("/system/health", systemHandler.Health)
		apiGroup.POST("/auth/login", authHandler.Login)
		apiGroup.POST("/auth/register", authHandler.Register)
		apiGroup.GET("/auth/security-question", authHandler.GetSecurityQuestion)
		apiGroup.POST("/auth/reset-password", authHandler.ResetPassword)

		// 2. Protected endpoints (Authentication and Audit required)
		protected := apiGroup.Group("")
		protected.Use(middleware.AuthMiddleware(options.AuthService))
		protected.Use(middleware.AuditMiddleware(db))
		{
			// Auth
			protected.POST("/auth/change-password", authHandler.ChangePassword)
			protected.GET("/auth/me", authHandler.Me)
			protected.GET("/auth/profile", authHandler.GetProfile)
			protected.PUT("/auth/profile", authHandler.UpdateProfile)

			// Users (Admin only)
			users := protected.Group("/users")
			users.Use(middleware.RequireAdmin())
			{
				users.GET("", userHandler.List)
				users.POST("", userHandler.Create)
				users.PUT("/:id/permissions", userHandler.UpdatePermissions)
				users.PUT("/:id/status", userHandler.UpdateStatus)
				users.POST("/:id/reset-password", userHandler.ResetPassword)
				users.DELETE("/:id", userHandler.Delete)
			}

			// System & Audit
			protected.GET("/system/metrics", systemHandler.Metrics)
			protected.GET("/audit-logs", systemHandler.AuditLogs)
			protected.GET("/audit-logs/export", systemHandler.ExportAuditLogs)
			protected.DELETE("/audit-logs/:id", middleware.RequireAdmin(), systemHandler.DeleteAuditLog)

			// JDKs
			protected.GET("/jdks", jdkHandler.List)
			protected.POST("/jdks", middleware.RequirePermission(db, model.PermJDKManage), jdkHandler.Create)
			protected.GET("/jdks/scan", jdkHandler.Scan)
			protected.GET("/jdks/:id", jdkHandler.GetByID)
			protected.DELETE("/jdks/:id", middleware.RequirePermission(db, model.PermJDKManage), jdkHandler.Delete)

			// Templates
			protected.GET("/templates", templateHandler.List)
			protected.POST("/templates", middleware.RequirePermission(db, model.PermTemplateManage), templateHandler.Create)
			protected.GET("/templates/:id", templateHandler.GetByID)
			protected.PUT("/templates/:id", middleware.RequirePermission(db, model.PermTemplateManage), templateHandler.Update)
			protected.DELETE("/templates/:id", middleware.RequirePermission(db, model.PermTemplateManage), templateHandler.Delete)

			// Services
			protected.GET("/services", serviceHandler.List)
			protected.POST("/services", serviceHandler.Create)
			protected.GET("/services/:id", serviceHandler.GetByID)
			protected.PUT("/services/:id", serviceHandler.Update)
			protected.DELETE("/services/:id", serviceHandler.Delete)
			protected.POST("/services/:id/start", middleware.RequirePermission(db, model.PermServiceControl), serviceHandler.Start)
			protected.POST("/services/:id/stop", middleware.RequirePermission(db, model.PermServiceControl), serviceHandler.Stop)
			protected.POST("/services/:id/restart", middleware.RequirePermission(db, model.PermServiceControl), serviceHandler.Restart)
			protected.GET("/services/:id/configs", serviceHandler.GetConfigs)
			protected.POST("/services/:id/configs", middleware.RequirePermission(db, model.PermServiceConfig), serviceHandler.SaveConfig)
			protected.POST("/services/:id/configs/rollback", middleware.RequirePermission(db, model.PermServiceConfig), serviceHandler.RollbackConfig)
			protected.DELETE("/services/:id/configs", middleware.RequireAdmin(), serviceHandler.DeleteConfig)
			protected.GET("/services/:id/releases", serviceHandler.Releases)
			protected.GET("/services/:id/deploy-precheck", serviceHandler.DeployPrecheck)
			protected.POST("/services/:id/deploy", middleware.RequirePermission(db, model.PermServiceDeploy), serviceHandler.Deploy)
			protected.POST("/services/:id/rollback", middleware.RequirePermission(db, model.PermServiceRollback), serviceHandler.Rollback)
			protected.GET("/services/:id/metrics", serviceHandler.Metrics)
			protected.GET("/services/:id/template-sync", serviceHandler.GetTemplateSyncDiff)
			protected.POST("/services/:id/template-sync", middleware.RequirePermission(db, model.PermServiceConfig), serviceHandler.SyncTemplate)

			// Artifacts
			protected.POST("/services/:id/artifacts", middleware.RequirePermission(db, model.PermServiceDeploy), artifactHandler.Upload)
			protected.GET("/services/:id/artifacts", artifactHandler.ListByService)
			protected.DELETE("/services/:id/artifacts/:artifactId", middleware.RequireAdmin(), artifactHandler.Delete)
			protected.DELETE("/artifacts/:id", middleware.RequireAdmin(), artifactHandler.Delete)

			// WebSocket Real-time Log Streaming
			protected.GET("/services/:id/logs/ws", func(c *gin.Context) {
				serviceID, err := strconv.Atoi(c.Param("id"))
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
					return
				}
				options.Hub.ServeWS(c.Writer, c.Request, serviceID)
			})
		}
	}

	// Static assets and SPA client-side fallback routes
	if options.StaticFS != nil {
		fileServer := http.FileServer(options.StaticFS)
		r.NoRoute(func(c *gin.Context) {
			reqPath := c.Request.URL.Path
			if reqPath == "/api" || strings.HasPrefix(reqPath, "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
				return
			}

			// Try serving exact static asset if it exists
			cleanPath := strings.TrimPrefix(path.Clean(reqPath), "/")
			if cleanPath != "" && cleanPath != "." {
				if f, err := options.StaticFS.Open(cleanPath); err == nil {
					defer f.Close()
					if stat, err := f.Stat(); err == nil && !stat.IsDir() {
						fileServer.ServeHTTP(c.Writer, c.Request)
						return
					}
				}
			}

			// Fallback to index.html for SPA client routes
			indexFile, err := options.StaticFS.Open("index.html")
			if err != nil {
				c.String(http.StatusNotFound, "index.html not found")
				return
			}
			defer indexFile.Close()

			stat, err := indexFile.Stat()
			if err != nil {
				c.String(http.StatusInternalServerError, "failed to stat index.html")
				return
			}

			c.Header("Content-Type", "text/html; charset=utf-8")
			http.ServeContent(c.Writer, c.Request, "index.html", stat.ModTime(), indexFile)
		})
	}

	return r
}
