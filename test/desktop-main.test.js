import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop windows hide the default Electron menu", async () => {
  const source = await readFile(new URL("../src/desktop/main.js", import.meta.url), "utf8");
  assert.match(source, /Menu\.setApplicationMenu\(null\)/);
  assert.match(source, /autoHideMenuBar:\s*true/);
  assert.match(source, /setMenuBarVisibility\(false\)/);
});

test("desktop external navigation only opens http pages", async () => {
  const source = await readFile(new URL("../src/desktop/main.js", import.meta.url), "utf8");
  const navigation = await readFile(new URL("../src/desktop/navigation.js", import.meta.url), "utf8");
  assert.match(source, /isHttpPage/);
  assert.match(navigation, /function isHttpPage\(url\)/);
  assert.match(navigation, /protocol === "https:" \|\| protocol === "http:"/);
  assert.match(source, /function openExternalHttp\(url\) \{[\s\S]*?if \(isHttpPage\(url\)\) shell\.openExternal\(url\);/);
  assert.doesNotMatch(source, /setWindowOpenHandler\(\(\{ url \}\) => \{\s*shell\.openExternal\(url\)/);
});

test("desktop login keeps web OAuth navigation and popups inside the sandboxed login flow", async () => {
  const source = await readFile(new URL("../src/desktop/main.js", import.meta.url), "utf8");
  const navigation = await readFile(new URL("../src/desktop/navigation.js", import.meta.url), "utf8");
  assert.match(source, /configureLoginFlowWindow/);
  assert.match(source, /configureLoginFlowWindow\(loginWindow\)/);
  assert.doesNotMatch(source, /hardenBjdWindow\(loginWindow\)/);
  assert.match(navigation, /function configureLoginFlowWindow\(windowRef\)/);
  assert.match(navigation, /if \(!isLoginFlowPage\(url\)\) return \{ action: "deny" \}/);
  assert.match(navigation, /return \{\s*action: "allow",\s*overrideBrowserWindowOptions:/s);
  assert.match(navigation, /webContents\.on\("did-create-window", \(childWindow\) => \{/);
  assert.match(navigation, /configureLoginFlowWindow\(childWindow\)/);
});

test("record fetching validates bound uuids and scopes progress events", async () => {
  const source = await readFile(new URL("../src/desktop/main.js", import.meta.url), "utf8");
  assert.match(source, /selectDesktopAccount\(await desktopPost\("\/binding\/list"\), uuid\)/);
  assert.match(source, /"records:progress", \{\s*\.\.\.progress,\s*uuid: account\.uuid/s);
});

test("cache and match ipc validate the selected bound uuid", async () => {
  const source = await readFile(new URL("../src/desktop/main.js", import.meta.url), "utf8");
  assert.match(source, /async function requireBoundAccount\(uuid\)/);
  assert.match(source, /ipcMain\.handle\("cache:load"[\s\S]*?requireBoundAccount\(uuid\)/);
  assert.match(source, /ipcMain\.handle\("cache:clear-records"[\s\S]*?requireBoundAccount\(uuid\)/);
  assert.match(source, /ipcMain\.handle\("match:get"[\s\S]*?requireBoundAccount\(record\?\.uuid\)/);
});

test("desktop exposes cancellable match detail prefetch ipc with uuid-scoped progress", async () => {
  const source = await readFile(new URL("../src/desktop/main.js", import.meta.url), "utf8");
  assert.match(source, /const matchDetailsCoordinator = createFetchCoordinator\(\)/);
  assert.match(source, /ipcMain\.handle\("match-details:prefetch"[\s\S]*?requireBoundAccount\(uuid\)/);
  assert.match(source, /"match-details:progress", \{\s*\.\.\.progress,\s*uuid: account\.uuid/s);
  assert.match(source, /ipcMain\.handle\("match-details:cancel"[\s\S]*?matchDetailsCoordinator\.cancel\(\)/);
  assert.match(source, /runMatchDetailPrefetch/);
  assert.match(source, /writeMatchDetailsBatch/);
  assert.match(source, /matchDetailRequests\.run/);
});

test("desktop binding ipc validates server state and exposes the official fallback", async () => {
  const source = await readFile(new URL("../src/desktop/main.js", import.meta.url), "utf8");
  assert.match(source, /ipcMain\.handle\("binding:bind"/);
  assert.match(source, /ipcMain\.handle\("binding:unbind"/);
  assert.match(source, /ipcMain\.handle\("binding:open-official"/);
  assert.match(source, /const BIND_URL = `\$\{SITE_ORIGIN\}\/#\/bind-data`/);
});

test("renderer ignores progress events from a previously selected account", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /if \(progress\.uuid && progress\.uuid !== state\.account\?\.uuid\) return;/);
});

test("renderer keeps account context when returning from official binding", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /const currentUuid = state\.account\?\.uuid \?\? ""/);
  assert.match(source, /loadCurrentAccount\(\{ uuid: currentUuid, fallbackToDefault: true \}\)/);
});

test("renderer sends the current account uuid when loading match details", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /const actionUuid = state\.account\?\.uuid \?\? ""/);
  assert.match(source, /desktop\.getMatchDetails\(\{\s*\.\.\.record,\s*uuid: actionUuid/s);
});

test("desktop ui includes match analytics tab and controls", async () => {
  const html = await readFile(new URL("../src/desktop/index.html", import.meta.url), "utf8");
  assert.match(html, /id="analyticsTab"/);
  assert.match(html, /id="analyticsPanel"/);
  assert.match(html, /id="analyticsPrefetchButton"/);
  assert.doesNotMatch(html, /id="analyticsPrefetchMode"/);
  assert.doesNotMatch(html, /保守模式/);
  assert.match(html, /对局数据/);
  assert.match(html, /id="analyticsBedwarsMaps"/);
  assert.match(html, /id="analyticsSkywarsMaps"/);
});

test("renderer does not auto-update when binding is required", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /if \(result\.bindingRequired\) \{[\s\S]*?return;/);
  assert.match(source, /autoUpdate && state\.autoUpdateEnabled && state\.account\?\.uuid/);
});

test("desktop ui includes the binding guide, dialog, and custom account menu", async () => {
  const html = await readFile(new URL("../src/desktop/index.html", import.meta.url), "utf8");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /id="bindingGuide"/);
  assert.match(html, /id="bindingDialog"/);
  assert.match(html, /id="accountMenuPanel"/);
  assert.doesNotMatch(html, /id="accountSelect"/);
});

test("desktop header exposes accessible external profile links", async () => {
  const html = await readFile(new URL("../src/desktop/index.html", import.meta.url), "utf8");
  assert.match(html, /class="external-links"/);
  assert.match(html, /href="https:\/\/github\.com\/QCMaxcer\/BJD-Streaks"/);
  assert.match(html, /href="https:\/\/space\.bilibili\.com\/399194206"/);
  assert.match(html, /href="https:\/\/mcbjd\.net\/"/);
  assert.match(html, /aria-label="打开 GitHub 项目主页"/);
  assert.match(html, /aria-label="打开 Bilibili 主页"/);
  assert.match(html, /aria-label="打开布吉岛官网"/);
});

test("desktop animations respect reduced motion preferences", async () => {
  const css = await readFile(new URL("../src/desktop/desktop.css", import.meta.url), "utf8");
  assert.match(css, /--motion-fast:\s*160ms/);
  assert.match(css, /--motion-normal:\s*220ms/);
  assert.match(css, /\.sliding-tabs::before/);
  assert.match(css, /--indicator-x/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("renderer delegates visualization wheel behavior to a pure action resolver", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /resolveVisualizationWheelAction/);
  assert.match(source, /case "scroll-x"/);
  assert.match(source, /case "zoom"/);
  assert.match(source, /passive:\s*false/);
});

test("renderer limits expandable analytics rankings and colors total metrics", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/desktop/desktop.css", import.meta.url), "utf8");
  assert.match(source, /analyticsExpand/);
  assert.match(source, /items:\s*5/);
  assert.match(source, /teammates:\s*10/);
  assert.match(source, /bedwarsMaps:\s*10/);
  assert.match(source, /skywarsMaps:\s*10/);
  assert.match(source, /step:\s*5/);
  assert.match(source, /step:\s*10/);
  assert.match(source, /metric positive/);
  assert.match(source, /metric negative/);
  assert.match(source, /metric neutral/);
  assert.match(css, /\.metric\.positive strong/);
  assert.match(css, /\.metric\.negative strong/);
  assert.match(css, /\.metric\.neutral strong/);
});

test("renderer opens match detail immediately and ignores stale detail responses", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /activeDetailKey/);
  assert.match(source, /renderDetailLoading\(record\)/);
  assert.match(source, /if \(state\.activeDetailKey !== key\) return;/);
});

test("renderer reuses persisted match detail cache before requesting a record detail", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /state\.matchDetails\[key\]\?\.raw/);
  assert.match(source, /if \(!details\) \{[\s\S]*?desktop\.getMatchDetails/);
});

test("renderer caches analytics models and invalidates them with data versions", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /recordsVersion:\s*0/);
  assert.match(source, /matchDetailsVersion:\s*0/);
  assert.match(source, /analyticsDirty:\s*true/);
  assert.match(source, /analyticsCache:\s*new Map\(\)/);
  assert.match(source, /normalizedDetailCache:\s*new Map\(\)/);
  assert.match(source, /lastAnalyticsModel:\s*null/);
  assert.match(source, /function getAnalyticsModel\(/);
  assert.match(source, /function invalidateAnalyticsCache\(/);
  assert.match(source, /recordsVersion \+= 1/);
  assert.match(source, /matchDetailsVersion \+= 1/);
});

test("renderer only renders analytics when the analytics tab is visible", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  const setRecordsBody = source.match(/function setRecords\(records\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  const visibleBody = source.match(/function renderAnalyticsIfVisible\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(source, /function renderAnalyticsIfVisible\(/);
  assert.match(source, /function scheduleAnalyticsRender\(/);
  assert.match(visibleBody, /scheduleAnalyticsRender\(\)/);
  assert.match(source, /els\.analyticsTab\.addEventListener\("click"[\s\S]*?renderAnalyticsIfVisible\(\)/);
  assert.match(setRecordsBody, /renderAnalyticsIfVisible\(\)/);
  assert.doesNotMatch(setRecordsBody, /renderAnalytics\(\)/);
});

test("renderer expands analytics rankings without rebuilding full analytics", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  const expandBody = source.match(/function expandAnalyticsList\(key, step\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(source, /function renderOneAnalyticsRank\(/);
  assert.match(expandBody, /renderOneAnalyticsRank\(key,/);
  assert.doesNotMatch(expandBody, /renderAnalytics\(\)/);
});
