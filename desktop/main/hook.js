// Second, independent way to catch the shortcuts: a system-wide key listener (uiohook-napi).
// Electron's globalShortcut can silently stop delivering (Wayland, after sleep, another app grabbing the keys, OS quirks);
// this listener sees the same keys in every app, so the shortcut still works. main.js de-duplicates when both fire.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0

const MODS = { Control: "ctrl", Ctrl: "ctrl", CommandOrControl: "ctrl", Shift: "shift", Alt: "alt", Option: "alt", Command: "meta", Cmd: "meta", Super: "meta", Meta: "meta" };
const KEYNAMES = { Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight", "-": "Minus", "=": "Equal", ",": "Comma", ".": "Period", "/": "Slash", "`": "Backquote", Esc: "Escape", Return: "Enter" };
const MOD_OF = { 29: "ctrl", 3613: "ctrl", 42: "shift", 54: "shift", 56: "alt", 3640: "alt", 3675: "meta", 3676: "meta" };

/** "Control+Shift+Space" -> { mods: ["ctrl","shift"], code } (null if the key is unknown). `keys` = UiohookKey. */
function parse(acc, keys, mac = process.platform === "darwin") {
  const parts = String(acc || "").split("+");
  const name = parts.pop();
  const code = keys[KEYNAMES[name] || name];
  const mods = parts.map((p) => (p === "CommandOrControl" ? (mac ? "meta" : "ctrl") : MODS[p]));
  if (code === undefined || mods.some((m) => !m)) return null;
  return { mods: [...new Set(mods)].sort(), code };
}

/** Pure matcher: feed it key events, it calls fire(name) once per physical press of a bound chord. */
function matcher(bindings, keys, fire) {
  const down = new Set(); // physical keycodes currently held
  const held = () => [...new Set([...down].map((c) => MOD_OF[c]).filter(Boolean))].sort();
  return {
    key(code, pressed) {
      if (!pressed) return void down.delete(code);
      const repeat = down.has(code);
      down.add(code);
      if (repeat || MOD_OF[code]) return;
      const mods = held().join();
      for (const [name, acc] of Object.entries(bindings())) {
        const p = parse(acc, keys);
        if (p && p.code === code && p.mods.join() === mods) return void fire(name);
      }
    },
    reset: () => down.clear(),
  };
}

let started = false;
/** Starts the listener. bindings() returns { name: accelerator } and is read on every key press. Never throws. */
function start(bindings, fire) {
  if (started) return true;
  let h;
  try { h = require("uiohook-napi"); } catch { return false; }
  const m = matcher(bindings, h.UiohookKey, fire);
  try {
    h.uIOhook.on("keydown", (e) => m.key(e.keycode, true));
    h.uIOhook.on("keyup", (e) => m.key(e.keycode, false));
    h.uIOhook.start();
    started = true;
  } catch { return false; }
  return true;
}

module.exports = { start, parse, matcher };
