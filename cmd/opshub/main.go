package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"opshub/internal/api"
	"opshub/internal/config"
	"opshub/internal/database"
	"opshub/internal/service"
)

func main() {
	configPath := flag.String("config", "", "Path to opshub.yaml configuration file")
	resetPass := flag.String("reset-password", "", "Reset administrator password (e.g. -reset-password=admin123)")
	flag.Parse()

	// 1. Load application configuration
	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("[OpsHub] Failed to load configuration: %v", err)
	}

	// 2. Ensure data directories exist
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		log.Fatalf("[OpsHub] Failed to create data directory %s: %v", cfg.DataDir, err)
	}
	if err := os.MkdirAll(cfg.PackagesDir(), 0755); err != nil {
		log.Fatalf("[OpsHub] Failed to create packages directory %s: %v", cfg.PackagesDir(), err)
	}
	if err := os.MkdirAll(cfg.LogsDir(), 0755); err != nil {
		log.Fatalf("[OpsHub] Failed to create logs directory %s: %v", cfg.LogsDir(), err)
	}

	// 3. Initialize database (sqlite or mysql, based on config)
	dbCfg := cfg.ResolvedDatabaseConfig()
	db, err := database.InitDBWithDriver(dbCfg.Driver, dbCfg.DSN)
	if err != nil {
		log.Fatalf("[OpsHub] Failed to initialize database (driver=%s): %v", dbCfg.Driver, err)
	}
	defer db.Close()
	log.Printf("[OpsHub] Database initialized successfully (driver=%s)", dbCfg.Driver)

	// 4. Initialize admin account if first run
	authSvc := service.NewAuthService(db, cfg.Server.JWTSecret)

	// Reset admin password if requested via CLI
	if *resetPass != "" {
		if err := authSvc.ResetPassword("admin", *resetPass); err != nil {
			log.Fatalf("[OpsHub] Failed to reset admin password: %v", err)
		}
		fmt.Println("==================================================================")
		fmt.Println("             OPSHUB ADMIN PASSWORD RESET SUCCESSFUL")
		fmt.Println("==================================================================")
		fmt.Println("  The administrator password has been updated:")
		fmt.Printf("    Username: admin\n")
		fmt.Printf("    Password: %s\n", *resetPass)
		fmt.Println("==================================================================")
		return
	}

	initialPassword, err := authSvc.InitAdminIfNeeded()
	if err != nil {
		log.Fatalf("[OpsHub] Failed to initialize admin user: %v", err)
	}

	if initialPassword != "" {
		fmt.Println("==================================================================")
		fmt.Println("                   OPSHUB INITIAL SETUP")
		fmt.Println("==================================================================")
		fmt.Println("  A default administrator account has been generated:")
		fmt.Printf("    Username: admin\n")
		fmt.Printf("    Password: %s\n", initialPassword)
		fmt.Println("  Please store this password safely and change it immediately.")
		fmt.Println("==================================================================")
	}

	// 5. Setup main API router
	router := api.SetupRouter(cfg, db)

	// 6. Configure HTTP Server
	serverAddr := fmt.Sprintf(":%d", cfg.Server.Port)
	srv := &http.Server{
		Addr:    serverAddr,
		Handler: router,
	}

	// 7. Start server in background
	go func() {
		log.Printf("[OpsHub] Starting HTTP server on %s", serverAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[OpsHub] Server listen failed: %v", err)
		}
	}()

	// 8. Graceful shutdown on termination signals
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Printf("[OpsHub] Received shutdown signal: %v. Initiating graceful shutdown...", sig)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("[OpsHub] Server forced to shutdown: %v", err)
	}

	log.Println("[OpsHub] Server stopped cleanly.")
}
