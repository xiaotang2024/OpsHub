package api

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"opshub/internal/api/handler"
	"opshub/internal/api/middleware"
	"opshub/internal/api/websocket"
	"opshub/internal/config"
	"opshub/internal/prober"
	"opshub/internal/service"
	"opshub/internal/supervisor"
	"opshub/internal/tailer"
	"opshub/internal/template"
)

// RouterOptions allows injecting custom services or supervisors (e.g. for testing).
type RouterOptions struct {
	AuthService       *service.AuthService
	JDKService        *service.JDKService
	ArtifactService   *service.ArtifactService
	DeployPipeline    *service.DeployPipeline
	Supervisor        supervisor.Supervisor
	SystemdSupervisor *supervisor.SystemdSupervisor
	Engine            *template.Engine
	Prober            prober.Prober
	Tailer            tailer.Tailer
	Hub               *websocket.Hub
}

// Option configures RouterOptions.
type Option func(*RouterOptions)

// WithAuthService sets a custom AuthService.
func WithAuthService(svc *service.AuthService) Option {
	return func(o *RouterOptions) {
		o.AuthService = svc
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

// SetupRouter initializes the Gin engine and wires all API routes and middleware.
func SetupRouter(cfg *config.AppConfig, db *sql.DB, opts ...Option) *gin.Engine {
	options := &RouterOptions{}
	for _, opt := range opts {
		opt(options)
	}

	// Resolve dependencies with sane defaults
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
	systemHandler := handler.NewSystemHandler(db, cfg)
	jdkHandler := handler.NewJDKHandler(options.JDKService)
	templateHandler := handler.NewTemplateHandler(db, options.Engine)
	serviceHandler := handler.NewServiceHandler(
		db,
		options.DeployPipeline,
		options.Supervisor,
		options.SystemdSupervisor,
		options.Engine,
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

		// 2. Protected endpoints (Authentication and Audit required)
		protected := apiGroup.Group("")
		protected.Use(middleware.AuthMiddleware(options.AuthService))
		protected.Use(middleware.AuditMiddleware(db))
		{
			// Auth
			protected.POST("/auth/change-password", authHandler.ChangePassword)
			protected.GET("/auth/me", authHandler.Me)

			// System & Audit
			protected.GET("/system/metrics", systemHandler.Metrics)
			protected.GET("/audit-logs", systemHandler.AuditLogs)

			// JDKs
			protected.GET("/jdks", jdkHandler.List)
			protected.POST("/jdks", jdkHandler.Create)
			protected.GET("/jdks/scan", jdkHandler.Scan)
			protected.GET("/jdks/:id", jdkHandler.GetByID)
			protected.DELETE("/jdks/:id", jdkHandler.Delete)

			// Templates
			protected.GET("/templates", templateHandler.List)
			protected.POST("/templates", templateHandler.Create)
			protected.GET("/templates/:id", templateHandler.GetByID)
			protected.PUT("/templates/:id", templateHandler.Update)
			protected.DELETE("/templates/:id", templateHandler.Delete)

			// Services
			protected.GET("/services", serviceHandler.List)
			protected.POST("/services", serviceHandler.Create)
			protected.GET("/services/:id", serviceHandler.GetByID)
			protected.PUT("/services/:id", serviceHandler.Update)
			protected.DELETE("/services/:id", serviceHandler.Delete)
			protected.POST("/services/:id/start", serviceHandler.Start)
			protected.POST("/services/:id/stop", serviceHandler.Stop)
			protected.POST("/services/:id/restart", serviceHandler.Restart)
			protected.GET("/services/:id/configs", serviceHandler.GetConfigs)
			protected.POST("/services/:id/configs", serviceHandler.SaveConfig)
			protected.GET("/services/:id/releases", serviceHandler.Releases)
			protected.POST("/services/:id/deploy", serviceHandler.Deploy)
			protected.POST("/services/:id/rollback", serviceHandler.Rollback)
			protected.GET("/services/:id/metrics", serviceHandler.Metrics)

			// Artifacts
			protected.POST("/services/:id/artifacts", artifactHandler.Upload)
			protected.GET("/services/:id/artifacts", artifactHandler.ListByService)
			protected.DELETE("/services/:id/artifacts/:artifactId", artifactHandler.Delete)
			protected.DELETE("/artifacts/:id", artifactHandler.Delete)

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

	return r
}
