/**
 * Preload bridge — exposes a minimal, typed API to the settings renderer.
 * contextIsolation is on, so the renderer can only touch what we expose here.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("connector", {
  getState: () => ipcRenderer.invoke("get-state"),
  pair: (code: string) => ipcRenderer.invoke("pair", code),
  unpair: () => ipcRenderer.invoke("unpair"),
  saveSettings: (next: { tallyHost?: string; tallyPort?: number }) =>
    ipcRenderer.invoke("save-settings", next),
  onAuthChanged: (cb: (state: { signedIn: boolean; uid: string | null }) => void) =>
    ipcRenderer.on("auth-changed", (_e, state) => cb(state)),
});
