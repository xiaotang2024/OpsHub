package model_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/model"
)

func TestModelJSONSerialization(t *testing.T) {
	now := time.Now().Truncate(time.Second)

	// JDKAsset
	jdk := model.JDKAsset{
		ID:         1,
		Name:       "OpenJDK-17",
		JavaHome:   "/usr/lib/jvm/java-17",
		BinPath:    "/usr/lib/jvm/java-17/bin/java",
		VersionStr: "17.0.9",
		IsSystem:   true,
		CreatedAt:  now,
	}
	jdkBytes, err := json.Marshal(jdk)
	require.NoError(t, err)
	var jdkUnmarshaled model.JDKAsset
	require.NoError(t, json.Unmarshal(jdkBytes, &jdkUnmarshaled))
	assert.Equal(t, jdk.Name, jdkUnmarshaled.Name)
	assert.Equal(t, jdk.IsSystem, jdkUnmarshaled.IsSystem)

	// Template
	jdkID := int64(1)
	tpl := model.Template{
		ID:                1,
		Name:              "Standard-Spring-Boot",
		Type:              model.TemplateTypeJavaJar,
		DefaultJDKID:      &jdkID,
		InstallDirPattern: "/opt/apps/${SERVICE_NAME}",
		JVMOptions:        `{"heap_min":"512m"}`,
		EnvVars:           `{"ENV":"prod"}`,
		SupervisionMode:   model.SupervisionModeNative,
		StartCmd:          "run.sh",
		StopCmd:           "stop.sh",
		HealthCheckConfig: `{"type":"http","port":8080}`,
		UninstallRules:    `{"clean_files":true}`,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	tplBytes, err := json.Marshal(tpl)
	require.NoError(t, err)
	var tplUnmarshaled model.Template
	require.NoError(t, json.Unmarshal(tplBytes, &tplUnmarshaled))
	assert.Equal(t, tpl.Name, tplUnmarshaled.Name)
	assert.Equal(t, *tpl.DefaultJDKID, *tplUnmarshaled.DefaultJDKID)

	// Service
	artifactID := int64(10)
	svc := model.Service{
		ID:                1,
		Name:              "order-service",
		TemplateID:        1,
		JDKID:             &jdkID,
		InstallDir:        "/opt/apps/order-service",
		Port:              8080,
		JVMOptions:        `{"heap_max":"2048m"}`,
		EnvVars:           `{"PORT":"8080"}`,
		SupervisionMode:   model.SupervisionModeNative,
		Status:                model.ServiceStatusRunning,
		CurrentArtifactID:     &artifactID,
		PID:                   12345,
		HealthCheckConfig:     `{"type":"http","port":8080}`,
		TemplateSyncIgnoredAt: &now,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	svcBytes, err := json.Marshal(svc)
	require.NoError(t, err)
	var svcUnmarshaled model.Service
	require.NoError(t, json.Unmarshal(svcBytes, &svcUnmarshaled))
	assert.Equal(t, svc.Name, svcUnmarshaled.Name)
	assert.Equal(t, svc.Port, svcUnmarshaled.Port)
	assert.Equal(t, svc.HealthCheckConfig, svcUnmarshaled.HealthCheckConfig)
	assert.NotNil(t, svcUnmarshaled.TemplateSyncIgnoredAt)

	// Artifact
	art := model.Artifact{
		ID:          10,
		ServiceID:   1,
		Filename:    "order-service-1.0.0.jar",
		FileSize:    102400,
		SHA256:      "abcdef123456",
		StoragePath: "/opt/opshub/packages/1/order.jar",
		VersionTag:  "v1.0.0",
		UploadTime:  now,
	}
	artBytes, err := json.Marshal(art)
	require.NoError(t, err)
	var artUnmarshaled model.Artifact
	require.NoError(t, json.Unmarshal(artBytes, &artUnmarshaled))
	assert.Equal(t, art.Filename, artUnmarshaled.Filename)
	assert.Equal(t, art.FileSize, artUnmarshaled.FileSize)

	// DeployRecord
	finishTime := now.Add(5 * time.Second)
	rec := model.DeployRecord{
		ID:         1,
		ServiceID:  1,
		ArtifactID: &artifactID,
		Action:     model.ActionDeploy,
		Operator:   "admin",
		ClientIP:   "127.0.0.1",
		Status:     model.DeployStatusSuccess,
		OutputLog:  "deployed successfully",
		StartedAt:  now,
		FinishedAt: &finishTime,
	}
	recBytes, err := json.Marshal(rec)
	require.NoError(t, err)
	var recUnmarshaled model.DeployRecord
	require.NoError(t, json.Unmarshal(recBytes, &recUnmarshaled))
	assert.Equal(t, rec.Action, recUnmarshaled.Action)
	assert.Equal(t, *rec.ArtifactID, *recUnmarshaled.ArtifactID)

	// AuditLog
	audit := model.AuditLog{
		ID:         1,
		Operator:   "admin",
		ClientIP:   "127.0.0.1",
		Action:     model.ActionDeploy,
		TargetType: "service",
		TargetID:   "1",
		Details:    "Deployed v1.0.0",
		Status:     model.DeployStatusSuccess,
		CreatedAt:  now,
	}
	auditBytes, err := json.Marshal(audit)
	require.NoError(t, err)
	var auditUnmarshaled model.AuditLog
	require.NoError(t, json.Unmarshal(auditBytes, &auditUnmarshaled))
	assert.Equal(t, audit.TargetType, auditUnmarshaled.TargetType)

	// User
	user := model.User{
		ID:           1,
		Username:     "admin",
		PasswordHash: "secret-hash",
		Role:         model.RoleAdmin,
		Permissions:  []string{model.PermServiceView, model.PermServiceControl},
		Status:       model.UserStatusActive,
		CreatedAt:    now,
	}
	userBytes, err := json.Marshal(user)
	require.NoError(t, err)
	assert.NotContains(t, string(userBytes), "secret-hash", "password_hash must not be serialized to json")
	var userUnmarshaled model.User
	require.NoError(t, json.Unmarshal(userBytes, &userUnmarshaled))
	assert.Equal(t, user.Username, userUnmarshaled.Username)
	assert.Equal(t, user.Status, userUnmarshaled.Status)
	assert.Equal(t, user.Permissions, userUnmarshaled.Permissions)
	assert.Empty(t, userUnmarshaled.PasswordHash)

	// Verify DefaultOperatorPermissions contains expected permissions
	assert.Contains(t, model.DefaultOperatorPermissions, model.PermServiceView)
	assert.Contains(t, model.DefaultOperatorPermissions, model.PermServiceControl)
	assert.Contains(t, model.DefaultOperatorPermissions, model.PermServiceDeploy)
	assert.Contains(t, model.DefaultOperatorPermissions, model.PermServiceRollback)
	assert.Contains(t, model.DefaultOperatorPermissions, model.PermServiceConfig)
	assert.Contains(t, model.DefaultOperatorPermissions, model.PermAuditView)
	assert.NotContains(t, model.DefaultOperatorPermissions, model.PermServiceManage)
	assert.NotContains(t, model.DefaultOperatorPermissions, model.PermTemplateManage)
	assert.NotContains(t, model.DefaultOperatorPermissions, model.PermJDKManage)
}
