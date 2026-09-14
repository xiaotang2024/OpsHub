# OpsHub: 轻量级单服务器 Java 服务与中间件部署平台设计说明书

## 1. 项目背景与定位

### 1.1 核心痛点
在单台物理机、虚拟机或内网隔离节点上部署管理 Java 服务及中间件时，Kubernetes、Rancher 等容器编排工具过重且维护成本高。传统手工运维方式依赖自定义 Shell 脚本与 `nohup`，容易出现环境混乱（如 JDK 版本错乱）、进程守护不可靠（意外崩溃无法捕获）、发布与回滚流程不规范、无统一审计与日志查看等痛点。

### 1.2 解决方案
**OpsHub** 是一套自包含、轻量级、面向单服务器的 Java 服务与中间件部署运维平台。系统以“部署模板”为核心抽象，以单二进制（内嵌 SQLite 与 React 前端）方式交付，运行于目标服务器即可纳管该服务器上的所有服务生命周期。

---

## 2. 技术选型与分发形态

- **后端开发语言**：Go (1.22+)
  - Web 框架：Gin / Echo（轻量、高性能）
  - 嵌入式数据库驱动：`modernc.org/sqlite`（纯 Go 实现，无 CGO 依赖，极大简化交叉编译与单文件交付）
  - 系统底层调用：`os/exec`, `syscall`, `golang.org/x/sys/unix`
- **前端技术栈**：React 18 + Vite + TypeScript + Ant Design + `@xterm/xterm`
- **静态资源内嵌**：Go `embed.FS` 将前端 Vite 构建生成的 `dist` 目录内嵌编译至可执行文件中。
- **交付形态**：单个静态二进制执行文件 `opshub`，无外部运行时依赖，单命令即可启动。

---

## 3. 宿主机磁盘布局规范

平台在服务器上的目录划分为两部分：OpsHub 自身数据目录，以及由模板规划的被管理服务目录。

```
/opt/opshub/                                 # 平台主工作目录（可通过配置文件重定义）
├── opshub                                   # 编译生成的单可执行二进制文件
├── opshub.yaml                              # 基础配置文件（端口、密钥、数据目录）
└── data/                                    # 平台数据目录
    ├── opshub.db                            # 嵌入式 SQLite 数据库文件
    ├── packages/                            # 集中制品库（历史版本存储仓库）
    │   └── {service_name}/                  # 每个服务的历史包归档
    │       ├── {service_name}-v1.0.0.jar
    │       └── {service_name}-v1.0.1.jar
    └── logs/                                # OpsHub 平台自身的运行日志

# --- 被纳管服务的部署目录（由模板/服务实例自由指定绝对路径，如 /opt/apps/） ---
/opt/apps/{service_name}/                    # 服务实例目标安装目录（原地部署）
├── .opshub.pid                              # 运行时 PID 文件（仅内置守护模式）
├── app.jar (或解压后的归档文件)              # 当前运行生效的二进制程序包
├── backup/                                  # 现场快速备份目录
│   └── app.jar.prev                         # 上一版本备份包
├── config/                                  # 配置文件目录（支持在线编辑与备份）
│   ├── application.yml
│   └── application.yml.bak.20260909_120000
└── logs/                                    # 应用程序输出的运行日志
    ├── console.log                          # 标准输出/标准错误重定向
    └── app.log                              # 业务框架输出日志
```

---

## 4. 核心数据模型 (Database Schema)

平台在 SQLite 中维护以下核心表结构：

### 4.1 JDK 资产表 (`jdk_assets`)
| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY | 自增主键 |
| `name` | TEXT NOT NULL UNIQUE | JDK 别名（如 `OpenJDK-17`, `Oracle-JDK-8`） |
| `java_home` | TEXT NOT NULL | `JAVA_HOME` 绝对路径 |
| `bin_path` | TEXT NOT NULL | `java` 可执行文件的绝对路径 |
| `version_str` | TEXT | 解析出的版本号（如 `17.0.9`） |
| `is_system` | BOOLEAN | 是否为系统默认或自动扫描发现 |
| `created_at` | DATETIME | 登记时间 |

