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

func TestAuthService_ResetPassword(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "my-secret-key")

	initPass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)

	// Reset with empty password should fail
	err = authSvc.ResetPassword("admin", "   ")
	assert.Error(t, err)

	// Reset for non-existent user should fail
	err = authSvc.ResetPassword("nonexistent", "newpass123")
	assert.Error(t, err)

	// Reset admin password
	err = authSvc.ResetPassword("admin", "forced-admin-pass-456")
	require.NoError(t, err)

	// Old pass fails
	_, err = authSvc.Login("admin", initPass)
	assert.Error(t, err)

	// New pass succeeds
	token, err := authSvc.Login("admin", "forced-admin-pass-456")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
}

func TestAuthService_RegisterAndProfile(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "my-secret-key")

	// 1. Validation failures
	_, err = authSvc.Register("ab", "pass123", "User", "test@example.com", "Q", "A")
	assert.Error(t, err, "username too short")

	_, err = authSvc.Register("operator1", "123", "User", "test@example.com", "Q", "A")
	assert.Error(t, err, "password too short")

	_, err = authSvc.Register("operator1", "pass1234", "User", "test@example.com", "", "A")
	assert.Error(t, err, "security question empty")

	_, err = authSvc.Register("operator1", "pass1234", "User", "test@example.com", "Q", "")
	assert.Error(t, err, "security answer empty")

	// 2. Successful registration
	u, err := authSvc.Register("operator1", "securePass123", "张运维", "op1@company.com", "你的出生城市？", "Beijing")
	require.NoError(t, err)
	assert.Equal(t, "operator1", u.Username)
	assert.Equal(t, "operator", u.Role)
	assert.Equal(t, "张运维", u.Nickname)
	assert.Equal(t, "op1@company.com", u.Email)
	assert.Equal(t, "你的出生城市？", u.SecurityQuestion)

	// 3. Duplicate registration fails
	_, err = authSvc.Register("operator1", "anotherPass123", "张运维2", "op2@company.com", "Q", "A")
	assert.Error(t, err, "duplicate username")

	// 4. Can login with registered user
	token, err := authSvc.Login("operator1", "securePass123")
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	claims, err := authSvc.VerifyToken(token)
	require.NoError(t, err)
	assert.Equal(t, "operator1", claims.Username)
	assert.Equal(t, "operator", claims.Role)

	// 5. GetProfile
	profile, err := authSvc.GetProfile("operator1")
	require.NoError(t, err)
	assert.Equal(t, "operator1", profile.Username)
	assert.Equal(t, "张运维", profile.Nickname)
	assert.Equal(t, "op1@company.com", profile.Email)

	// 6. UpdateProfile
	avatarStr := "preset:ops-chan"
	err = authSvc.UpdateProfile("operator1", "张主管", "zhang@corp.com", &avatarStr)
	require.NoError(t, err)

	updatedProfile, err := authSvc.GetProfile("operator1")
	require.NoError(t, err)
	assert.Equal(t, "张主管", updatedProfile.Nickname)
	assert.Equal(t, "zhang@corp.com", updatedProfile.Email)
	assert.Equal(t, "preset:ops-chan", updatedProfile.Avatar)
}

func TestAuthService_SecurityQuestionAndReset(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "my-secret-key")

	_, err = authSvc.Register("devops_user", "password666", "小李", "li@example.com", "您就读的第一所小学？", "Sunshine Elementary")
	require.NoError(t, err)

	// 1. Get security question
	q, err := authSvc.GetSecurityQuestion("devops_user")
	require.NoError(t, err)
	assert.Equal(t, "您就读的第一所小学？", q)

	// Non-existent user
	_, err = authSvc.GetSecurityQuestion("nobody")
	assert.Error(t, err)

	// 2. Reset password with wrong answer
	err = authSvc.ResetPasswordWithSecurityAnswer("devops_user", "Wrong Answer", "brandNewPass777")
	assert.Error(t, err)

	// 3. Reset password with correct answer (case-insensitive & trimmed)
	err = authSvc.ResetPasswordWithSecurityAnswer("devops_user", "  sunshine elementary  ", "brandNewPass777")
	require.NoError(t, err)

	// Old password no longer works
	_, err = authSvc.Login("devops_user", "password666")
	assert.Error(t, err)

	// New password works
	token, err := authSvc.Login("devops_user", "brandNewPass777")
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	// 4. SetSecurityQuestion
	err = authSvc.SetSecurityQuestion("devops_user", "新密保问题？", "New Answer 123")
	require.NoError(t, err)

	newQ, err := authSvc.GetSecurityQuestion("devops_user")
	require.NoError(t, err)
	assert.Equal(t, "新密保问题？", newQ)

	// Reset with updated answer
	err = authSvc.ResetPasswordWithSecurityAnswer("devops_user", "new answer 123", "latestPass888")
	require.NoError(t, err)

	token2, err := authSvc.Login("devops_user", "latestPass888")
	require.NoError(t, err)
	assert.NotEmpty(t, token2)
}
