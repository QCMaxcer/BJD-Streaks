import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError, fetchAllRecords } from "../api.js";
import { unwrapData } from "../core.js";
import {
  bindDesktopAccount,
  loadDesktopAccount,
  selectDesktopAccount,
  unbindDesktopAccount,
} from "./account.js";
import { createCacheStore } from "./cache.js";
import { createFetchCoordinator } from "./fetch-coordinator.js";
import { createPreferenceStore } from "./preferences.js";

const SITE_ORIGIN = "https://user.mcbjd.net";
const STATS_URL = `${SITE_ORIGIN}/#/stats`;
const BIND_URL = `${SITE_ORIGIN}/#/bind-data`;
const API_ROOT = `${SITE_ORIGIN}/api/api`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let loginWindow = null;
let bindingWindow = null;
let bindingWindowPromise = null;
let authToken = "";
let cacheStore = null;
let preferenceStore = null;
const fetchCoordinator = createFetchCoordinator();

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "BJD Streaks",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalHttp(url);
    return { action: "deny" };
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function isBjdPage(url) {
  try {
    return new URL(url).origin === SITE_ORIGIN;
  } catch {
    return false;
  }
}

function isHttpPage(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function openExternalHttp(url) {
  if (isHttpPage(url)) shell.openExternal(url);
}

function hardenBjdWindow(windowRef) {
  windowRef.webContents.setWindowOpenHandler(({ url }) => {
    if (!isBjdPage(url)) openExternalHttp(url);
    return { action: "deny" };
  });
  windowRef.webContents.on("will-navigate", (event, url) => {
    if (!isBjdPage(url)) event.preventDefault();
  });
}

async function requireBoundAccount(uuid) {
  const requestedUuid = String(uuid ?? "").trim();
  if (!requestedUuid) throw new Error("请先选择游戏账号。");
  const { account } = selectDesktopAccount(await desktopPost("/binding/list"), requestedUuid);
  return account;
}

async function readTokenFromLoginWindow(windowRef) {
  if (!windowRef || windowRef.isDestroyed() || !isBjdPage(windowRef.webContents.getURL())) {
    return "";
  }
  const token = await windowRef.webContents.executeJavaScript(
    'localStorage.getItem("token") || ""',
    true,
  );
  return String(token || "");
}

function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return Promise.reject(new Error("登录窗口已打开，请先完成当前登录。"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      callback(value);
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
    };

    loginWindow = new BrowserWindow({
      width: 1100,
      height: 760,
      title: "登录布吉岛用户中心",
      parent: mainWindow ?? undefined,
      modal: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    loginWindow.setMenuBarVisibility(false);
    hardenBjdWindow(loginWindow);

    const check = async () => {
      try {
        const token = await readTokenFromLoginWindow(loginWindow);
        if (!token) return;
        authToken = token;
        settle(resolve, { authenticated: true });
      } catch {
        // The login window may be navigating; retry on the next load/timer tick.
      }
    };

    const timer = setInterval(check, 1000);
    loginWindow.webContents.on("did-finish-load", check);
    loginWindow.webContents.on("did-navigate", check);
    loginWindow.webContents.on("did-navigate-in-page", check);
    loginWindow.on("closed", () => {
      loginWindow = null;
      clearInterval(timer);
      if (!settled) reject(new Error("登录窗口已关闭，未获取到登录状态。"));
    });
    loginWindow.loadURL(STATS_URL);
  });
}

function openOfficialBindingWindow() {
  if (bindingWindow && !bindingWindow.isDestroyed()) {
    bindingWindow.focus();
    return bindingWindowPromise ?? Promise.resolve({ opened: true, alreadyOpen: true });
  }

  bindingWindowPromise = new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      bindingWindowPromise = null;
      callback(value);
    };
    bindingWindow = new BrowserWindow({
      width: 900,
      height: 760,
      title: "布吉岛游戏账号绑定",
      parent: mainWindow ?? undefined,
      modal: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    bindingWindow.setMenuBarVisibility(false);
    hardenBjdWindow(bindingWindow);
    bindingWindow.on("closed", () => {
      bindingWindow = null;
      settle(resolve, { opened: true, closed: true });
    });
    bindingWindow.loadURL(BIND_URL).catch((error) => {
      settle(reject, error);
      if (bindingWindow && !bindingWindow.isDestroyed()) bindingWindow.close();
    });
  });
  return bindingWindowPromise;
}

async function restoreAuthToken() {
  if (authToken) return true;

  const restoreWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await restoreWindow.loadURL(STATS_URL);
    const token = await readTokenFromLoginWindow(restoreWindow);
    if (token) authToken = token;
    return Boolean(authToken);
  } catch {
    return false;
  } finally {
    if (!restoreWindow.isDestroyed()) restoreWindow.close();
  }
}

async function getCookieHeader() {
  const cookies = await session.defaultSession.cookies.get({ url: SITE_ORIGIN });
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function desktopPost(apiPath, body = {}, { signal } = {}) {
  if (!authToken) throw new ApiError("请先登录布吉岛用户中心。", 401);

  const headers = {
    "Content-Type": "application/json",
    Authorization: authToken,
  };
  const cookieHeader = await getCookieHeader();
  if (cookieHeader) headers.Cookie = cookieHeader;

  const response = await fetch(`${API_ROOT}${apiPath}`, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`接口返回了无法解析的数据（HTTP ${response.status}）。`, response.status);
  }

  if (!response.ok || (payload?.code != null && payload.code !== 200)) {
    throw new ApiError(
      payload?.message || `请求失败（HTTP ${response.status}）。`,
      response.status,
      payload,
    );
  }

  return payload;
}

