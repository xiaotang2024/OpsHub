# 轻量双角色权限控制与运维人员管理实施计划 (RBAC & User Management Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建轻量级双角色权限控制体系，支持管理员全量管理与自定义运维人员权限，运维人员默认具备日常维护能力并与系统安全隔离。

**Architecture:** 基于已有的 `RoleAdmin`/`RoleOperator` 双角色基线，在数据库 `users` 表扩展 `permissions`（JSON 字符串）与 `status`（状态）字段；后端通过 `RequireAdmin()` 与 `RequirePermission(perm)` 中间件实施严格路由鉴权与账号状态校验；前端通过 `usePermission` Hook 与 `<PermissionGate>` 组件实现菜单级动态导航与按钮级友好置灰控制，并为管理员提供可视化「用户与权限管理」模块。

**Tech Stack:** Go 1.22+, Gin, SQLite (`modernc.org/sqlite`), MySQL (`go-sql-driver/mysql`), React 18, Vite, TypeScript, Tailwind CSS, Vitest, Testing Library.

**Spec:** [`docs/superpowers/specs/2026-09-13-rbac-permission-control-design.md`](file:///Users/tanggw/Documents/code/agent-test/OpsHub/docs/superpowers/specs/2026-09-13-rbac-permission-control-design.md)

## Global Constraints

- **Git Commit Language:** All Git commit messages must be written in Chinese (严格遵守全局规则).
- **Database Compatibility:** SQLite 与 MySQL 双数据库驱动严格平权兼容，DDL 与迁移逻辑同步更新。
- **Zero Regression:** 必须确保现有测试套件（后端全部单元测试、前端全量 vitest）全部通过。
- **Anti-Lockout Safeguards:** 内置管理员账号不可自删、不可降级为 operator，禁用账号即刻生效阻断。

---

### Task 1: 数据库 Schema 迁移与数据模型扩展 (Database Schema Migration & Models)

**Files:**
- Modify: `internal/model/models.go`
- Modify: `internal/database/db.go`
- Test: `internal/database/db_test.go`

**Interfaces:**
- Produces: 
  - `model.User` 增加 `Permissions []string ` (json: "permissions") 与 `Status string` (json: "status")
  - 权限常量：`PermServiceView`, `PermServiceControl`, `PermServiceDeploy`, `PermServiceRollback`, `PermServiceConfig`, `PermServiceManage`, `PermTemplateManage`, `PermJDKManage`, `PermAuditView`
  - 默认运维权限列表 `DefaultOperatorPermissions = []string{...}`
  - SQLite 与 MySQL 表结构迁移保证包含 `permissions TEXT DEFAULT ''` 与 `status TEXT NOT NULL DEFAULT 'active'`

- [ ] **Step 1: 编写数据库迁移失败测试**

在 `internal/database/db_test.go` 中增加针对新字段 `permissions` 和 `status` 的迁移与默认值测试：
```go
func TestInitDB_Users_PermissionsAndStatusMigration(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_perm.db")
	db, err := InitDB(config.DatabaseConfig{Type: "sqlite", SQLitePath: dbPath})
	require.NoError(t, err)
	defer db.Close()

	// 验证 permissions 与 status 字段已创建
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM users WHERE status = 'active'").Scan(&count)
	require.NoError(t, err)

	// 插入带 permissions 与 status 的测试数据
	_, err = db.Exec(
		"INSERT INTO users (username, password_hash, role, permissions, status) VALUES (?, ?, ?, ?, ?)",
		"test_op", "hash", "operator", `["service:view","service:control"]`, "active",
	)
	require.NoError(t, err)

	var permissions, status string
	err = db.QueryRow("SELECT permissions, status FROM users WHERE username = 'test_op'").Scan(&permissions, &status)
	require.NoError(t, err)
	assert.Equal(t, `["service:view","service:control"]`, permissions)
	assert.Equal(t, "active", status)
}
```

- [ ] **Step 2: 运行测试以验证失败**

Run: `go test ./internal/database -run TestInitDB_Users_PermissionsAndStatusMigration -v`  
Expected: FAIL（由于列尚不存在）

- [ ] **Step 3: 修改 `models.go` 与 `db.go`**

在 `internal/model/models.go` 增加权限常量与字段：
```go
const (
	RoleAdmin    = "admin"
	RoleOperator = "operator"

	UserStatusActive   = "active"
	UserStatusDisabled = "disabled"

	PermServiceView     = "service:view"
	PermServiceControl  = "service:control"
	PermServiceDeploy   = "service:deploy"
	PermServiceRollback = "service:rollback"
	PermServiceConfig   = "service:config"
	PermServiceManage   = "service:manage"
	PermTemplateManage  = "template:manage"
	PermJDKManage       = "jdk:manage"
	PermAuditView       = "audit:view"
)

var DefaultOperatorPermissions = []string{
	PermServiceView,
	PermServiceControl,
	PermServiceDeploy,
	PermServiceRollback,
	PermServiceConfig,
	PermAuditView,
}
```
并在 `User` 结构体中扩展 `Permissions []string` 和 `Status string`。

在 `internal/database/db.go` 中：
1. 更新 SQLite 和 MySQL 的 `CREATE TABLE IF NOT EXISTS users` DDL，添加 `permissions TEXT DEFAULT ''` 与 `status TEXT NOT NULL DEFAULT 'active'`。
2. 在 `migrateUsersTable` 中，为现有表追加 `permissions` 和 `status` 列的自动增量迁移（兼容 SQLite `PRAGMA table_info` 与 MySQL `INFORMATION_SCHEMA.COLUMNS`）。
3. 执行 `UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''`。

- [ ] **Step 4: 运行测试以验证通过**

Run: `go test ./internal/database/... -v`  
Expected: PASS

- [ ] **Step 5: 提交更改**

```bash
git add internal/model/models.go internal/database/db.go internal/database/db_test.go
git commit -m "feat(database): users 表扩展 permissions 与 status 字段并支持双库平滑迁移"
```

---

### Task 2: 用户服务与鉴权逻辑扩展 (UserService & AuthService Enhancements)

**Files:**
- Create: `internal/service/user_service.go`
- Create: `internal/service/user_service_test.go`
- Modify: `internal/service/auth_service.go`
- Modify: `internal/service/auth_service_test.go`

**Interfaces:**
- Consumes: `model.User`, `database.DB`
- Produces:
  - `service.UserService`：
    - `ListUsers(ctx context.Context) ([]*model.User, error)`
    - `CreateUser(ctx context.Context, req CreateUserRequest) (*model.User, error)`
    - `UpdatePermissions(ctx context.Context, userID int64, permissions []string) error`
    - `UpdateStatus(ctx context.Context, userID int64, status string, currentAdmin string) error`
    - `ResetPassword(ctx context.Context, userID int64, newPassword string) error`
    - `DeleteUser(ctx context.Context, userID int64, currentAdmin string) error`
  - `service.AuthService`：登录校验 `status == 'active'`，返回载荷携带 `permissions`。

- [ ] **Step 1: 编写 UserService 单元测试**

创建 `internal/service/user_service_test.go`，测试新建用户、管理员防自删、修改权限、禁用账号与密码重置：
```go
package service_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/config"
	"opshub/internal/database"
	"opshub/internal/model"
	"opshub/internal/service"
)

func TestUserService_CRUDAndGuardrails(t *testing.T) {
	db, err := database.InitDB(config.DatabaseConfig{Type: "sqlite", SQLitePath: ":memory:"})
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
```

- [ ] **Step 2: 运行测试以验证失败**

Run: `go test ./internal/service -run TestUserService_CRUDAndGuardrails -v`  
Expected: FAIL（`service.NewUserService` 不存在）

- [ ] **Step 3: 实现 `UserService` 与更新 `AuthService`**

1. 创建 `internal/service/user_service.go`：
   - 实现用户列表查询、安全密码哈希（`bcrypt`）、默认权限填充、权限序列化反序列化（JSON）、状态更新与防自锁校验。
2. 更新 `internal/service/auth_service.go`：
   - 在 `Login` 中查询用户的 `status`，若为 `disabled` 则拒绝登录并返回 `account is disabled`。
   - 在 `VerifyToken` / `GetProfile` / `Me` 中，将用户实时的 `permissions` 注入返回结构体中。

- [ ] **Step 4: 运行测试以验证通过**

Run: `go test ./internal/service/... -v`  
Expected: PASS

- [ ] **Step 5: 提交更改**

```bash
git add internal/service/user_service.go internal/service/user_service_test.go internal/service/auth_service.go internal/service/auth_service_test.go
git commit -m "feat(service): 实现 UserService 用户与权限管理并增强登录状态校验"
```

---

### Task 3: 鉴权中间件与高危路由权限收口 (Middleware & Protected Routes)

**Files:**
- Modify: `internal/api/middleware/auth.go`
- Modify: `internal/api/middleware/auth_test.go`
- Create: `internal/api/handler/user_handler.go`
- Create: `internal/api/handler/user_handler_test.go`
- Modify: `internal/api/router.go`
- Modify: `internal/api/router_test.go`

**Interfaces:**
- Consumes: `service.UserService`, `service.AuthService`, `middleware.AuthMiddleware`
- Produces:
  - `middleware.RequireAdmin()`
  - `middleware.RequirePermission(db, requiredPerm)`
  - `handler.UserHandler` 接口暴露在 `/api/users` 路由组下（全量受 `RequireAdmin()` 保护）
  - 核心服务操作接口（启停、部署、回滚、配置）挂载对应的权限检查中间件

- [ ] **Step 1: 编写中间件鉴权测试**

在 `internal/api/middleware/auth_test.go` 中增加针对 `RequireAdmin` 与 `RequirePermission` 的单元测试：
```go
func TestRequireAdmin_Middleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("role", c.GetHeader("X-Role"))
		c.Next()
	})
	r.GET("/admin-only", middleware.RequireAdmin(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// 1. Admin 放行
	req := httptest.NewRequest("GET", "/admin-only", nil)
	req.Header.Set("X-Role", "admin")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// 2. Operator 拦截为 403
	req2 := httptest.NewRequest("GET", "/admin-only", nil)
	req2.Header.Set("X-Role", "operator")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusForbidden, w2.Code)
}
```

- [ ] **Step 2: 运行测试以验证失败**

Run: `go test ./internal/api/middleware -run TestRequireAdmin_Middleware -v`  
Expected: FAIL（函数尚未实现）

- [ ] **Step 3: 实现 `RequireAdmin` 与 `RequirePermission`**

在 `internal/api/middleware/auth.go` 中实现：
```go
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role := GetRole(c)
		if role != model.RoleAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "仅管理员拥有此操作权限",
			})
			return
		}
		c.Next()
	}
}

func RequirePermission(db *sql.DB, requiredPerm string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := GetRole(c)
		if role == model.RoleAdmin {
			c.Next()
			return
		}
		username := GetUsername(c)
		if username == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			return
		}

		var permJSON string
		var status string
		err := db.QueryRowContext(c.Request.Context(), "SELECT permissions, status FROM users WHERE username = ?", username).Scan(&permJSON, &status)
		if err != nil || status != model.UserStatusActive {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "账号已被禁用或不存在"})
			return
		}

		var perms []string
		_ = json.Unmarshal([]byte(permJSON), &perms)
		if len(perms) == 0 {
			perms = model.DefaultOperatorPermissions
		}

		has := false
		for _, p := range perms {
			if p == requiredPerm {
				has = true
				break
			}
		}

		if !has {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": fmt.Sprintf("无权限执行此操作，缺少权限: %s", requiredPerm),
			})
			return
		}
		c.Next()
	}
}
```

- [ ] **Step 4: 实现 `UserHandler` 与在 `router.go` 中挂载并加固路由**

1. 创建 `internal/api/handler/user_handler.go`：实现用户列表查询、创建、权限更新、状态变更、重置密码、删除。
2. 更新 `internal/api/router.go`：
   - 挂载用户管理接口至 `/api/users`，并应用 `RequireAdmin()` 中间件。
   - 服务控制接口（`/start`, `/stop`, `/restart`）保护为 `RequirePermission(db, model.PermServiceControl)`。
   - 部署与上传接口（`/deploy`, `/artifacts`）保护为 `RequirePermission(db, model.PermServiceDeploy)`。
   - 回滚接口（`/rollback`）保护为 `RequirePermission(db, model.PermServiceRollback)`。
   - 配置修改接口（`/configs`, `/template-sync`）保护为 `RequirePermission(db, model.PermServiceConfig)`。
   - 模板管理接口（`/templates` POST/PUT/DELETE）保护为 `RequirePermission(db, model.PermTemplateManage)`。
   - JDK 资产管理接口（`/jdks` POST/DELETE）保护为 `RequirePermission(db, model.PermJDKManage)`。

- [ ] **Step 5: 运行 API 集成测试验证通过**

Run: `go test ./internal/api/... -v`  
Expected: PASS

- [ ] **Step 6: 提交更改**

```bash
git add internal/api/middleware/auth.go internal/api/middleware/auth_test.go internal/api/handler/user_handler.go internal/api/handler/user_handler_test.go internal/api/router.go internal/api/router_test.go
git commit -m "feat(api): 实现鉴权中间件与用户管理接口并对高危路由实施权限收口"
```

---

### Task 4: 前端类型、API 客户端与鉴权 Hook (Frontend Types & Permission Hook)

**Files:**
- Modify: `web/src/types/index.ts`
- Modify: `web/src/api/index.ts`
- Create: `web/src/hooks/usePermission.ts`
- Create: `web/src/hooks/usePermission.test.ts`
- Create: `web/src/components/common/PermissionGate.tsx`
- Create: `web/src/components/common/PermissionGate.test.tsx`

**Interfaces:**
- Produces:
  - `UserProfile` 增加 `permissions: string[]` 和 `status: string`
  - `api.getUsers()`, `api.createUser()`, `api.updateUserPermissions()`, `api.updateUserStatus()`, `api.resetUserPassword()`, `api.deleteUser()`
  - `usePermission()`: `{ isAdmin, hasPermission, hasAnyPermission, permissions }`
  - `<PermissionGate permission="service:control" fallback={...}>`

- [ ] **Step 1: 编写 `usePermission` 与 `PermissionGate` 测试**

在 `web/src/hooks/usePermission.test.ts` 中编写单测：
```typescript
import { renderHook } from '@testing-library/react';
import { usePermission } from './usePermission';
import { describe, it, expect } from 'vitest';

describe('usePermission hook', () => {
  it('identifies admin role and grants all permissions', () => {
    const { result } = renderHook(() => usePermission({ role: 'admin', permissions: [] }));
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.hasPermission('service:control')).toBe(true);
    expect(result.current.hasPermission('system:anything')).toBe(true);
  });

  it('correctly filters permissions for operator role', () => {
    const { result } = renderHook(() =>
      usePermission({ role: 'operator', permissions: ['service:view', 'service:control'] })
    );
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.hasPermission('service:control')).toBe(true);
    expect(result.current.hasPermission('service:deploy')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试以验证失败**

Run: `cd web && npx vitest run src/hooks/usePermission.test.ts`  
Expected: FAIL

- [ ] **Step 3: 实现前端类型、API 客户端与 Hook**

1. 更新 `web/src/types/index.ts`，扩展 `UserProfile` 并声明权限码常量。
2. 在 `web/src/api/index.ts` 中封装全部用户管理请求。
3. 实现 `web/src/hooks/usePermission.ts` 与 `<PermissionGate>` 组件。

- [ ] **Step 4: 运行测试以验证通过**

Run: `cd web && npx vitest run src/hooks/usePermission.test.ts src/components/common/PermissionGate.test.tsx`  
Expected: PASS

- [ ] **Step 5: 提交更改**

```bash
git add web/src/types/index.ts web/src/api/index.ts web/src/hooks/usePermission.ts web/src/hooks/usePermission.test.ts web/src/components/common/PermissionGate.tsx web/src/components/common/PermissionGate.test.tsx
git commit -m "feat(web): 封装前端权限控制 Hook、PermissionGate 组件与用户管理 API"
```

---

### Task 5: 侧边栏动态导航与路由访问守卫 (Shell Navigation & Route Guards)

**Files:**
- Modify: `web/src/components/layout/Shell.tsx`
- Modify: `web/src/components/layout/Shell.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

**Interfaces:**
- Consumes: `usePermission`, `Shell`, `UserProfile`
- Produces:
  - 侧边栏在 `userProfile.role === 'admin'` 时动态渲染「用户管理」导航项
  - 运维人员登录时侧边栏无「用户管理」入口，直接访问 `/users` 时拦截并重定向至 `/services`

- [ ] **Step 1: 编写 Shell 侧边栏动态权限菜单测试**

在 `web/src/components/layout/Shell.test.tsx` 中增加测试：
- 当管理员登录时，页面渲染出“用户管理”导航链接；
- 当普通运维人员登录时，“用户管理”导航链接不存在。

- [ ] **Step 2: 运行测试以验证失败**

Run: `cd web && npx vitest run src/components/layout/Shell.test.tsx`  
Expected: FAIL

- [ ] **Step 3: 更新 `Shell.tsx` 与 `App.tsx`**

1. 在 `web/src/components/layout/Shell.tsx` 中增加 `Users` 图标导航项，并根据当前 `userProfile?.role === 'admin'` 决定是否加入 `NAV_ITEMS`。
2. 在 `web/src/App.tsx` 中增加保护路由 `/users`：
   ```tsx
   <Route 
     path="/users" 
     element={
       userProfile?.role === 'admin' ? (
         <UserManagement />
       ) : (
         <Navigate to="/services" replace />
       )
     } 
   />
   ```

- [ ] **Step 4: 运行测试以验证通过**

Run: `cd web && npx vitest run src/components/layout/Shell.test.tsx src/App.test.tsx`  
Expected: PASS

- [ ] **Step 5: 提交更改**

```bash
git add web/src/components/layout/Shell.tsx web/src/components/layout/Shell.test.tsx web/src/App.tsx web/src/App.test.tsx
git commit -m "feat(web): 侧边栏集成用户管理入口并添加管理员路由守卫"
```

---

### Task 6: 用户与权限管理界面开发 (UserManagement Page)

**Files:**
- Create: `web/src/pages/Users/UserManagement.tsx`
- Create: `web/src/pages/Users/UserManagement.test.tsx`

**Interfaces:**
- Consumes: `api.getUsers`, `api.createUser`, `api.updateUserPermissions`, `api.updateUserStatus`, `api.resetUserPassword`, `api.deleteUser`
- Produces:
  - 完整用户列表视图（头像、用户名、昵称、角色徽章、启用状态、权限摘要）
  - 新建用户模态框（设置用户名、密码、角色、权限）
  - 编辑权限模态框：支持【标准运维模板（默认）】、【只读巡检模板】、【全功能运维】一键预设，以及细粒度复选框手动调配
  - 账号启停、密码重置、删除账号防误触确认

- [ ] **Step 1: 编写 UserManagement 组件交互测试**

在 `web/src/pages/Users/UserManagement.test.tsx` 中编写测试：
- 渲染用户列表，正确显示角色标签（管理员/运维人员）；
- 打开权限编辑模态框，点击“标准运维模板”自动勾选对应权限项；
- 点击“停用”触发状态更新 API。

- [ ] **Step 2: 运行测试以验证失败**

Run: `cd web && npx vitest run src/pages/Users/UserManagement.test.tsx`  
Expected: FAIL

- [ ] **Step 3: 实现 `UserManagement.tsx` 页面**

使用现有 OpsHub 设计规范（毛玻璃遮罩、Cyberpunk 赛博微光风格、Lucide 图标、Tailwind CSS）：
- 模块化权限勾选框（按“服务日常控制”、“发版与回滚”、“服务配置”、“部署模板”、“JDK 资产”、“审计日志”分类）。
- 快捷模板切换按钮组。
- 完善的表单校验与 Sonner Toast 反馈。

- [ ] **Step 4: 运行测试以验证通过**

Run: `cd web && npx vitest run src/pages/Users/UserManagement.test.tsx`  
Expected: PASS

- [ ] **Step 5: 提交更改**

```bash
git add web/src/pages/Users/UserManagement.tsx web/src/pages/Users/UserManagement.test.tsx
git commit -m "feat(web): 开发管理员专属的用户与权限可视化配置界面"
```

---

### Task 7: 前端关键操作按钮权限门禁收口 (Button-level Permission Guarding)

**Files:**
- Modify: `web/src/pages/Services/ServiceDetail.tsx`
- Modify: `web/src/pages/Templates/TemplateList.tsx`
- Modify: `web/src/pages/JDKs/JDKList.tsx`
- Modify: `web/src/pages/Services/ServiceDetail.test.tsx`
- Modify: `web/src/pages/Templates/TemplateList.test.tsx`
- Modify: `web/src/pages/JDKs/JDKList.test.tsx`

**Interfaces:**
- Consumes: `<PermissionGate>`, `usePermission`
- Produces:
  - 在服务详情页：【启动】、【停止】、【重启】受 `service:control` 门禁；【发版部署】受 `service:deploy` 门禁；【回滚】受 `service:rollback` 门禁。无权限时置灰并悬停显示提示。
  - 在模板管理页：【新建模板】、【编辑模板】、【删除】受 `template:manage` 门禁。
  - 在 JDK 管理页：【登记 JDK】、【扫描】、【注销】受 `jdk:manage` 门禁。

- [ ] **Step 1: 编写按钮权限置灰/隐藏测试**

更新 `ServiceDetail.test.tsx`、`TemplateList.test.tsx`，验证在缺失对应权限时，相关操作按钮处于禁用或隐藏状态。

- [ ] **Step 2: 运行测试以验证失败**

Run: `cd web && npx vitest run src/pages/Services/ServiceDetail.test.tsx`  
Expected: FAIL

- [ ] **Step 3: 在各页面嵌入 `<PermissionGate>` 门禁包装**

替换或包装对应操作按钮，配置合理的 Tooltip 说明（例如：“无服务控制权限，请联系管理员授予”）。

- [ ] **Step 4: 运行测试以验证通过**

Run: `cd web && npx vitest run src/pages/Services/ServiceDetail.test.tsx src/pages/Templates/TemplateList.test.tsx src/pages/JDKs/JDKList.test.tsx`  
Expected: PASS

- [ ] **Step 5: 提交更改**

```bash
git add web/src/pages/Services/ServiceDetail.tsx web/src/pages/Templates/TemplateList.tsx web/src/pages/JDKs/JDKList.tsx web/src/pages/Services/ServiceDetail.test.tsx web/src/pages/Templates/TemplateList.test.tsx web/src/pages/JDKs/JDKList.test.tsx
git commit -m "feat(web): 在服务详情、模板管理与 JDK 资产页面引入细粒度按钮权限门禁"
```

---

### Task 8: 全系统自动化集成测试与构建回归 (Full System Regression & Build)

**Files:**
- Run all backend tests
- Run all frontend tests
- Build frontend & embed verification

- [ ] **Step 1: 运行全量后端 Go 测试**

Run: `go test -v ./...`  
Expected: 全部测试 PASS，无数据竞态与逻辑回归。

- [ ] **Step 2: 运行全量前端 Vitest 测试**

Run: `cd web && npm test -- --run`  
Expected: 全部测试套件 PASS。

- [ ] **Step 3: 运行前端生产编译构建并验证 Go 嵌入编译**

Run: `cd web && npm run build && cd .. && go build -o /dev/null ./cmd/opshub`  
Expected: 编译零警告零错误，静态资产无缝内嵌。

- [ ] **Step 4: 最终提交与代码库清理**

```bash
git status
git commit -m "chore: 验证权限控制功能全链路回归测试通过"
```
