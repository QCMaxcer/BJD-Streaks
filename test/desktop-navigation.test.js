import test from "node:test";
import assert from "node:assert/strict";
import {
  configureLoginFlowWindow,
  isBjdPage,
  isHttpPage,
  isLoginFlowPage,
} from "../src/desktop/navigation.js";

function createFakeWindow() {
  const handlers = new Map();
  return {
    handlers,
    menuVisible: true,
    setMenuBarVisibility(value) {
      this.menuVisible = value;
    },
    webContents: {
      setWindowOpenHandler(handler) {
        handlers.set("window-open", handler);
      },
      on(event, handler) {
        handlers.set(event, handler);
      },
    },
  };
}

test("login flow allows web OAuth pages and blank popup bootstrap pages", () => {
  assert.equal(isLoginFlowPage("https://graph.qq.com/oauth2.0/authorize"), true);
  assert.equal(isLoginFlowPage("https://open.weixin.qq.com/connect/qrconnect"), true);
  assert.equal(isLoginFlowPage("http://localhost/oauth/callback"), true);
  assert.equal(isLoginFlowPage("about:blank"), true);
});

test("login flow rejects non-web protocols", () => {
  assert.equal(isLoginFlowPage("javascript:alert(1)"), false);
  assert.equal(isLoginFlowPage("file:///C:/Windows/System32/calc.exe"), false);
  assert.equal(isLoginFlowPage("data:text/html,hello"), false);
  assert.equal(isLoginFlowPage("invalid url"), false);
});

test("BJD and generic HTTP page checks remain distinct", () => {
  assert.equal(isBjdPage("https://user.mcbjd.net/#/stats"), true);
  assert.equal(isBjdPage("https://graph.qq.com/oauth2.0/authorize"), false);
  assert.equal(isHttpPage("https://graph.qq.com/oauth2.0/authorize"), true);
  assert.equal(isHttpPage("about:blank"), false);
});

test("configured login flow allows sandboxed OAuth pages and rejects unsafe navigation", () => {
  const loginWindow = createFakeWindow();
  configureLoginFlowWindow(loginWindow);

  const openHandler = loginWindow.handlers.get("window-open");
  const allowed = openHandler({ url: "https://graph.qq.com/oauth2.0/authorize" });
  assert.equal(allowed.action, "allow");
  assert.equal(allowed.overrideBrowserWindowOptions.parent, loginWindow);
  assert.equal(allowed.overrideBrowserWindowOptions.webPreferences.sandbox, true);
  assert.deepEqual(openHandler({ url: "javascript:alert(1)" }), { action: "deny" });

  const navigateHandler = loginWindow.handlers.get("will-navigate");
  let prevented = false;
  navigateHandler({ preventDefault: () => { prevented = true; } }, "https://open.weixin.qq.com/connect/oauth2/authorize");
  assert.equal(prevented, false);
  navigateHandler({ preventDefault: () => { prevented = true; } }, "file:///C:/secret.txt");
  assert.equal(prevented, true);
});

test("OAuth child windows inherit the login flow policy", () => {
  const loginWindow = createFakeWindow();
  const childWindow = createFakeWindow();
  configureLoginFlowWindow(loginWindow);

  loginWindow.handlers.get("did-create-window")(childWindow);

  assert.equal(childWindow.menuVisible, false);
  assert.equal(typeof childWindow.handlers.get("window-open"), "function");
  assert.equal(typeof childWindow.handlers.get("will-navigate"), "function");
});
