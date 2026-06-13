# 布吉岛战绩与连胜统计

用于 `https://user.mcbjd.net/#/stats` 的 Tampermonkey 用户脚本。脚本复用页面当前登录态，分页获取全部战绩，并按精确游戏模式统计当前连胜和历史最高连胜。

## 安装

1. 安装油猴扩展。
   - Chrome / Edge 推荐安装 [Tampermonkey](https://www.tampermonkey.net/)。
   - Firefox 也可以使用 Tampermonkey 或 Violentmonkey。
2. 打开脚本发布页：[布吉岛战绩与连胜统计 - Greasy Fork](https://greasyfork.org/zh-CN/scripts/582401-%E5%B8%83%E5%90%89%E5%B2%9B%E6%88%98%E7%BB%A9%E4%B8%8E%E8%BF%9E%E8%83%9C%E7%BB%9F%E8%AE%A1)。
3. 点击 Greasy Fork 页面上的“安装此脚本”。
4. 在油猴弹出的确认页面中点击“安装”。
5. 登录 [布吉岛用户中心](https://user.mcbjd.net/#/stats)，进入“战绩”页面。
6. 页面右侧会出现“连胜统计”入口，打开后选择账号、截止日期和分页间隔，再点击“抓取至截止日期”。

如果 Greasy Fork 无法访问，也可以下载本仓库的 `dist/bjd-wins.user.js`，在 Tampermonkey 后台中新建脚本并粘贴安装。

## 桌面版

桌面版目标是脱离浏览器插件，打包为 Windows 双击运行的程序。它使用 Electron 打开本地界面，并在内置登录窗口中登录布吉岛用户中心。

```powershell
npm.cmd install --cache .npm-cache
npm.cmd run desktop
npm.cmd run desktop:dist
```

- `npm.cmd run desktop`：开发模式启动桌面程序。
- `npm.cmd run desktop:dist`：打包 Windows portable EXE，输出到 `release/`。
- 桌面版会把战绩缓存到程序用户数据目录，不会把 token 写入项目文件。
- 桌面版仍只读取当前登录账号 `binding/list` 返回的已绑定角色。
- “更新”会抓取最新分页，并在命中本地缓存记录后停止。
- “重新抓取”会清空当前账号缓存，再按截止日期完整抓取。
- “启动后自动更新”默认开启，可在程序内取消勾选，偏好会保存在本地。

## 开发

```powershell
npm.cmd install --cache .npm-cache
npm.cmd test
npm.cmd run build
```

构建产物位于 `dist/bjd-wins.user.js`，在 Tampermonkey 中安装即可。

抓取时可通过浏览器日期选择器选择截止日期，并调整分页请求间隔。截止日期默认 `2025-01-01`，分页间隔默认 `0.1` 秒且可按 `0.1` 秒精度调整。脚本会保留截止日期当天及之后的记录，并在分页已经越过截止日期后停止继续请求。

若服务器返回“请勿频繁请求”或 HTTP 429，脚本会自动延长等待时间并重试当前页。

## 数据与隐私

- 脚本只在布吉岛用户中心运行。
- 每次请求时从页面读取登录 token，不保存、不显示、不导出 token。
- 战绩和详情仅保存在当前页面内存中，刷新页面后清空。
