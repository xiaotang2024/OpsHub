package api_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"opshub/internal/api"
	"opshub/internal/config"
	"opshub/internal/database"
	"opshub/internal/model"
	"opshub/internal/service"
)

func init() {
	gin.SetMode(gin.TestMode)
}

type testFixture struct {
	cfg       *config.AppConfig
	db        *sql.DB
	authSvc   *service.AuthService
	router    *gin.Engine
	adminPass string
	token     string
	tmpDir    string
}

func setupTestRouter(t *testing.T) *testFixture {
	t.Helper()
	tmpDir := t.TempDir()

	dbPath := filepath.Join(tmpDir, "opshub_test.db")
	db, err := database.InitDB(dbPath)
	require.NoError(t, err)

	cfg := &config.AppConfig{
		Server: config.ServerConfig{
			Port:      8080,
			JWTSecret: "test-jwt-secret-key-12345",
		},
		DataDir: tmpDir,
	}

	authSvc := service.NewAuthService(db, cfg.Server.JWTSecret)
	adminPass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)
	require.NotEmpty(t, adminPass)

	token, err := authSvc.Login("admin", adminPass)
	require.NoError(t, err)
	require.NotEmpty(t, token)

	r := api.SetupRouter(cfg, db)

	f := &testFixture{
		cfg:       cfg,
		db:        db,
		authSvc:   authSvc,
		router:    r,
		adminPass: adminPass,
		token:     token,
		tmpDir:    tmpDir,
	}
	t.Cleanup(func() {
		_ = db.Close()
	})
	return f
}

func doRequest(r *gin.Engine, method, path, token string, body io.Reader, contentType ...string) *httptest.ResponseRecorder {
	req, _ := http.NewRequest(method, path, body)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if len(contentType) > 0 {
		req.Header.Set("Content-Type", contentType[0])
	} else if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRouter_HealthCheckEndpoint(t *testing.T) {
	f := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/system/health", nil)
	f.router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "UP")
}

func TestRouter_AuthFlow(t *testing.T) {
	f := setupTestRouter(t)

	// 1. Successful Login
	loginBody := bytes.NewBufferString(fmt.Sprintf(`{"username":"admin","password":"%s"}`, f.adminPass))
	wLogin := doRequest(f.router, "POST", "/api/auth/login", "", loginBody)
	assert.Equal(t, http.StatusOK, wLogin.Code)
	var loginResp map[string]interface{}
	err := json.Unmarshal(wLogin.Body.Bytes(), &loginResp)
	require.NoError(t, err)
	newToken, ok := loginResp["token"].(string)
	assert.True(t, ok)
	assert.NotEmpty(t, newToken)

	// 2. Failed Login
	badLogin := bytes.NewBufferString(`{"username":"admin","password":"wrong-password"}`)
	wBad := doRequest(f.router, "POST", "/api/auth/login", "", badLogin)
	assert.Equal(t, http.StatusUnauthorized, wBad.Code)

	// 3. /api/auth/me with valid token
	wMe := doRequest(f.router, "GET", "/api/auth/me", f.token, nil)
	assert.Equal(t, http.StatusOK, wMe.Code)
	assert.Contains(t, wMe.Body.String(), "admin")

	// 4. /api/auth/me without token -> 401
	wNoAuth := doRequest(f.router, "GET", "/api/auth/me", "", nil)
	assert.Equal(t, http.StatusUnauthorized, wNoAuth.Code)

	// 5. Change password
	changeBody := bytes.NewBufferString(fmt.Sprintf(`{"old_password":"%s","new_password":"new-secret-password-1"}`, f.adminPass))
	wChange := doRequest(f.router, "POST", "/api/auth/change-password", f.token, changeBody)
	assert.Equal(t, http.StatusOK, wChange.Code)

	// Old password should fail
	wOldFail := doRequest(f.router, "POST", "/api/auth/login", "", bytes.NewBufferString(fmt.Sprintf(`{"username":"admin","password":"%s"}`, f.adminPass)))
	assert.Equal(t, http.StatusUnauthorized, wOldFail.Code)

	// New password should succeed
	wNewPass := doRequest(f.router, "POST", "/api/auth/login", "", bytes.NewBufferString(`{"username":"admin","password":"new-secret-password-1"}`))
	assert.Equal(t, http.StatusOK, wNewPass.Code)
}

