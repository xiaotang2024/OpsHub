# 服务模板变更感知与差异同步实施计划 (Service Template Sync Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当所属部署模板发生变更（特别是 JVM 参数和健康检测配置）时，在依赖该模板的服务详情中提供智能感知提醒，并通过差异对比（Diff）弹窗让用户自由勾选需要同步的参数（仅限 JVM 参数与健康检测参数），支持“仅同步配置”、“同步并立即重启”以及“不再提示本次更新”。

**Architecture:**
- **数据层 (DB & Model)**: 为 `services` 表新增 `health_check_config` 与 `template_sync_ignored_at` 字段，实现数据库无缝迁移；
- **核心层 (Pipeline & Engine)**: 改造健康检查逻辑，使其支持“优先使用服务自定义健康检测，未配置时沿用模板配置”；
- **API 层 (Router & Handler)**: 新增 `GET /api/v1/services/:id/template-sync` 获取差异比对与忽略状态，新增 `POST /api/v1/services/:id/template-sync` 支持粒度化同步与一键重启；
- **前端表现层 (Web UI)**: 服务详情页增加可折叠/忽略的顶部提醒 Banner、常驻的“同步模板配置”入口、以及支持复选框与 Diff 预览的确认模态框 (`TemplateSyncModal`)。

**Tech Stack:** Go 1.22, Gin, SQLite, React 18, TypeScript, Tailwind CSS, Lucide Icons, Vitest.

---

## 任务拆解与实施步骤

### Task 1: 数据库与实体模型扩展 (DB & Model Layer)

**Files:**
- Modify: `internal/model/models.go`
- Modify: `internal/database/db.go`
- Test: `internal/model/models_test.go`
- Test: `internal/database/db_test.go` (if exists) or new tests in `internal/database/`

**Interfaces:**
- `model.Service` 新增字段:
  - `HealthCheckConfig string json:"health_check_config" db:"health_check_config"`
  - `TemplateSyncIgnoredAt *time.Time json:"template_sync_ignored_at,omitempty" db:"template_sync_ignored_at"`
- `db.go`:
  - `schemaDDL` 的 `CREATE TABLE IF NOT EXISTS services` 中补充字段
  - 新增 `migrateServicesTable(db *sql.DB) error` 迁移存量数据库

- [ ] **Step 1: 编写数据模型与迁移失败测试**
- [ ] **Step 2: 在 `models.go` 中添加字段**
- [ ] **Step 3: 在 `db.go` 中编写 `migrateServicesTable` 并注册至 `InitDB`**
- [ ] **Step 4: 运行 `go test ./internal/model/... ./internal/database/...` 验证通过**
- [ ] **Step 5: Git commit (`git commit -m "feat(db): 为服务表增加健康检测配置与模板同步忽略时间戳字段"`)**

---

### Task 2: 后端 API 与部署管道逻辑改造 (Backend API & Pipeline)

**Files:**
- Modify: `internal/service/deploy_pipeline.go`
- Modify: `internal/api/handler/service_handler.go`
- Modify: `internal/api/router.go`
- Test: `internal/api/router_test.go`
- Test: `internal/service/deploy_pipeline_test.go` (if applicable)

**Interfaces:**
- `deploy_pipeline.go`:
  - `Step 6` 健康检测：优先使用 `svc.HealthCheckConfig`，若为空则沿用 `tpl.HealthCheckConfig`。
- `service_handler.go`:
  - `service_handler.go` 中现有 CRUD 查询（`ListServices`, `GetService`, `CreateService`, `UpdateService`）的 SQL Scan 与 Insert/Update 补充新字段。
  - 新增 `GetTemplateSyncDiff(c *gin.Context)`:
    - 响应结构体 `TemplateSyncDiffResponse`:
      ```go
      type SyncDiffItem struct {
          Current      string `json:"current"`
          Template     string `json:"template"`
          IsDifferent  bool   `json:"is_different"`
      }
      type TemplateSyncDiffResponse struct {
          HasUpdate         bool         `json:"has_update"`
          TemplateID        int64        `json:"template_id"`
          TemplateName      string       `json:"template_name"`
          TemplateUpdatedAt time.Time    `json:"template_updated_at"`
          Ignored           bool         `json:"ignored"`
          JVMDiff           SyncDiffItem `json:"jvm_diff"`
          HealthCheckDiff   SyncDiffItem `json:"health_check_diff"`
      }
      ```
  - 新增 `SyncTemplate(c *gin.Context)`:
    - 请求结构体:
      ```go
      type SyncTemplateRequest struct {
          SyncJVM         bool `json:"sync_jvm"`
          SyncHealthCheck bool `json:"sync_health_check"`
          RestartNow      bool `json:"restart_now"`
          IgnoreUpdate    bool `json:"ignore_update"`
      }
      ```
    - 逻辑：
      - 若 `IgnoreUpdate == true`：更新 `template_sync_ignored_at = template.updated_at`；
      - 若 `SyncJVM == true`：更新 `service.jvm_options = template.jvm_options`；
      - 若 `SyncHealthCheck == true`：更新 `service.health_check_config = template.health_check_config`；
      - 若 `RestartNow == true` 且服务运行中：执行重启逻辑；
      - 记录审计日志 `middleware.SetAudit(...)`。