### 4.2 部署模板表 (`templates`)
| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY | 自增主键 |
| `name` | TEXT NOT NULL UNIQUE | 模板名称（如 `Spring Boot 标准模板`、`Nacos 中间件模板`） |
| `type` | TEXT NOT NULL | 模板类型：`java_jar`, `generic_archive` |
| `default_jdk_id` | INTEGER | 默认绑定的 JDK ID（外键关联 `jdk_assets.id`） |
| `install_dir_pattern` | TEXT NOT NULL | 默认安装目录规则（如 `/opt/apps/${SERVICE_NAME}`） |
| `jvm_options` | TEXT | 默认 JVM 参数配置（JSON 或格式化串，包含堆内存、GC配置等） |
| `env_vars` | TEXT | 默认环境变量字典（JSON 存储） |
| `supervision_mode` | TEXT NOT NULL | 默认生命周期模式：`native` (内置守护) 或 `systemd` |
| `start_cmd` | TEXT | 启动命令渲染模板 |
| `stop_cmd` | TEXT | 停止命令模板（若为空则使用默认信号发送机制） |
| `health_check_config` | TEXT | 健康检查配置（JSON：类型 `http/tcp/process`、端口、路径、超时与重试） |
| `uninstall_rules` | TEXT | 卸载清理规则（JSON：是否停机、清理哪些文件、是否删除 systemd） |
| `created_at` | DATETIME | 创建时间 |
| `updated_at` | DATETIME | 更新时间 |

### 4.3 服务实例表 (`services`)
| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY | 自增主键 |
| `name` | TEXT NOT NULL UNIQUE | 服务标识名（英文字符与中划线，如 `order-service`） |
| `template_id` | INTEGER NOT NULL | 关联的模板 ID |
| `jdk_id` | INTEGER | 关联的具体 JDK ID（可覆盖模板） |
| `install_dir` | TEXT NOT NULL | 宿主机实际安装目录绝对路径 |
| `port` | INTEGER | 主监听端口号（支持端口冲突检测） |
| `jvm_options` | TEXT | 实例级覆盖的 JVM 参数 |
| `env_vars` | TEXT | 实例级覆盖的环境变量（JSON） |
| `supervision_mode` | TEXT NOT NULL | 当前实际生效的模式：`native` 或 `systemd` |
| `status` | TEXT NOT NULL | 状态：`STOPPED`, `STARTING`, `RUNNING`, `UNHEALTHY`, `STOPPING`, `FAILED`, `UNINSTALLED` |
| `current_artifact_id` | INTEGER | 当前已部署生效的制品 ID |
| `pid` | INTEGER | 当前运行进程的 PID（Native 模式下记录） |
| `created_at` | DATETIME | 创建时间 |
| `updated_at` | DATETIME | 更新时间 |

### 4.4 制品库表 (`artifacts`)
| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY | 自增主键 |
| `service_id` | INTEGER NOT NULL | 所属服务 ID |
| `filename` | TEXT NOT NULL | 上传原始文件名（如 `order-service-1.0.0.jar`） |
| `file_size` | INTEGER NOT NULL | 文件大小（字节） |
| `sha256` | TEXT NOT NULL | SHA256 完整性哈希 |
| `storage_path` | TEXT NOT NULL | 在集中制品库中的保存绝对路径 |
| `version_tag` | TEXT NOT NULL | 版本号标签（用户指定或时间戳生成） |
| `upload_time` | DATETIME | 上传时间 |

### 4.5 部署与操作审计记录表 (`deploy_records` / `audit_logs`)
| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY | 自增主键 |
| `service_id` | INTEGER | 目标服务 ID |
| `artifact_id` | INTEGER | 关联的制品 ID（仅部署/回滚有值） |
| `action` | TEXT NOT NULL | 操作：`DEPLOY`, `ROLLBACK`, `START`, `STOP`, `RESTART`, `UNINSTALL`, `CONFIG_EDIT` |
| `operator` | TEXT NOT NULL | 操作人用户名 |
| `client_ip` | TEXT | 客户端请求 IP |
| `status` | TEXT NOT NULL | 执行结果：`SUCCESS`, `FAILED` |
| `output_log` | TEXT | 执行过程控制台关键输出日志 |
| `started_at` | DATETIME | 开始时间 |
| `finished_at` | DATETIME | 结束时间 |

---

## 5. 模板引擎与参数组装规则

