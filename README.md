# BJD Streaks｜布吉岛战绩与连胜统计

BJD Streaks 用于读取 [布吉岛用户中心](https://user.mcbjd.net/#/stats) 中当前登录账号可访问的对局记录，并提供精确模式连胜统计、分类查找、对局详情和连胜可视化。

项目同时提供 Windows 桌面版和 Tampermonkey 用户脚本。桌面版支持本地持久缓存、增量更新和图表导出，适合作为日常使用版本。

## 下载与安装

### Windows 桌面版

1. 打开 [GitHub Releases](https://github.com/QCMaxcer/BJD-Streaks/releases/latest)。
2. 下载 `BJD-Streaks-1.0.1.exe`。
3. 双击运行，在程序内点击“登录布吉岛”并完成登录。
4. 登录后选择游戏账号，点击“更新”读取最新战绩。

桌面版是免安装 portable EXE。程序当前未进行商业代码签名；如果 Windows SmartScreen 显示“未知发布者”，请确认文件来自本仓库 Release，并使用 Release 附带的 SHA256 校验文件核对完整性。

### Tampermonkey 用户脚本

1. 在 Chrome、Edge 或 Firefox 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [Greasy Fork 发布页](https://greasyfork.org/zh-CN/scripts/582401-%E5%B8%83%E5%90%89%E5%B2%9B%E6%88%98%E7%BB%A9%E4%B8%8E%E8%BF%9E%E8%83%9C%E7%BB%9F%E8%AE%A1)。
3. 点击“安装此脚本”，然后登录 [布吉岛用户中心战绩页](https://user.mcbjd.net/#/stats)。

也可以下载仓库中的 [`dist/bjd-wins.user.js`](dist/bjd-wins.user.js)，在 Tampermonkey 中手动安装。

## 桌面版功能

- 使用内置登录窗口登录布吉岛用户中心，不需要手动复制 token。
- 读取当前登录账号已经绑定的全部游戏账号，并支持账号切换。
- 按 UUID 独立持久化玩家资料和战绩缓存，重启程序后可直接读取。
- “更新”从最新分页开始抓取，命中已有战绩后停止并合并新记录。
- “重新抓取”从第一页开始读取，并在成功后替换当前账号记录。
- 按精确游戏模式统计总局数、胜负、胜率、当前连胜和历史最高连胜。
- 分类查找战绩，支持模式、大类、结果、日期和比赛 ID 筛选。
- 按需加载对局详情，以队伍和玩家卡片展示战局数据。
- 提供每日胜负频次图和累计连胜折线图。
- 可视化默认展示全部历史，支持日期范围、横向缩放、跨度 Tooltip，以及 PNG / SVG 导出。

## 抓取与更新说明

- 截止日期表示“保留该日期当天及之后的战绩”。默认截止日期为 `2025-01-01`。
- 分页请求间隔默认 `0.1` 秒，可按 `0.1` 秒精度调整。
- 服务器返回“请勿频繁请求”或 HTTP 429 时，程序会自动延长等待时间并重试当前页。
- “启动后自动更新”默认开启，仅在程序启动时更新默认选中的第一个账号。
- 切换游戏账号只会读取该账号的本地缓存和玩家资料，不会自动发起战绩更新。
- “清空记录”只删除当前账号的战绩缓存，不删除玩家资料。

## 数据与隐私

- 桌面版只允许查询当前登录态下 `binding/list` 返回的游戏账号 UUID。
- 登录 token 只保存在 Electron 的布吉岛站点会话中，不写入项目目录、战绩缓存或导出文件。
- 桌面版将玩家资料、战绩缓存和自动更新偏好保存在 Electron 用户数据目录中。
- 退出登录会清理程序内的布吉岛登录态，但不会删除本地玩家资料和战绩缓存。
- 用户脚本只在 `https://user.mcbjd.net/*` 运行，每次请求时读取当前页面登录 token，不持久化 token。
- 用户脚本中的战绩和详情仅保存在当前页面内存，刷新页面后清空。

## 开发

要求 Node.js `22.12.0` 或更高版本。

```powershell
npm.cmd install --cache .npm-cache
npm.cmd run check
npm.cmd run desktop
```

常用命令：

- `npm.cmd test`：运行 Node 内置测试。
- `npm.cmd run build`：构建用户脚本到 `dist/bjd-wins.user.js`。
- `npm.cmd run check`：依次运行测试和用户脚本构建。
- `npm.cmd run desktop`：以开发模式启动桌面程序。
- `npm.cmd run desktop:dist`：打包 Windows portable EXE 到 `release/`。
- `npm.cmd audit --audit-level=high --cache .npm-cache`：检查依赖高危漏洞。

项目版本以 `package.json` 为唯一来源；用户脚本构建时会自动把该版本写入 `@version`。

## 发布检查

```powershell
npm.cmd run check
npm.cmd audit --audit-level=high --cache .npm-cache
npm.cmd run desktop:dist
git diff --check
```

发布产物不提交到 Git：

- `release/BJD-Streaks-<version>.exe`
- `release/BJD-Streaks-<version>.exe.sha256.txt`

用户脚本构建产物 `dist/bjd-wins.user.js` 会提交到仓库，并同时附加到 GitHub Release。

## 许可

[MIT License](LICENSE)
