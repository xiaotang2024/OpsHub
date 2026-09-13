package service_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/database"
	"opshub/internal/model"
	"opshub/internal/service"
)

func TestUserService_CRUDAndGuardrails(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "test-secret")
	rawPass, err := authSvc.EnsureDefaultAdmin()
	require.NoError(t, err)
	assert.NotEmpty(t, rawPass)

	userSvc := service.NewUserService(db)
	ctx := context.Background()

	// 1. 创建运维人员 (默认赋予 DefaultOperatorPermissions)
	user, err := userSvc.CreateUser(ctx, service.CreateUserRequest{
		Username: "operator_jack",
		Password: "Password123!",
		Nickname: "Jack",
		Role:     model.RoleOperator,
	})
	require.NoError(t, err)
	assert.Equal(t, model.RoleOperator, user.Role)
	assert.Equal(t, model.UserStatusActive, user.Status)
	assert.ElementsMatch(t, model.DefaultOperatorPermissions, user.Permissions)

	// 2. 更新权限集
	newPerms := []string{model.PermServiceView, model.PermAuditView}
	err = userSvc.UpdatePermissions(ctx, user.ID, newPerms)
	require.NoError(t, err)

	// 2.1 验证显式清空权限：传入空切片 []string{}，应保持为空切片而非回退为默认权限
	err = userSvc.UpdatePermissions(ctx, user.ID, []string{})
	require.NoError(t, err)
	clearedUser, err := userSvc.GetUserByID(ctx, user.ID)
	require.NoError(t, err)
	assert.Empty(t, clearedUser.Permissions)

	// 恢复部分权限继续后续测试
	err = userSvc.UpdatePermissions(ctx, user.ID, newPerms)
	require.NoError(t, err)

	users, err := userSvc.ListUsers(ctx)
	require.NoError(t, err)
	assert.Len(t, users, 2)

	// 3. 验证防自锁：不能禁用或删除 admin 账号
	var adminUser *model.User
	for _, u := range users {
		if u.Username == "admin" {
			adminUser = u
			break
		}
	}
	require.NotNil(t, adminUser)

	err = userSvc.UpdateStatus(ctx, adminUser.ID, model.UserStatusDisabled, "admin")
	assert.ErrorContains(t, err, "cannot disable super admin")

	err = userSvc.DeleteUser(ctx, adminUser.ID, "admin")
	assert.ErrorContains(t, err, "cannot delete super admin")
}

func TestUserService_AdditionalOperations(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "test-secret")
	_, err = authSvc.EnsureDefaultAdmin()
	require.NoError(t, err)

	userSvc := service.NewUserService(db)
	ctx := context.Background()

	// 1. 创建带自定义权限的运维人员
	customPerms := []string{model.PermServiceView, model.PermServiceControl}
	u, err := userSvc.CreateUser(ctx, service.CreateUserRequest{
		Username:    "operator_tom",
		Password:    "Password123!",
		Nickname:    "Tom",
		Email:       "tom@example.com",
		Role:        model.RoleOperator,
		Permissions: customPerms,
	})
	require.NoError(t, err)
	assert.ElementsMatch(t, customPerms, u.Permissions)

	// 2. 重置密码
	err = userSvc.ResetPassword(ctx, u.ID, "NewSecret123!")
	require.NoError(t, err)

	// 旧密码无法登录
	_, err = authSvc.Login("operator_tom", "Password123!")
	assert.Error(t, err)

	// 新密码可以登录
	token, err := authSvc.Login("operator_tom", "NewSecret123!")
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	// 3. 禁用账号
	err = userSvc.UpdateStatus(ctx, u.ID, model.UserStatusDisabled, "admin")
	require.NoError(t, err)

	// 禁用后无法登录
	_, err = authSvc.Login("operator_tom", "NewSecret123!")
	assert.ErrorContains(t, err, "account is disabled")

	// 重新启用账号
	err = userSvc.UpdateStatus(ctx, u.ID, model.UserStatusActive, "admin")
	require.NoError(t, err)

	token2, err := authSvc.Login("operator_tom", "NewSecret123!")
	require.NoError(t, err)
	assert.NotEmpty(t, token2)

	// 4. 防自删与防自锁校验
	err = userSvc.UpdateStatus(ctx, u.ID, model.UserStatusDisabled, "operator_tom")
	assert.ErrorContains(t, err, "cannot disable self")

	err = userSvc.DeleteUser(ctx, u.ID, "operator_tom")
	assert.ErrorContains(t, err, "cannot delete self")

	// 5. 成功删除运维用户
	err = userSvc.DeleteUser(ctx, u.ID, "admin")
	require.NoError(t, err)

	users, err := userSvc.ListUsers(ctx)
	require.NoError(t, err)
	assert.Len(t, users, 1)
	assert.Equal(t, "admin", users[0].Username)

	// 删除已不存在的用户
	err = userSvc.DeleteUser(ctx, u.ID, "admin")
	assert.ErrorContains(t, err, "user not found")
}

func TestUserService_ValidationErrors(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	userSvc := service.NewUserService(db)
	ctx := context.Background()

	// 用户名过短
	_, err = userSvc.CreateUser(ctx, service.CreateUserRequest{
		Username: "ab",
		Password: "Password123!",
	})
	assert.Error(t, err)

	// 密码过短
	_, err = userSvc.CreateUser(ctx, service.CreateUserRequest{
		Username: "valid_name",
		Password: "123",
	})
	assert.Error(t, err)

	// 正常创建
	_, err = userSvc.CreateUser(ctx, service.CreateUserRequest{
		Username: "valid_name",
		Password: "Password123!",
	})
	require.NoError(t, err)

	// 重复创建
	_, err = userSvc.CreateUser(ctx, service.CreateUserRequest{
		Username: "valid_name",
		Password: "Password456!",
	})
	assert.ErrorContains(t, err, "username already exists")

	// 更新不存在用户的权限
	err = userSvc.UpdatePermissions(ctx, 9999, []string{model.PermServiceView})
	assert.ErrorContains(t, err, "user not found")

	// 更新无效状态
	err = userSvc.UpdateStatus(ctx, 1, "invalid_status", "admin")
	assert.Error(t, err)
}
