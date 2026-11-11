// Types text into whatever app has focus: clipboard + a synthetic Ctrl/Cmd+V. Never selects or deletes anything.
// Two independent ways to press the key (uiohook-napi, then the OS's own scripting), so one failing never loses the text.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const { clipboard, systemPreferences } = require("electron");
const { execFile } = require("node:child_process");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAC = process.platform === "darwin";
let hook; // uiohook-napi, loaded on first use so a missing native module only disables this path

function keys() {
  if (hook === undefined) {
    try { hook = require("uiohook-napi"); } catch { hook = null; }
  }
  return hook;
}

const run = (cmd, args) => new Promise((ok) => execFile(cmd, args, { timeout: 4000, windowsHide: true }, (err) => ok(!err)));

/** OS-level fallback: PowerShell SendKeys (Windows), AppleScript (macOS), xdotool (Linux/X11). */
function osPaste() {
  if (process.platform === "win32") return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"]);
  if (MAC) return run("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']);
  return run("xdotool", ["key", "--clearmodifiers", "ctrl+v"]);
}

function viaHook() {
  const h = keys();
  if (!h) return false;
  try {
    // let go of the shortcut's own modifiers first, so the target app sees a clean Ctrl/Cmd+V
    for (const k of [h.UiohookKey.Shift, h.UiohookKey.Alt]) h.uIOhook.keyToggle(k, "up");
    h.uIOhook.keyTap(h.UiohookKey.V, [MAC ? h.UiohookKey.Meta : h.UiohookKey.Ctrl]);
    return true;
  } catch { return false; }
}

/** True if a paste was sent. False = text is on the clipboard only (Wayland, missing permission, ...). */
async function paste(text, { keepClipboard = true } = {}) {
  const before = keepClipboard ? null : clipboard.readText();
  clipboard.writeText(text);
  const wayland = process.platform === "linux" && (process.env.XDG_SESSION_TYPE === "wayland" || !!process.env.WAYLAND_DISPLAY) && !process.env.DISPLAY;
  if (wayland || (MAC && !systemPreferences.isTrustedAccessibilityClient(false))) return false;
  await sleep(120); // the target app must have the focus back before the key goes out
  const sent = viaHook() || (await osPaste());
  if (sent && before !== null) setTimeout(() => clipboard.writeText(before), 800);
  return sent;
}

module.exports = { paste };