### 5.1 变量替换机制
模板中支持以下预定义占位符：
- `${SERVICE_NAME}`：服务唯一名称
- `${INSTALL_DIR}`：安装目录绝对路径
- `${PACKAGE_FILE}`：部署制品绝对路径（如 `${INSTALL_DIR}/app.jar`）
- `${JAVA_BIN}`：计算出的 Java 执行文件绝对路径
- `${JVM_OPTS}`：合并计算出的 JVM 启动参数串
- `${PORT}`：配置的主端口
- `${ENV_xxx}`：注入的自定义环境变量

### 5.2 Java 服务命令行自动拼装
针对 Java 一等公民，后端按规范组装参数：
```bash
${JAVA_BIN} \
  -server \
  ${JVM_HEAP_OPTS} \      # 如 -Xms1024m -Xmx2048m
  ${JVM_GC_OPTS} \        # 如 -XX:+UseG1GC -XX:MaxGCPauseMillis=200
  ${JVM_DUMP_OPTS} \      # 如 -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=${INSTALL_DIR}/logs/
  ${JVM_CUSTOM_OPTS} \    # 用户自由附加参数
  -jar ${PACKAGE_FILE} \
  --server.port=${PORT}
```

### 5.3 通用中间件渲染规则
- **解压动作**：`tar -zxvf ${PACKAGE_FILE} -C ${INSTALL_DIR} --strip-components=1`（或根据文件后缀自动识别 zip / tar.gz）
- **启动指令**：`${INSTALL_DIR}/bin/startup.sh`
- **停止指令**：`${INSTALL_DIR}/bin/shutdown.sh`

---

## 6. 双模式进程生命周期管理

### 6.1 内置守护模式 (Native Supervisor)
1. **进程隔离启动**：
   - 构造 `exec.Command`，设置 `Dir` 为 `${INSTALL_DIR}`，注入合并后的环境变量 `os.Environ()` + `${ENV_VARS}`。
   - 开启独立进程组：
     ```go
     cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
     ```
   - 标准输出与标准错误重定向至 `${INSTALL_DIR}/logs/console.log`。
2. **存量服务接管（重启自愈）**：
   - 将子进程 PID 写入 `${INSTALL_DIR}/.opshub.pid` 与 SQLite 数据库。
   - OpsHub 重启时，读取数据库中记录的 PID，调用 `syscall.Kill(pid, 0)` 探测存活，并校验 `/proc/{pid}/cmdline`，自动重连纳管。
3. **优雅停机与强杀保底**：
   - 发送 `SIGTERM` 信号至进程组：`syscall.Kill(-pgid, syscall.SIGTERM)`。
   - 启动等待倒计时（默认 15 秒）。如果进程在超时时间内正常退出，标记为 `STOPPED`。
   - 若超时未退出，发送 `SIGKILL`（`-9`）强制回收整个进程组，防止僵尸残留。

### 6.2 Systemd 桥接模式 (Systemd Bridge)
1. **Unit 文件生成**：自动渲染 `/etc/systemd/system/opshub-{service_name}.service`：
   ```ini
   [Unit]
   Description=OpsHub Service - %i
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory={install_dir}
   ExecStart={start_cmd}
   ExecStop=/bin/kill -SIGTERM $MAINPID
   Restart=on-failure
   RestartSec=5s
   LimitNOFILE=65536

   [Install]
   WantedBy=multi-user.target
   ```
2. **生命周期代理**：调用 `systemctl daemon-reload`、`systemctl start/stop/restart opshub-{service_name}`，并利用 `systemctl is-active` 同步状态。
3. **模式切换支持**：支持在控制台将 Native 服务一键转为 Systemd 服务或反向降级。

---

## 7. 原地部署与版本回滚流水线

### 7.1 部署流程（7步状态机）
1. **前置预检**：检查目标目录读写权限、磁盘剩余容量、JDK 路径是否存在、端口是否被非本服务占用。
2. **原地备份**：在 `${INSTALL_DIR}/backup/` 复制保存当前包为 `app.jar.prev`。
3. **安全停机**：调用 Supervisor 优雅停止现有运行中的服务。
4. **包分发覆盖**：从 `/opt/opshub/data/packages/{service}/` 集中仓库将目标版本包复制/解压覆盖至 `${INSTALL_DIR}/app.jar`。
5. **动态拉起**：根据模板与服务最新参数，生成启动命令并执行拉起。
6. **健康就绪检查**：
   - 状态置为 `STARTING`。
   - 按照预设间隔（如 2 秒）探测 HTTP 探针（如 `/actuator/health`）或 TCP 端口。
   - 探针成功：标记状态为 `RUNNING`，部署宣布成功。
   - 探针超时（如 30 秒内未成功）：标记为 `FAILED`，自动提取启动日志末尾 50 行报错。
   - 若开启“失败自动回滚”，自动重新将 `app.jar.prev` 覆盖还原并拉起旧版本。
