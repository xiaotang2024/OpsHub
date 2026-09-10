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

	// 3. Initialize SQLite database
	db, err := database.InitDB(cfg.DBPath())
	if err != nil {
		log.Fatalf("[OpsHub] Failed to initialize database at %s: %v", cfg.DBPath(), err)
	}
	defer db.Close()

	// 4. Initialize admin account if first run
	authSvc := service.NewAuthService(db, cfg.Server.JWTSecret)
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
