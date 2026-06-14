import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop windows hide the default Electron menu", async () => {
  const source = await readFile(new URL("../src/desktop/main.js", import.meta.url), "utf8");
  assert.match(source, /Menu\.setApplicationMenu\(null\)/);
  assert.match(source, /autoHideMenuBar:\s*true/);
  assert.match(source, /setMenuBarVisibility\(false\)/);
});

test("record fetching validates bound uuids and scopes progress events", async () => {
  const source = await readFile(new URL("../src/desktop/main.js", import.meta.url), "utf8");
  assert.match(source, /selectDesktopAccount\(await desktopPost\("\/binding\/list"\), uuid\)/);
  assert.match(source, /"records:progress", \{\s*\.\.\.progress,\s*uuid: account\.uuid/s);
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

test("renderer does not auto-update when binding is required", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /if \(result\.bindingRequired\) \{[\s\S]*?return;/);
  assert.match(source, /autoUpdate && state\.autoUpdateEnabled && state\.account\?\.uuid/);
});

test("desktop ui includes the binding guide, dialog, and custom account menu", async () => {
  const html = await readFile(new URL("../src/desktop/index.html", import.meta.url), "utf8");
  assert.match(html, /id="bindingGuide"/);
  assert.match(html, /id="bindingDialog"/);
  assert.match(html, /id="accountMenuPanel"/);
  assert.doesNotMatch(html, /id="accountSelect"/);
});