7. **写入部署记录**：在 `deploy_records` 记录执行人、耗时、状态与输出日志。

### 7.2 一键回滚流程
- 用户在 Web 端打开“版本历史”列表，挑选任意历史成功版本，点击“回滚到此版本”。
- 平台以该历史包为源，自动执行步骤 2~7，实现无损秒级回滚。

---

## 8. 可观测性、日志流与在线配置管理

### 8.1 WebSocket 流式日志架构
- **首屏加载**：客户端建立 WebSocket 连接后，后端使用 Seek 逆向读取日志文件末尾固定大小（默认 200 行 / 64KB），避免大文件加载导致内存暴涨。
- **动态跟随**：基于文件增量变更监听，持续向 WebSocket 发送新行数据。
- **前端体验**：使用 `@xterm/xterm` 渲染，支持 ANSI 颜色解码、自动滚屏锁定/解锁、正则过滤（如提取 `ERROR`）、一键下载完整日志文件。

### 8.2 在线配置编辑与防误触
- **文件发现**：自动定位 `${INSTALL_DIR}/config/` 目录或 `${INSTALL_DIR}/application.yml` 等常见配置文件。
- **在线高亮编辑**：前端提供 Monaco Editor / CodeMirror 编辑器，支持 YAML / Properties 语法高亮。
- **自动备份保护**：保存时自动生成 `application.yml.bak.{timestamp}`，支持快速对比 Diff 与历史版本还原。
- **重启关联提示**：保存成功后前端弹窗友好提示重启服务使配置生效。

### 8.3 进程性能指标
- 直接从 Linux 原生伪文件系统 `/proc/{pid}/stat` 和 `/proc/{pid}/status` 读取：
  - CPU 使用率计算
  - 物理常驻内存 (RSS) 与虚拟内存 (VSS)
  - 进程启动时间与运行运行时长
- 采集本机磁盘各挂载点使用率，在磁盘不足时给出告警。

---

## 9. 安全体系与用户认证

- **首次启动引导**：系统首次启动若无管理员，控制台打印随机初始高强度密码，或在前端首开时强制引导设置管理员密码。
- **JWT 会话鉴权**：接口请求通过 `Authorization: Bearer <token>` 验证，支持过期与注销。
- **全局操作审计**：对启停服务、部署版本、编辑配置、卸载等所有危险操作均强制记录操作者 IP、时间与执行结果。

---

## 10. 模块划分与代码工程结构建议

```
OpsHub/
├── cmd/
│   └── opshub/                      # 主程序入口 main.go
├── internal/
│   ├── config/                      # 平台自身配置文件解析
│   ├── database/                    # SQLite 初始化与 GORM/ORM 迁移
│   ├── model/                       # 数据实体定义
│   ├── service/                     # 核心领域服务
│   │   ├── template_service.go      # 模板管理与参数校验
│   │   ├── app_service.go           # 服务编排与部署流水线
│   │   ├── artifact_service.go      # 制品存储与哈希校验
│   │   ├── jdk_service.go           # JDK 扫描与资产管理
│   │   └── audit_service.go         # 审计记录
│   ├── supervisor/                  # 进程生命周期管理器
│   │   ├── supervisor.go            # 抽象接口定义
│   │   ├── native_supervisor.go     # 内置进程守护实现
│   │   └── systemd_supervisor.go    # Systemd 适配实现
│   ├── prober/                      # HTTP/TCP 健康探测器
│   ├── tailer/                      # 日志文件流式读取器
│   └── api/                         # HTTP 控制器与中间件
│       ├── handler/                 # 接口处理器
│       ├── middleware/              # JWT 鉴权与审计记录拦截器
│       └── websocket/               # 实时日志 WebSocket Hub
├── web/                             # React 前端源码 (Vite + Ant Design)
│   ├── src/
│   │   ├── pages/                   # 模板库、服务列表、服务详情、JDK管理、审计日志
│   │   ├── components/              # 日志终端、配置编辑器、JVM表单
│   │   └── api/                     # 后端 API 请求客户端
│   └── package.json
├── embed.go                         # go:embed 打包 web/dist
├── go.mod
└── README.md
```
