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
  assert.match(source, /function isHttpPage\(url\)/);
  assert.match(source, /protocol === "https:" \|\| protocol === "http:"/);
  assert.match(source, /function openExternalHttp\(url\) \{[\s\S]*?if \(isHttpPage\(url\)\) shell\.openExternal\(url\);/);
  assert.doesNotMatch(source, /setWindowOpenHandler\(\(\{ url \}\) => \{\s*shell\.openExternal\(url\)/);
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
  assert.match(source, /desktop\.getMatchDetails\(\{\s*\.\.\.record,\s*uuid: state\.account\?\.uuid \?\? ""/s);
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