func TestRouter_RegisterResetAndProfile(t *testing.T) {
	f := setupTestRouter(t)

	// 1. Register new operator
	regPayload := `{
		"username": "tester_ops",
		"password": "opsPassword123",
		"nickname": "测试运维员",
		"email": "tester@opshub.dev",
		"security_question": "最喜欢的编程语言？",
		"security_answer": "Golang"
	}`
	wReg := doRequest(f.router, "POST", "/api/auth/register", "", bytes.NewBufferString(regPayload))
	assert.Equal(t, http.StatusCreated, wReg.Code)

	var regResp map[string]interface{}
	err := json.Unmarshal(wReg.Body.Bytes(), &regResp)
	require.NoError(t, err)
	opsToken, ok := regResp["token"].(string)
	assert.True(t, ok)
	assert.NotEmpty(t, opsToken)

	// 2. View Profile with opsToken
	wProfile := doRequest(f.router, "GET", "/api/auth/profile", opsToken, nil)
	assert.Equal(t, http.StatusOK, wProfile.Code)
	var profile map[string]interface{}
	err = json.Unmarshal(wProfile.Body.Bytes(), &profile)
	require.NoError(t, err)
	assert.Equal(t, "tester_ops", profile["username"])
	assert.Equal(t, "测试运维员", profile["nickname"])
	assert.Equal(t, "tester@opshub.dev", profile["email"])
	assert.Equal(t, "operator", profile["role"])

	// 3. Update Profile
	updatePayload := `{"nickname":"高级运维专家","email":"senior_ops@opshub.dev"}`
	wUpdate := doRequest(f.router, "PUT", "/api/auth/profile", opsToken, bytes.NewBufferString(updatePayload))
	assert.Equal(t, http.StatusOK, wUpdate.Code)

	// Verify update in Me endpoint
	wMe := doRequest(f.router, "GET", "/api/auth/me", opsToken, nil)
	assert.Equal(t, http.StatusOK, wMe.Code)
	assert.Contains(t, wMe.Body.String(), "高级运维专家")

	// 4. Get Security Question
	wQ := doRequest(f.router, "GET", "/api/auth/security-question?username=tester_ops", "", nil)
	assert.Equal(t, http.StatusOK, wQ.Code)
	var qResp map[string]interface{}
	err = json.Unmarshal(wQ.Body.Bytes(), &qResp)
	require.NoError(t, err)
	assert.Equal(t, "最喜欢的编程语言？", qResp["security_question"])

	// 5. Reset Password with Security Answer
	resetPayload := `{
		"username": "tester_ops",
		"security_answer": "golang",
		"new_password": "newSecureOpsPass999"
	}`
	wReset := doRequest(f.router, "POST", "/api/auth/reset-password", "", bytes.NewBufferString(resetPayload))
	assert.Equal(t, http.StatusOK, wReset.Code)

	// Old pass fails
	wFail := doRequest(f.router, "POST", "/api/auth/login", "", bytes.NewBufferString(`{"username":"tester_ops","password":"opsPassword123"}`))
	assert.Equal(t, http.StatusUnauthorized, wFail.Code)

	// New pass succeeds
	wSuccess := doRequest(f.router, "POST", "/api/auth/login", "", bytes.NewBufferString(`{"username":"tester_ops","password":"newSecureOpsPass999"}`))
	assert.Equal(t, http.StatusOK, wSuccess.Code)
}

