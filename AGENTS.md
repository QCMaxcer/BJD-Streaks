# BJD Streaks 项目速览

如果没有特殊说明，默认使用中文交流。

## 项目定位

BJD Streaks 是布吉岛战绩与连胜统计工具，同时提供：

- Windows Electron 桌面版：主力版本，支持登录、账号绑定、多账号切换、本地缓存、增量更新、对局详情、对局数据统计、连胜可视化和图表导出。
- Tampermonkey 用户脚本：运行在 `https://user.mcbjd.net/*`，复用网页登录态，在战绩页注入统计面板。

版本号以 `package.json` 为唯一来源。用户脚本构建时由 `scripts/build.mjs` 自动写入 `@version`。

## 常用命令

在 Windows PowerShell 下优先使用 `npm.cmd`，避免执行策略拦截 `npm.ps1`。

- `npm.cmd test`：运行 Node 内置测试。
- `npm.cmd run build`：构建 `dist/bjd-wins.user.js`。
- `npm.cmd run check`：先跑测试，再构建用户脚本。
- `npm.cmd run desktop`：开发模式启动 Electron 桌面版。
- `npm.cmd run desktop:dist`：打包 Windows portable EXE 到 `release/`。
- `npm.cmd audit --audit-level=high --cache .npm-cache`：发布前依赖审计。

发布前至少跑：

```powershell
npm.cmd run check
git diff --check
```

如果要发版，再跑 `npm.cmd audit --audit-level=high --cache .npm-cache` 和 `npm.cmd run desktop:dist`。

## 顶层结构

- `src/core.js`：共享核心数据处理，包含模式映射、时间解析、记录去重、连胜计算、筛选。
- `src/api.js`：用户脚本侧 API 封装和分页抓取逻辑。
- `src/userscript.js`：Tampermonkey 入口。
- `src/styles.js`：用户脚本样式。
- `src/desktop/`：Electron 桌面版。
- `src/match-detail.js`：对局详情标准化，兼容多种接口字段别名。
- `src/match-analytics.js`：对局数据面板的个人数据和队友排行聚合。
- `src/player-profile.js`：玩家资料标准化，去除 Minecraft 颜色码。
- `src/streak-visualization.js`：连胜可视化数据模型。
- `src/visualization-layout.js`：图表布局、缩放、tooltip 坐标等纯函数。
- `scripts/build.mjs`：esbuild 打包用户脚本。
- `test/`：Node 内置测试，按模块一一对应。
- `dist/bjd-wins.user.js`：用户脚本成品，需要提交。
- `release/`：桌面版打包产物，不提交。

## 桌面版架构

桌面版是 Electron 单窗口应用，主进程负责登录态、网络请求、缓存和文件导出；渲染进程负责 UI 状态和展示。

- `src/desktop/main.js`
  - 创建主窗口、登录窗口、官网绑定备用窗口。
  - 管理 Electron session 中的布吉岛 token / Cookie。
  - 通过 `desktopPost()` 请求 `https://user.mcbjd.net/api/api/*`。
  - 注册 IPC：认证、账号、绑定、缓存、战绩抓取、详情抓取、图表导出。
  - 所有按 UUID 的数据操作必须先用 `/binding/list` 校验 UUID 属于当前登录账号。

- `src/desktop/preload.cjs`
  - 通过 `contextBridge` 暴露最小 IPC API 给渲染进程。
  - 渲染进程不能直接访问 Node 或 Electron API。

- `src/desktop/renderer.js`
  - 管理所有桌面 UI 状态：登录、账号、缓存、抓取状态、标签页、对局详情、对局数据、可视化弹窗。
  - 监听 `records:progress` 和 `match-details:progress`，必须按 `uuid` 忽略旧账号进度。

- `src/desktop/index.html`
  - 桌面 UI 静态结构。

- `src/desktop/desktop.css`
  - 桌面 UI 样式和动效。

- `src/desktop/account.js`
  - 标准化 `/binding/list` 返回的多账号列表。
  - 处理账号选择、绑定、解绑和玩家资料缓存兜底。

- `src/desktop/cache.js`
  - 每个 UUID 独立缓存。
  - 缓存内容包括 `records`、`playerInfo`、`matchDetails`。
  - 写入使用临时文件原子替换，并串行化同 UUID 写操作，避免并发写丢数据。

- `src/desktop/fetch-coordinator.js`
  - 抓取取消与竞态控制。
  - 旧任务结束时不能清理新任务的 controller。

- `src/desktop/match-detail-scheduler.js`
  - 对局详情补全调度器。
  - 本地优先，跳过已缓存详情。
  - 自适应并发和请求速率，遇到 429 或“请勿频繁请求”会退避、降速、重试。
  - 批量写盘，取消时保留已完成详情。

- `src/desktop/navigation.js`
  - Electron 窗口导航策略。
  - 主窗口外链只允许系统浏览器打开 HTTP/HTTPS。
  - 绑定窗口只允许布吉岛域名。
  - 登录窗口必须允许 QQ/微信 OAuth 的 HTTP/HTTPS 跨域页面和 `about:blank` 弹窗，同时拒绝 `javascript:`、`file:`、`data:` 等危险协议。

- `src/desktop/preferences.js`
  - 本地偏好，例如启动后自动更新。

- `src/desktop/visualization.js`
  - 桌面端 SVG 图表渲染和导出 SVG 生成。

## 用户脚本架构

用户脚本入口是 `src/userscript.js`，构建到 `dist/bjd-wins.user.js`。

