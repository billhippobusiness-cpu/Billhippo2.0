/**
 * Connector main process: a tray-first app with a small settings window.
 *
 * Lifecycle:
 *   app ready → init Firebase → restore session (custom persistence)
 *     ├─ signed in  → start heartbeat + job watcher, tray shows "Connected"
 *     └─ signed out → tray shows "Not paired", user opens settings to pair
 *   before-quit → mark offline + stop timers
 */

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from "electron";
import * as path from "path";
import type { User } from "firebase/auth";
import { initFirebase, watchAuth, pairWithCode, signOutConnector, getCurrentUser } from "./firebaseClient";
import { startHeartbeat, stopHeartbeat, markOffline } from "./heartbeat";
import { startJobWatcher, stopJobWatcher } from "./jobWatcher";
import { getSettings, setSettings, CONNECTOR_VERSION, type LocalSettings } from "./config";

// Placeholder 1x1 tray icon — a real .ico is bundled in Milestone D.
const TRAY_ICON = nativeImage.createFromDataURL(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
);

let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let currentUid: string | null = null;

function buildTrayMenu(): void {
  if (!tray) return;
  const signedIn = !!currentUid;
  tray.setToolTip(
    signedIn ? `BillHippo Connector — connected` : `BillHippo Connector — not paired`,
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: signedIn ? "● Connected" : "○ Not paired", enabled: false },
      { type: "separator" },
      { label: "Settings…", click: () => openSettings() },
      { type: "separator" },
      { label: `Version ${CONNECTOR_VERSION}`, enabled: false },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
}

function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 560,
    resizable: false,
    title: "BillHippo Connector",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void settingsWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function onUser(user: User | null): void {
  const prevUid = currentUid;
  currentUid = user?.uid ?? null;

  if (currentUid && currentUid !== prevUid) {
    startHeartbeat(currentUid);
    startJobWatcher(currentUid);
  } else if (!currentUid && prevUid) {
    stopHeartbeat();
    stopJobWatcher();
  }

  buildTrayMenu();
  settingsWindow?.webContents.send("auth-changed", {
    signedIn: !!currentUid,
    uid: currentUid,
  });
}

// ── IPC (settings window ⇄ main) ─────────────────────────────────────────────

ipcMain.handle("get-state", () => ({
  signedIn: !!getCurrentUser(),
  uid: getCurrentUser()?.uid ?? null,
  settings: getSettings(),
  version: CONNECTOR_VERSION,
}));

ipcMain.handle("pair", async (_evt, code: string) => {
  try {
    const user = await pairWithCode(code);
    return { ok: true, uid: user.uid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("unpair", async () => {
  await signOutConnector();
  return { ok: true };
});

ipcMain.handle("save-settings", (_evt, next: Partial<LocalSettings>) => {
  return setSettings(next);
});

// ── App lifecycle ────────────────────────────────────────────────────────────

// Single-instance: focus settings instead of launching a second tray.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openSettings());

  app.whenReady().then(() => {
    tray = new Tray(TRAY_ICON);
    buildTrayMenu();

    initFirebase();
    watchAuth(onUser);

    // Tray app: keep running when no windows are open (override the default
    // "quit on all windows closed" behaviour with a no-op).
    app.on("window-all-closed", () => {});
  });

  app.on("before-quit", async (e) => {
    if (currentUid) {
      e.preventDefault();
      stopHeartbeat();
      stopJobWatcher();
      await markOffline(currentUid);
      currentUid = null;
      app.quit();
    }
  });
}