- `router.go`:
  - `r.GET("/api/v1/services/:id/template-sync", serviceHandler.GetTemplateSyncDiff)`
  - `r.POST("/api/v1/services/:id/template-sync", serviceHandler.SyncTemplate)`

- [ ] **Step 1: 编写路由与业务处理失败测试（在 `router_test.go` 中添加测试用例）**
- [ ] **Step 2: 改造 `deploy_pipeline.go` 的健康检测配置取值**
- [ ] **Step 3: 更新 `service_handler.go` 的现有字段读写与新增 Diff / Sync 接口**
- [ ] **Step 4: 注册路由到 `router.go`**
- [ ] **Step 5: 运行 `go test ./internal/api/... ./internal/service/...` 验证通过**
- [ ] **Step 6: Git commit (`git commit -m "feat(api): 实现服务与模板的 JVM/健康检测配置差异对比与选择性同步接口"`)**

---

### Task 3: 前端 API 客户端与类型定义 (Frontend Types & API)

**Files:**
- Modify: `web/src/types/index.ts`
- Modify: `web/src/api/index.ts`

**Interfaces:**
- `types/index.ts`:
  - 在 `Service` 中增加 `health_check_config?: string` 与 `template_sync_ignored_at?: string`。
  - 增加 `TemplateSyncDiff`, `TemplateSyncDiffItem`, `SyncTemplateRequest` 接口定义。
- `api/index.ts`:
  - `getTemplateSyncDiff: (serviceId: number) => Promise<TemplateSyncDiff>`
  - `syncTemplate: (serviceId: number, data: SyncTemplateRequest) => Promise<Service>`

- [ ] **Step 1: 在 `types/index.ts` 中补充类型声明**
- [ ] **Step 2: 在 `api/index.ts` 中补充接口请求封装**
- [ ] **Step 3: 运行 `npm run build --prefix web` 确保无类型错误**
- [ ] **Step 4: Git commit (`git commit -m "feat(web): 增加模板差异对比与同步相关的 TypeScript 类型与 API 方法"`)**

---

### Task 4: 前端交互组件与详情页集成 (UI Components & Integration)

**Files:**
- Create: `web/src/components/service/TemplateSyncModal.tsx`
- Test: `web/src/components/service/TemplateSyncModal.test.tsx`
- Modify: `web/src/pages/Services/ServiceDetail.tsx`
- Test: `web/src/pages/Services/ServiceDetail.test.tsx`

**UI Requirements:**
- `TemplateSyncModal`:
  - 标题：“同步模板配置 / Sync Template Settings”；
  - 勾选项 1: JVM 调优参数（复选框 + 当前服务值 vs 模板最新值 Diff 展示）；
  - 勾选项 2: 健康检测配置（复选框 + 当前服务值 vs 模板最新值 Diff 展示）；
  - 提示：“更新配置后，将在下一次启动或重新部署时生效”；
  - 底部操作按钮：
    - 左下角：`[不再提示本次更新]` (灰/次级按钮)；
    - 右下角：`[取消]`、`[仅同步配置]`；若服务为运行中状态，额外提供 `[同步并立即重启]`。
- `ServiceDetail.tsx`:
  - 页面加载时自动调用 `getTemplateSyncDiff`；
  - 当 `diff.has_update && !diff.ignored` 时，顶部展示黄色提示横幅：
    > ⚠️ **检测到所属模板配置已更新**（包含 JVM 或健康检测变更） [查看并同步] [忽略本次]
  - 在 JVM 配置卡片标题旁，常驻展示 `[同步模板配置]` 小按钮，即使忽略了横幅，用户随时可以打开弹窗手动同步。

- [ ] **Step 1: 编写 `TemplateSyncModal.test.tsx` 单元测试**
- [ ] **Step 2: 实现 `TemplateSyncModal.tsx` 组件**
- [ ] **Step 3: 在 `ServiceDetail.tsx` 中集成横幅提醒、常驻同步按钮与弹窗逻辑**
- [ ] **Step 4: 更新 `ServiceDetail.test.tsx` 增加同步横幅与弹窗触发测试**
- [ ] **Step 5: 运行 `npm test --prefix web -- --run` 确保前端测试全部通过**
- [ ] **Step 6: Git commit (`git commit -m "feat(ui): 服务详情页集成模板更新感知横幅与参数选择性同步弹窗"`)**

---

### Task 5: 验证与集成验收 (Verification & Polish)

**Files:**
- 全局测试运行与构建检查

- [ ] **Step 1: 运行前端全量测试 `npm test --prefix web -- --run`**
- [ ] **Step 2: 运行前端打包构建 `npm run build --prefix web`**
- [ ] **Step 3: 运行后端全量测试 `go test -count=1 ./...`**
- [ ] **Step 4: 检查并提交最终工作区状态**
- [ ] **Step 5: 向用户反馈实施结果与使用说明**