- 使用 `@match https://user.mcbjd.net/*`、`@grant none`。
- 在 `#/stats` 页面注入浮动入口和统计抽屉。
- 每次请求时读取网页 `localStorage.token`，不持久化 token。
- 通过同源接口请求：
  - `POST /api/api/binding/list`
  - `POST /api/api/stats/list`
  - `POST /api/api/stats/match`
- 用户脚本仅使用页面内存缓存，刷新页面后重新抓取。

## 布吉岛接口与数据流

已确认接口：

- `POST /api/api/binding/list`：获取当前登录账号已绑定的游戏账号列表。
- `POST /api/api/binding/bind`，请求体 `{ bindCode }`：绑定游戏账号。
- `POST /api/api/binding/unbind`，请求体 `{ UUID }`：解绑游戏账号。
- `POST /api/api/player/info`，请求体 `{ uuid }`：获取玩家资料。
- `POST /api/api/stats/list`，请求体 `{ page, uuid }`：分页获取轻量战绩索引。
- `POST /api/api/stats/match`，请求体 `{ id: matchId, date }`：获取单局详细战绩。

重要事实：

- `/stats/list` 主要只有 `matchId`、`date`、`type`、`win`。
- 击败、伤害、队伍、资源、物品、升级、队友等精确数据必须逐局请求 `/stats/match`，除非列表记录意外已经带完整详情。
- 统计对局数据时应优先读取本地 `matchDetails`，不要自动大量请求服务器。
- `recordKey(record)` 使用 `matchId + date`，是去重和详情缓存的主键。

## 抓取、缓存与限流规则

- 战绩分页从第 1 页开始。
- “更新”模式读取当前缓存 key，抓取最新分页；命中已缓存记录后停止并合并。
- “重新抓取”模式不使用缓存命中停止逻辑，按截止日期、空页、重复页或页数上限停止。
- 服务器返回 429 或“请勿频繁请求”时需要退避重试，不要简单提高并发。
- 战绩抓取使用顺序自适应均衡，不并发预取分页；遇到 429 或“请勿频繁请求”时退避并降速。
- 对局详情补全使用自适应模式；桌面 UI 不再暴露保守模式。
- “清空记录”应清空当前 UUID 的 `records` 和 `matchDetails`，保留 `playerInfo`。
- 退出登录清理登录态，不删除本地 UUID 缓存。

## 连胜和统计口径

- 只有 `win === true` 计为胜利。
- `false`、缺失、未知结果都中断连胜。
- 精确模式独立统计，其他模式不打断该模式连胜。
- 所有模式总览使用全部对局混合时间线。
- 当前连胜从该模式最新记录开始向前数。
- 历史最高连胜按时间正序扫描，并列时选择最近一次最高连胜。
- 可视化默认范围是全部历史，日期范围只裁剪显示，不重新计算连胜。
- 对局数据面板只统计当前账号本人；本人识别依赖玩家资料名和绑定账号名候选。

## 安全与登录注意事项

- 不要把 token 写入缓存、日志、导出文件或 README。
- 桌面版只允许查询当前登录态 `/binding/list` 返回的 UUID。
- 绑定码只用于一次 `binding/bind` 请求，不持久化。
- 登录窗口不要使用绑定窗口的“仅允许布吉岛域名”策略，否则 QQ/微信 OAuth 会卡在转圈。
- 外部主页链接通过系统浏览器打开；不要在主窗口内加载任意外站。

## 开发约定

- 优先复用现有纯函数模块，避免把业务规则写进 DOM 代码。
- 手动编辑文件用 `apply_patch`。
- 不要回退用户未明确要求回退的改动；工作区可能有未提交变更。
- 修改抓取、缓存、登录、账号、统计口径时必须补测试。
- 涉及 Electron GUI 的真实启动需要用户批准；无法真实登录时，用模块测试和官网跳转观察补足证据，并在结果中说明未完成真实账号提交。
- Windows PowerShell 下避免用 `>` 写 JSON 给 Python 脚本；必要时用明确 UTF-8 写法。

## 测试索引

- `test/core.test.js`：核心记录、模式、连胜、筛选。
- `test/api.test.js`：分页抓取、限流、截止日期、增量停止。
- `test/desktop-account.test.js`：绑定账号、UUID 校验、绑定/解绑选择逻辑。
- `test/desktop-cache.test.js`：缓存读写、详情缓存、并发写。
- `test/desktop-fetch-coordinator.test.js`：抓取取消竞态。
- `test/desktop-main.test.js`：主进程 IPC 和关键静态约束。
- `test/desktop-navigation.test.js`：Electron 导航和登录 OAuth 策略。
- `test/desktop-preferences.test.js`：本地偏好。
- `test/desktop-visualization.test.js`：桌面可视化渲染约束。
- `test/match-detail.test.js`：对局详情标准化。
- `test/match-detail-scheduler.test.js`：详情补全调度器。
- `test/match-analytics.test.js`：对局数据面板统计。
- `test/player-profile.test.js`：玩家资料。
- `test/streak-visualization.test.js`：可视化数据模型。
- `test/visualization-layout.test.js`：图表布局、缩放、tooltip。

## 发布注意事项

- `dist/bjd-wins.user.js` 是用户脚本发布产物，需要提交。
- `release/` 中的 EXE 和 SHA256 是 GitHub Release 附件，不提交。
- 发版时同步检查 README、用户脚本、桌面版行为和版本号。
- 如果要提交和推送，先确认当前工作区里哪些改动属于本次任务，避免混入无关改动。
