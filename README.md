# OpsHub

<div align="center">

### 轻量级自包含单机 Java 及中间件运维发布控制台
*Lightweight, Single-Binary Java & Middleware Operations Platform*

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React Version](https://img.shields.io/badge/React-18.3-61DAFB?style=flat&logo=react)](https://react.dev)
[![Zero CGO](https://img.shields.io/badge/CGO-Disabled-success)](#)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#)

</div>

---

## 📖 用户使用手册 (User Manual)

请参阅完整的 [**OpsHub 用户使用手册 (USER_MANUAL.md)**](./USER_MANUAL.md)，包含详细的操作流程、架构解析、API 规范与故障排查指南。

---

## ✨ 核心特性

- 📦 **单二进制零依赖交付**：基于 Go 1.22+ 与 React 18，前端 Vite 资源通过 `embed.FS` 静态嵌入，配合 `modernc.org/sqlite` 实现 **100% 零 CGO 编译**。
- 🛡️ **双模进程强治理**：
  - **Native 模式**：通过 `Setpgid: true` 实现独立进程组隔离与负 PID 信号树形广播，杜绝孤儿/僵尸进程。
  - **Systemd 模式**：自动化动态生成 Linux Systemd 单元文件，支持开机自启与进程异常自动重启。
- 🚀 **7 步就绪式发布与秒级回滚**：
  - 预检 → 原地备份 → 停机 → 制品分发 → 启动 → Actuator/TCP 探活 → 生效。
  - 探测失败自动触发毫秒级快速回滚，版本生效状态严格受保护。
- 💻 **极客运维控制台 UI**：
  - Dark Ops 暗黑沉浸风格与实时心跳脉冲状态指示。
  - 基于 `xterm.js` 的实时 WebSocket 高性能日志终端，大文件反向快速定位。
  - 可视化 JVM 内存调优滑块与垃圾回收器快速切换。
  - 基于动态规划 LCS 算法的在线配置对比编辑器，保存自动生成快照备份。
- 🔒 **全链路安全防护**：
  - Bcrypt 散列算法、无状态 HMAC-SHA256 JWT 身份认证。
  - 针对破坏性/变更性请求（POST/PUT/DELETE/PATCH）的全局异步不可抵赖操作审计日志。

---

## ⚡ 快速编译与运行

```bash
# 1. 编译全平台单一可执行文件（含前端静态资源）
make build-all

# 2. 启动服务
./bin/opshub

# 首次启动控制台将自动打印 admin 账号的随机初始密码。
# 浏览器访问 http://localhost:8080 即可登录使用。
```

---

## 🛠️ 项目结构

```text
.
├── cmd/opshub/            # 程序入口 (main.go)
├── embed.go               # 前端静态资源嵌入定义 (//go:embed all:web/dist)
├── internal/
│   ├── api/               # Gin HTTP 路由、中间件与 RESTful 控制器
│   │   ├── handler/       # 业务控制器 (服务、模板、JDK、制品、指标、审计)
│   │   ├── middleware/    # JWT 鉴权与全局审计日志记录中间件
│   │   └── websocket/     # 实时日志推流 WebSocket Hub
│   ├── config/            # 应用配置载入与环境变量管理
│   ├── database/          # SQLite WAL 模式数据库初始化与迁移
│   ├── model/             # 领域模型定义
│   ├── prober/            # HTTP / TCP / 进程存活性探针
│   ├── service/           # 7步发布流水线、JDK扫描、制品仓库、认证服务
│   ├── supervisor/        # Native 进程组隔离与 Systemd 桥接服务守护器
│   ├── tailer/            # 高性能大文件反向 Seek 行读取器
│   └── template/          # 模板渲染与 JVM 参数合并引擎
├── web/                   # React 18 + Vite + Tailwind + xterm 前端工程
├── test/e2e/              # 单二进制打包与端到端集成测试
└── Makefile               # 一键构建与测试脚本
```
