export const SITE_ORIGIN = "https://user.mcbjd.net";

export function isBjdPage(url) {
  try {
    return new URL(url).origin === SITE_ORIGIN;
  } catch {
    return false;
  }
}

export function isHttpPage(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export function isLoginFlowPage(url) {
  return url === "about:blank" || isHttpPage(url);
}

export function configureLoginFlowWindow(windowRef) {
  windowRef.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLoginFlowPage(url)) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        parent: windowRef,
        modal: false,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
    };
  });
  windowRef.webContents.on("will-navigate", (event, url) => {
    if (!isLoginFlowPage(url)) event.preventDefault();
  });
  windowRef.webContents.on("did-create-window", (childWindow) => {
    childWindow.setMenuBarVisibility(false);
    configureLoginFlowWindow(childWindow);
  });
}