function registerIpc() {
  ipcMain.handle("auth:get-status", async () => ({
    authenticated: Boolean(authToken) || await restoreAuthToken(),
  }));
  ipcMain.handle("auth:login", () => openLoginWindow());
  ipcMain.handle("auth:logout", async () => {
    authToken = "";
    await session.defaultSession.clearStorageData({
      origin: SITE_ORIGIN,
      storages: ["cookies", "localstorage"],
    });
    return { authenticated: false };
  });

  ipcMain.handle("account:load", async (event, { uuid = "" } = {}) => {
    return loadDesktopAccount({
      post: desktopPost,
      cacheStore,
      uuid,
      onCache: (payload) => event.sender.send("account:cache", payload),
    });
  });
  ipcMain.handle("binding:bind", async (_event, { bindCode = "" } = {}) => {
    return bindDesktopAccount({ post: desktopPost, bindCode });
  });
  ipcMain.handle("binding:unbind", async (_event, { uuid = "" } = {}) => {
    return unbindDesktopAccount({ post: desktopPost, uuid });
  });
  ipcMain.handle("binding:open-official", () => openOfficialBindingWindow());

  ipcMain.handle("preferences:get", () => preferenceStore.read());
  ipcMain.handle("preferences:set", (_event, preferences) => preferenceStore.update(preferences));

  ipcMain.handle("cache:load", async (_event, { uuid } = {}) => {
    const account = await requireBoundAccount(uuid);
    return cacheStore.read(account.uuid);
  });
  ipcMain.handle("cache:clear-records", async (_event, { uuid } = {}) => {
    const account = await requireBoundAccount(uuid);
    const cache = await cacheStore.clearRecords(account.uuid);
    return { ok: true, cache };
  });

  ipcMain.handle("records:cancel", () => {
    fetchCoordinator.cancel();
    return { ok: true };
  });

  const fetchAndCache = async (event, options = {}, mode) => {
    const { uuid, playerName = "", cutoffDate = "", pageDelayMs = 100 } = options;
    const { account } = selectDesktopAccount(await desktopPost("/binding/list"), uuid);
    const controller = fetchCoordinator.start();

    try {
      const knownRecordKeys = mode === "update" ? await cacheStore.readKeys(account.uuid) : [];
      const result = await fetchAllRecords({
        uuid: account.uuid,
        cutoffDate,
        pageDelayMs,
        signal: controller.signal,
        post: desktopPost,
        knownRecordKeys,
        stopWhenKnownRecord: mode === "update",
        onProgress: (progress) => event.sender.send("records:progress", {
          ...progress,
          uuid: account.uuid,
        }),
      });
      const cache =
        mode === "update"
          ? await cacheStore.mergeAndWrite({
              uuid: account.uuid,
              playerName: playerName || account.name,
              records: result.records,
            })
          : await cacheStore.write({
              uuid: account.uuid,
              playerName: playerName || account.name,
              records: result.records,
            });
      return {
        ...result,
        mode,
        records: cache.records,
        fetchedRecords: result.records.length,
        cachedRecords: cache.records.length,
        fetchedAt: cache.fetchedAt,
        knownRecordHits: result.knownRecordHits ?? 0,
      };
    } finally {
      fetchCoordinator.finish(controller);
    }
  };

  ipcMain.handle("records:update", (event, options = {}) => fetchAndCache(event, options, "update"));
  ipcMain.handle("records:refetch", (event, options = {}) => fetchAndCache(event, options, "refetch"));

  ipcMain.handle("match:get", async (_event, record) => {
    await requireBoundAccount(record?.uuid);
    const payload = await desktopPost("/stats/match", {
      id: record?.matchId,
      date: record?.date,
    });
    return unwrapData(payload);
  });

  ipcMain.handle("visualization:export", async (_event, payload = {}) => {
    const format = payload.format === "png" ? "png" : payload.format === "svg" ? "svg" : "";
    if (!format) throw new Error("不支持的图表导出格式。");
    if (typeof payload.data !== "string" || !payload.data) throw new Error("没有可导出的图表数据。");

    const defaultName = path.basename(String(payload.defaultName || `BJD-Streaks.${format}`));
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `导出${format.toUpperCase()}图表`,
      defaultPath: defaultName.endsWith(`.${format}`) ? defaultName : `${defaultName}.${format}`,
      filters: [{
        name: format === "png" ? "PNG 图片" : "SVG 矢量图",
        extensions: [format],
      }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    await writeFile(
      result.filePath,
      format === "png" ? Buffer.from(payload.data, "base64") : payload.data,
      format === "png" ? undefined : "utf8",
    );
    return { canceled: false, filePath: result.filePath };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const userDataPath = app.getPath("userData");
  cacheStore = createCacheStore(path.join(userDataPath, "records-cache"), {
    legacyDirs: [path.join(userDataPath, "cache")],
  });
  preferenceStore = createPreferenceStore(path.join(userDataPath, "preferences.json"));
  registerIpc();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
