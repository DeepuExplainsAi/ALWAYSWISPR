// Types text into whatever app has focus: clipboard + a synthetic Ctrl/Cmd+V. Never selects or deletes anything.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const { clipboard } = require("electron");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let hook; // uiohook-napi, loaded on first use so a missing native module only disables pasting

function keys() {
  if (hook === undefined) {
    try { hook = require("uiohook-napi"); } catch { hook = null; }
  }
  return hook;
}

/** True if a paste was sent. False = text is on the clipboard only (Wayland, missing permission, ...). */
async function paste(text, { keepClipboard = true } = {}) {
  const before = keepClipboard ? null : clipboard.readText();
  clipboard.writeText(text);
  const h = keys();
  const wayland = process.platform === "linux" && (process.env.XDG_SESSION_TYPE === "wayland" || !!process.env.WAYLAND_DISPLAY) && !process.env.DISPLAY;
  if (!h || wayland) return false;
  try {
    await sleep(60);
    h.uIOhook.keyTap(h.UiohookKey.V, [process.platform === "darwin" ? h.UiohookKey.Meta : h.UiohookKey.Ctrl]);
    if (before !== null) setTimeout(() => clipboard.writeText(before), 600);
    return true;
  } catch {
    return false;
  }
}

module.exports = { paste };
