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

test("renderer ignores progress events from a previously selected account", async () => {
  const source = await readFile(new URL("../src/desktop/renderer.js", import.meta.url), "utf8");
  assert.match(source, /if \(progress\.uuid && progress\.uuid !== state\.account\?\.uuid\) return;/);
});