func TestRouter_SystemMetricsAndAuditLogs(t *testing.T) {
	f := setupTestRouter(t)

	// 1. System Metrics
	wMetrics := doRequest(f.router, "GET", "/api/system/metrics", f.token, nil)
	assert.Equal(t, http.StatusOK, wMetrics.Code)
	var metrics map[string]interface{}
	err := json.Unmarshal(wMetrics.Body.Bytes(), &metrics)
	require.NoError(t, err)
	assert.Contains(t, metrics, "cpu")
	assert.Contains(t, metrics, "memory")
	assert.Contains(t, metrics, "disk")
	assert.Contains(t, metrics, "host")

	// 2. Audit Logs
	wAudit := doRequest(f.router, "GET", "/api/audit-logs?page=1&page_size=10", f.token, nil)
	assert.Equal(t, http.StatusOK, wAudit.Code)
	var auditResp map[string]interface{}
	err = json.Unmarshal(wAudit.Body.Bytes(), &auditResp)
	require.NoError(t, err)
	assert.Contains(t, auditResp, "items")
	assert.Contains(t, auditResp, "total")
}

func TestRouter_JDKManagement(t *testing.T) {
	f := setupTestRouter(t)

	// 1. Scan JDKs
	wScan := doRequest(f.router, "GET", "/api/jdks/scan", f.token, nil)
	assert.Equal(t, http.StatusOK, wScan.Code)

	// 2. Register JDK
	jdkDir := filepath.Join(f.tmpDir, "fake-jdk")
	binDir := filepath.Join(jdkDir, "bin")
	require.NoError(t, os.MkdirAll(binDir, 0755))
	fakeJava := filepath.Join(binDir, "java")
	require.NoError(t, os.WriteFile(fakeJava, []byte("#!/bin/sh\nexit 0\n"), 0755))

	createBody := bytes.NewBufferString(fmt.Sprintf(`{
		"name": "Custom JDK 17",
		"java_home": "%s",
		"bin_path": "%s",
		"version_str": "17.0.9",
		"is_system": false
	}`, jdkDir, fakeJava))

	wCreate := doRequest(f.router, "POST", "/api/jdks", f.token, createBody)
	assert.Equal(t, http.StatusCreated, wCreate.Code)
	var created model.JDKAsset
	require.NoError(t, json.Unmarshal(wCreate.Body.Bytes(), &created))
	assert.Equal(t, "Custom JDK 17", created.Name)
	assert.True(t, created.ID > 0)

	// 3. Get JDK by ID
	wGet := doRequest(f.router, "GET", fmt.Sprintf("/api/jdks/%d", created.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wGet.Code)
	var fetched model.JDKAsset
	require.NoError(t, json.Unmarshal(wGet.Body.Bytes(), &fetched))
	assert.Equal(t, created.ID, fetched.ID)

	// 4. List JDKs
	wList := doRequest(f.router, "GET", "/api/jdks", f.token, nil)
	assert.Equal(t, http.StatusOK, wList.Code)
	var list []model.JDKAsset
	require.NoError(t, json.Unmarshal(wList.Body.Bytes(), &list))
	assert.Len(t, list, 1)

	// 5. Delete JDK
	wDel := doRequest(f.router, "DELETE", fmt.Sprintf("/api/jdks/%d", created.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wDel.Code)

	// Verify not found after delete
	wGetAfter := doRequest(f.router, "GET", fmt.Sprintf("/api/jdks/%d", created.ID), f.token, nil)
	assert.Equal(t, http.StatusNotFound, wGetAfter.Code)
}

func TestRouter_TemplateCRUD(t *testing.T) {
	f := setupTestRouter(t)

	// 1. Create template
	tplJSON := `{
		"name": "Spring Boot Jar",
		"type": "java_jar",
		"install_dir_pattern": "/opt/apps/${SERVICE_NAME}",
		"jvm_options": "{\"heap_min\":\"512m\",\"heap_max\":\"1g\",\"gc\":\"G1\"}",
		"supervision_mode": "native",
		"health_check_config": "{\"type\":\"process\"}"
	}`
	wCreate := doRequest(f.router, "POST", "/api/templates", f.token, bytes.NewBufferString(tplJSON))
	assert.Equal(t, http.StatusCreated, wCreate.Code)
	var created model.Template
	require.NoError(t, json.Unmarshal(wCreate.Body.Bytes(), &created))
	assert.Equal(t, "Spring Boot Jar", created.Name)

	// 2. List templates
	wList := doRequest(f.router, "GET", "/api/templates", f.token, nil)
	assert.Equal(t, http.StatusOK, wList.Code)
	var list []model.Template
	require.NoError(t, json.Unmarshal(wList.Body.Bytes(), &list))
	assert.Len(t, list, 1)

	// 3. Get template by ID
	wGet := doRequest(f.router, "GET", fmt.Sprintf("/api/templates/%d", created.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wGet.Code)

	// 4. Update template
	updateJSON := `{
		"name": "Spring Boot Jar V2",
		"type": "java_jar",
		"install_dir_pattern": "/opt/apps/${SERVICE_NAME}",
		"jvm_options": "{\"heap_min\":\"1g\",\"heap_max\":\"2g\",\"gc\":\"G1\"}",
		"supervision_mode": "native"
	}`
	wUpdate := doRequest(f.router, "PUT", fmt.Sprintf("/api/templates/%d", created.ID), f.token, bytes.NewBufferString(updateJSON))
	assert.Equal(t, http.StatusOK, wUpdate.Code)
	var updated model.Template
	require.NoError(t, json.Unmarshal(wUpdate.Body.Bytes(), &updated))
	assert.Equal(t, "Spring Boot Jar V2", updated.Name)

	// 5. Delete template
	wDel := doRequest(f.router, "DELETE", fmt.Sprintf("/api/templates/%d", created.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wDel.Code)

	wGetAfter := doRequest(f.router, "GET", fmt.Sprintf("/api/templates/%d", created.ID), f.token, nil)
	assert.Equal(t, http.StatusNotFound, wGetAfter.Code)
}

func TestRouter_ServiceLifecycleAndConfigs(t *testing.T) {
	f := setupTestRouter(t)

	// 1. Create Template first
	tplJSON := `{
		"name": "Service Test Template",
		"type": "java_jar",
		"install_dir_pattern": "` + filepath.Join(f.tmpDir, "apps", "${SERVICE_NAME}") + `",
		"supervision_mode": "native"
	}`
	wTpl := doRequest(f.router, "POST", "/api/templates", f.token, bytes.NewBufferString(tplJSON))
	require.Equal(t, http.StatusCreated, wTpl.Code)
	var tpl model.Template
	require.NoError(t, json.Unmarshal(wTpl.Body.Bytes(), &tpl))

	// 2. Create Service
	svcDir := filepath.Join(f.tmpDir, "apps", "order-api")
	svcJSON := fmt.Sprintf(`{
		"name": "order-api",
		"template_id": %d,
		"install_dir": "%s",
		"port": 8081,
		"supervision_mode": "native"
	}`, tpl.ID, svcDir)

	wSvc := doRequest(f.router, "POST", "/api/services", f.token, bytes.NewBufferString(svcJSON))
	require.Equal(t, http.StatusCreated, wSvc.Code)
	var svc model.Service
	require.NoError(t, json.Unmarshal(wSvc.Body.Bytes(), &svc))
	assert.Equal(t, "order-api", svc.Name)
	assert.Equal(t, model.ServiceStatusStopped, svc.Status)

	// Verify template cannot be deleted while in use
	wDelTplInUse := doRequest(f.router, "DELETE", fmt.Sprintf("/api/templates/%d", tpl.ID), f.token, nil)
	assert.Equal(t, http.StatusBadRequest, wDelTplInUse.Code)

	// 3. List and Get Service
	wList := doRequest(f.router, "GET", "/api/services", f.token, nil)
	assert.Equal(t, http.StatusOK, wList.Code)

	wGet := doRequest(f.router, "GET", fmt.Sprintf("/api/services/%d", svc.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wGet.Code)

	// 4. Update Service
	updateJSON := fmt.Sprintf(`{
		"name": "order-api",
		"template_id": %d,
		"install_dir": "%s",
		"port": 8082,
		"supervision_mode": "native"
	}`, tpl.ID, svcDir)
	wUpdate := doRequest(f.router, "PUT", fmt.Sprintf("/api/services/%d", svc.ID), f.token, bytes.NewBufferString(updateJSON))
	assert.Equal(t, http.StatusOK, wUpdate.Code)

	// 5. Config Management: Save & Auto-backup
	require.NoError(t, os.MkdirAll(svcDir, 0755))
	configSave1 := `{"file": "application.yml", "content": "server:\n  port: 8082\n"}`
	wConfig1 := doRequest(f.router, "POST", fmt.Sprintf("/api/services/%d/configs", svc.ID), f.token, bytes.NewBufferString(configSave1))
	assert.Equal(t, http.StatusOK, wConfig1.Code)

	// Save modified content -> auto backup should trigger
	configSave2 := `{"file": "application.yml", "content": "server:\n  port: 8083\n"}`
	wConfig2 := doRequest(f.router, "POST", fmt.Sprintf("/api/services/%d/configs", svc.ID), f.token, bytes.NewBufferString(configSave2))
	assert.Equal(t, http.StatusOK, wConfig2.Code)
	assert.FileExists(t, filepath.Join(svcDir, "application.yml.bak"))

	// Read config file
	wReadConfig := doRequest(f.router, "GET", fmt.Sprintf("/api/services/%d/configs?file=application.yml", svc.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wReadConfig.Code)
	assert.Contains(t, wReadConfig.Body.String(), "port: 8083")

	// List config files
	wListConfigs := doRequest(f.router, "GET", fmt.Sprintf("/api/services/%d/configs", svc.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wListConfigs.Code)
	assert.Contains(t, wListConfigs.Body.String(), "application.yml")

	// 6. Service metrics endpoint
	wMetrics := doRequest(f.router, "GET", fmt.Sprintf("/api/services/%d/metrics", svc.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wMetrics.Code)
	assert.Contains(t, wMetrics.Body.String(), "stopped")

	// 7. Releases endpoint (empty initially)
	wReleases := doRequest(f.router, "GET", fmt.Sprintf("/api/services/%d/releases", svc.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wReleases.Code)

	// 8. Delete Service
	wDelSvc := doRequest(f.router, "DELETE", fmt.Sprintf("/api/services/%d", svc.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wDelSvc.Code)
}

func TestRouter_ArtifactUploadAndManagement(t *testing.T) {
	f := setupTestRouter(t)

	// Create Template and Service
	_, err := f.db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode) 
		VALUES (10, 'tpl', 'java_jar', '/opt/app', 'native')`)
	require.NoError(t, err)

	_, err = f.db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (10, 'art-svc', 10, '` + filepath.Join(f.tmpDir, "art-svc") + `', 'native', 'STOPPED')`)
	require.NoError(t, err)

	// 1. Multipart Form Upload
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "app-v1.jar")
	require.NoError(t, err)
	_, _ = part.Write([]byte("fake-jar-binary-content-12345"))
	_ = writer.WriteField("version_tag", "v1.0.0")
	_ = writer.Close()

	wUpload := doRequest(f.router, "POST", "/api/services/10/artifacts", f.token, body, writer.FormDataContentType())
	assert.Equal(t, http.StatusCreated, wUpload.Code)
	var art model.Artifact
	require.NoError(t, json.Unmarshal(wUpload.Body.Bytes(), &art))
	assert.Equal(t, "app-v1.jar", art.Filename)
	assert.Equal(t, "v1.0.0", art.VersionTag)

	// 2. List Artifacts
	wList := doRequest(f.router, "GET", "/api/services/10/artifacts", f.token, nil)
	assert.Equal(t, http.StatusOK, wList.Code)
	var list []model.Artifact
	require.NoError(t, json.Unmarshal(wList.Body.Bytes(), &list))
	assert.Len(t, list, 1)

	// 3. Delete Artifact
	wDel := doRequest(f.router, "DELETE", fmt.Sprintf("/api/services/10/artifacts/%d", art.ID), f.token, nil)
	assert.Equal(t, http.StatusOK, wDel.Code)

	// Verify artifact list is now empty
	wListAfter := doRequest(f.router, "GET", "/api/services/10/artifacts", f.token, nil)
	assert.Equal(t, http.StatusOK, wListAfter.Code)
	var listAfter []model.Artifact
	require.NoError(t, json.Unmarshal(wListAfter.Body.Bytes(), &listAfter))
	assert.Empty(t, listAfter)
}

func TestRouter_WebSocketLogStreaming(t *testing.T) {
	f := setupTestRouter(t)

	// Setup service with log file
	svcDir := filepath.Join(f.tmpDir, "log-svc")
	logDir := filepath.Join(svcDir, "logs")
	require.NoError(t, os.MkdirAll(logDir, 0755))

	logFile := filepath.Join(logDir, "console.log")
	require.NoError(t, os.WriteFile(logFile, []byte("line 1\nline 2\nline 3\n"), 0644))

	_, err := f.db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode) 
		VALUES (20, 'tpl2', 'java_jar', '`+svcDir+`', 'native')`)
	require.NoError(t, err)

	_, err = f.db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (20, 'log-svc', 20, '`+svcDir+`', 'native', 'RUNNING')`)
	require.NoError(t, err)

	// Start test HTTP server with our router
	ts := httptest.NewServer(f.router)
	defer ts.Close()

	// Connect to WebSocket with ?token=<token>
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + fmt.Sprintf("/api/services/20/logs/ws?token=%s&tail=3", f.token)
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()
	assert.Equal(t, http.StatusSwitchingProtocols, resp.StatusCode)

	// Read initial lines
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)
	assert.Contains(t, string(msg), "line")
}

func TestRouter_ServiceRestartSingleResponse(t *testing.T) {
	f := setupTestRouter(t)

	// Create template & service with a fake runnable jar
	svcDir := filepath.Join(f.tmpDir, "restart-svc")
	require.NoError(t, os.MkdirAll(svcDir, 0755))
	jarFile := filepath.Join(svcDir, "app.jar")
	require.NoError(t, os.WriteFile(jarFile, []byte("fake-jar"), 0644))

	_, err := f.db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, start_cmd) 
		VALUES (30, 'tpl-restart', 'java_jar', '`+svcDir+`', 'native', 'sleep 10')`)
	require.NoError(t, err)

	_, err = f.db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (30, 'restart-svc', 30, '`+svcDir+`', 'native', 'STOPPED')`)
	require.NoError(t, err)

	// Start service
	wStart := doRequest(f.router, "POST", "/api/services/30/start", f.token, nil)
	assert.Equal(t, http.StatusOK, wStart.Code)

	// Restart service
	wRestart := doRequest(f.router, "POST", "/api/services/30/restart", f.token, nil)
	assert.Equal(t, http.StatusOK, wRestart.Code)

	// Verify exactly ONE JSON object is present (no duplicate {...}{...} response)
	dec := json.NewDecoder(bytes.NewReader(wRestart.Body.Bytes()))
	var svc model.Service
	err = dec.Decode(&svc)
	require.NoError(t, err)
	assert.Equal(t, model.ServiceStatusRunning, svc.Status)
	assert.False(t, dec.More(), "expected exactly one JSON response payload from restart endpoint")

	// Cleanup
	_ = doRequest(f.router, "POST", "/api/services/30/stop", f.token, nil)
}

func TestRouter_ServiceUpdate_PreserveInstallDirAndTemplateValidation(t *testing.T) {
	f := setupTestRouter(t)

	// Create two templates
	_, err := f.db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode) 
		VALUES (40, 'tpl-40', 'java_jar', '/opt/apps/40', 'native'), (41, 'tpl-41', 'java_jar', '/opt/apps/41', 'native')`)
	require.NoError(t, err)

	initialInstallDir := filepath.Join(f.tmpDir, "initial-install-dir")
	_, err = f.db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (40, 'svc-40', 40, '`+initialInstallDir+`', 'native', 'STOPPED')`)
	require.NoError(t, err)

	// 1. Update with empty install_dir -> should preserve existing install_dir
	updatePayload1 := `{"name": "svc-40-renamed", "install_dir": ""}`
	wUpdate1 := doRequest(f.router, "PUT", "/api/services/40", f.token, bytes.NewBufferString(updatePayload1))
	assert.Equal(t, http.StatusOK, wUpdate1.Code)
	var updated1 model.Service
	require.NoError(t, json.Unmarshal(wUpdate1.Body.Bytes(), &updated1))
	assert.Equal(t, "svc-40-renamed", updated1.Name)
	assert.Equal(t, initialInstallDir, updated1.InstallDir)

	// 2. Update with invalid template_id -> 400 Bad Request
	updatePayload2 := `{"name": "svc-40-renamed", "template_id": 99999}`
	wUpdate2 := doRequest(f.router, "PUT", "/api/services/40", f.token, bytes.NewBufferString(updatePayload2))
	assert.Equal(t, http.StatusBadRequest, wUpdate2.Code)

	// 3. Update with valid template_id (41) -> updates successfully
	updatePayload3 := `{"name": "svc-40-renamed", "template_id": 41}`
	wUpdate3 := doRequest(f.router, "PUT", "/api/services/40", f.token, bytes.NewBufferString(updatePayload3))
	assert.Equal(t, http.StatusOK, wUpdate3.Code)
	var updated3 model.Service
	require.NoError(t, json.Unmarshal(wUpdate3.Body.Bytes(), &updated3))
	assert.Equal(t, int64(41), updated3.TemplateID)
}

