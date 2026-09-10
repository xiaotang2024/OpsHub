package e2e_test

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/api"
	"opshub/internal/config"
	"opshub/internal/database"
)

func TestE2E_ServerStartupAndStaticAssetServing(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	cfg := &config.AppConfig{DataDir: tmpDir}
	r := api.SetupRouter(cfg, db)

	// 1. Verify valid API route
	wAPI := httptest.NewRecorder()
	reqAPI, _ := http.NewRequest("GET", "/api/system/health", nil)
	r.ServeHTTP(wAPI, reqAPI)
	assert.Equal(t, http.StatusOK, wAPI.Code)
	assert.Contains(t, wAPI.Header().Get("Content-Type"), "application/json")

	// 2. Verify non-existent API route returns 404 (does not fallback to SPA)
	wAPINotFound := httptest.NewRecorder()
	reqAPINotFound, _ := http.NewRequest("GET", "/api/unknown-endpoint", nil)
	r.ServeHTTP(wAPINotFound, reqAPINotFound)
	assert.Equal(t, http.StatusNotFound, wAPINotFound.Code)
	assert.NotContains(t, wAPINotFound.Header().Get("Content-Type"), "text/html")

	// 3. Verify root path serves index.html
	wRoot := httptest.NewRecorder()
	reqRoot, _ := http.NewRequest("GET", "/", nil)
	r.ServeHTTP(wRoot, reqRoot)
	assert.Equal(t, http.StatusOK, wRoot.Code)
	assert.Contains(t, wRoot.Header().Get("Content-Type"), "text/html")
	assert.Contains(t, wRoot.Body.String(), "OpsHub")
	assert.Contains(t, wRoot.Body.String(), "root")

	// 4. Verify frontend SPA fallback routes
	for _, spaRoute := range []string{"/services", "/templates", "/jdks", "/services/1"} {
		wSPA := httptest.NewRecorder()
		reqSPA, _ := http.NewRequest("GET", spaRoute, nil)
		r.ServeHTTP(wSPA, reqSPA)
		assert.Equal(t, http.StatusOK, wSPA.Code, "route: %s", spaRoute)
		assert.Contains(t, wSPA.Header().Get("Content-Type"), "text/html")
		assert.Contains(t, wSPA.Body.String(), "OpsHub")
		assert.Contains(t, wSPA.Body.String(), "root")
	}

	// 5. Verify direct static asset serving
	wAsset := httptest.NewRecorder()
	reqAsset, _ := http.NewRequest("GET", "/assets/index-Fm-vv9dV.css", nil)
	r.ServeHTTP(wAsset, reqAsset)
	assert.Equal(t, http.StatusOK, wAsset.Code)
	assert.Contains(t, wAsset.Header().Get("Content-Type"), "text/css")
}
