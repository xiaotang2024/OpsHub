package service_test

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/database"
	"opshub/internal/service"
)

func TestAuthService_InitAndLogin(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "my-secret-key")

	initPass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)
	assert.NotEmpty(t, initPass)
	assert.Equal(t, 16, len(initPass), "generated password should be 16 characters")

	token, err := authSvc.Login("admin", initPass)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	claims, err := authSvc.VerifyToken(token)
	require.NoError(t, err)
	assert.Equal(t, "admin", claims.Username)
	assert.Equal(t, "admin", claims.Role)
}

func TestAuthService_InitAdminIfNeeded_AlreadyExists(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "my-secret-key")

	firstPass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)
	assert.NotEmpty(t, firstPass)

	// Second invocation should detect existing user and return empty password without error
	secondPass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)
	assert.Empty(t, secondPass)

	// Alias InitAdmin should also return empty string without error
	aliasPass, err := authSvc.InitAdmin()
	require.NoError(t, err)
	assert.Empty(t, aliasPass)

	// Original password must still be valid
	token, err := authSvc.Login("admin", firstPass)
	require.NoError(t, err)
	assert.NotEmpty(t, token)
}

func TestAuthService_Login_InvalidCredentials(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "my-secret-key")

	initPass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)

	// Wrong username
	_, err = authSvc.Login("nonexistent", initPass)
	assert.Error(t, err)

	// Wrong password
	_, err = authSvc.Login("admin", "wrong-password")
	assert.Error(t, err)
}

func TestAuthService_VerifyToken_Failures(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "my-secret-key")

	// Invalid token string
	_, err = authSvc.VerifyToken("not-a-valid-jwt")
	assert.Error(t, err)

	// Token signed with a different key
	otherSvc := service.NewAuthService(db, "different-secret-key")
	pass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)
	otherToken, err := otherSvc.Login("admin", pass)
	require.NoError(t, err)

	_, err = authSvc.VerifyToken(otherToken)
	assert.Error(t, err)

	// Expired token
	expiredClaims := service.Claims{
		Username: "admin",
		Role:     "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			Subject:   "admin",
		},
	}
	expiredJwt := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims)
	expiredStr, err := expiredJwt.SignedString([]byte("my-secret-key"))
	require.NoError(t, err)

	_, err = authSvc.VerifyToken(expiredStr)
	assert.Error(t, err)
}

func TestAuthService_ChangePassword(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "my-secret-key")

	initPass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)

	// Change password with wrong old password
	err = authSvc.ChangePassword("admin", "wrong-old-pass", "new-password-123")
	assert.Error(t, err)

	// Change password for nonexistent user
	err = authSvc.ChangePassword("unknown", "old-pass", "new-password-123")
	assert.Error(t, err)

	// Change password with empty new password
	err = authSvc.ChangePassword("admin", initPass, "")
	assert.Error(t, err)

	// Successful password change
	err = authSvc.ChangePassword("admin", initPass, "new-secret-password-123")
	require.NoError(t, err)

	// Old password no longer works
	_, err = authSvc.Login("admin", initPass)
	assert.Error(t, err)

	// New password works
	token, err := authSvc.Login("admin", "new-secret-password-123")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
}