func TestRouter_ConfigRelativeInstallDirValidation(t *testing.T) {
	f := setupTestRouter(t)

	_, err := f.db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode) 
		VALUES (50, 'tpl-50', 'java_jar', '/opt/apps/50', 'native')`)
	require.NoError(t, err)

	// Relative install_dir
	_, err = f.db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (50, 'svc-50', 50, 'relative/dir', 'native', 'STOPPED')`)
	require.NoError(t, err)

	// GET config with relative install_dir should fail with 400
	wGet := doRequest(f.router, "GET", "/api/services/50/configs?file=app.yml", f.token, nil)
	assert.Equal(t, http.StatusBadRequest, wGet.Code)
	assert.Contains(t, wGet.Body.String(), "install_dir is invalid or not an absolute path")

	// POST config with relative install_dir should fail with 400
	wSave := doRequest(f.router, "POST", "/api/services/50/configs", f.token, bytes.NewBufferString(`{"file":"app.yml","content":"foo: bar"}`))
	assert.Equal(t, http.StatusBadRequest, wSave.Code)
	assert.Contains(t, wSave.Body.String(), "install_dir is invalid or not an absolute path")
}

func TestRouter_CORSCredentialsAndOrigin(t *testing.T) {
	f := setupTestRouter(t)

	origin := "https://console.opshub.internal"

	// 1. GET with Origin header
	req, _ := http.NewRequest("GET", "/api/system/health", nil)
	req.Header.Set("Origin", origin)
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, origin, w.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"))

	// 2. OPTIONS preflight with Origin header
	reqOptions, _ := http.NewRequest("OPTIONS", "/api/services", nil)
	reqOptions.Header.Set("Origin", origin)
	wOptions := httptest.NewRecorder()
	f.router.ServeHTTP(wOptions, reqOptions)

	assert.Equal(t, http.StatusNoContent, wOptions.Code)
	assert.Equal(t, origin, wOptions.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "true", wOptions.Header().Get("Access-Control-Allow-Credentials"))
}

func TestRouter_DeployPrecheck(t *testing.T) {
	f := setupTestRouter(t)

	// Create a template
	_, err := f.db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode) 
		VALUES (100, 'tpl-deploy', 'java_jar', '/opt/apps/100', 'native')`)
	require.NoError(t, err)

	// 1. Unauthenticated request -> 401
	wUnauth := doRequest(f.router, "GET", "/api/services/100/deploy-precheck", "", nil)
	assert.Equal(t, http.StatusUnauthorized, wUnauth.Code)

	// 2. Viewer role request -> has_permission: false
	now := time.Now()
	viewerClaims := service.Claims{
		Username: "viewerUser",
		Role:     "viewer",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			Subject:   "viewerUser",
		},
	}
	viewerTokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, viewerClaims)
	viewerToken, err := viewerTokenObj.SignedString([]byte(f.cfg.Server.JWTSecret))
	require.NoError(t, err)

	wViewer := doRequest(f.router, "GET", "/api/services/100/deploy-precheck", viewerToken, nil)
	assert.Equal(t, http.StatusOK, wViewer.Code)
	var viewerResp map[string]interface{}
	require.NoError(t, json.Unmarshal(wViewer.Body.Bytes(), &viewerResp))
	assert.Equal(t, false, viewerResp["has_permission"])
	assert.Equal(t, "user_role_permission", viewerResp["type"])

	// 3. Service not found -> 404
	wNotFound := doRequest(f.router, "GET", "/api/services/9999/deploy-precheck", f.token, nil)
	assert.Equal(t, http.StatusNotFound, wNotFound.Code)

	// 4. Service with empty install_dir -> has_permission: false
	_, err = f.db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (101, 'svc-no-dir', 100, '', 'native', 'STOPPED')`)
	require.NoError(t, err)
	wEmptyDir := doRequest(f.router, "GET", "/api/services/101/deploy-precheck", f.token, nil)
	assert.Equal(t, http.StatusOK, wEmptyDir.Code)
	var emptyDirResp map[string]interface{}
	require.NoError(t, json.Unmarshal(wEmptyDir.Body.Bytes(), &emptyDirResp))
	assert.Equal(t, false, emptyDirResp["has_permission"])
	assert.Equal(t, "directory_permission", emptyDirResp["type"])

	// 5. Service with writable install_dir (inside TempDir) -> has_permission: true
	validInstallDir := filepath.Join(f.tmpDir, "svc-valid")
	_, err = f.db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (102, 'svc-valid', 100, ?, 'native', 'STOPPED')`, validInstallDir)
	require.NoError(t, err)
	wValid := doRequest(f.router, "GET", "/api/services/102/deploy-precheck", f.token, nil)
	assert.Equal(t, http.StatusOK, wValid.Code)
	var validResp map[string]interface{}
	require.NoError(t, json.Unmarshal(wValid.Body.Bytes(), &validResp))
	assert.Equal(t, true, validResp["has_permission"])
	assert.Equal(t, true, validResp["can_deploy"])
	assert.Equal(t, validInstallDir, validResp["install_dir"])

	// 6. Service with non-writable install_dir
	invalidInstallDir := "/root/opshub_perm_test_denied_123"
	_, err = f.db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (103, 'svc-denied', 100, ?, 'native', 'STOPPED')`, invalidInstallDir)
	require.NoError(t, err)
	wDenied := doRequest(f.router, "GET", "/api/services/103/deploy-precheck", f.token, nil)
	assert.Equal(t, http.StatusOK, wDenied.Code)
	var deniedResp map[string]interface{}
	require.NoError(t, json.Unmarshal(wDenied.Body.Bytes(), &deniedResp))
	assert.Equal(t, false, deniedResp["has_permission"])
	assert.Contains(t, deniedResp["error"].(string), "无法创建安装目录")
	assert.Contains(t, deniedResp["suggestion"].(string), "sudo mkdir -p")
}


