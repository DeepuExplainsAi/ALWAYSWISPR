// Wispr for PC (Electron main process). Three windows share the Android HTML through one bridge:
//   main  = full app (index.html)      panel = mini window (panel.html)      bubble = floating pill while dictating
// A global shortcut starts/stops dictation; the result is pasted into whatever app had focus.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const { app, BrowserWindow, Notification, Tray, Menu, ipcMain, globalShortcut, clipboard, shell, screen, desktopCapturer, systemPreferences, nativeImage, session } = require("electron");
const path = require("node:path");
const crypto = require("./crypto");
const { Store } = require("./store");
const Engine = require("./engine");
const Assistant = require("./assistant");
const Groq = require("./groq");
const { GroqError } = Groq;
const Models = require("./models");
const Updater = require("./updater");
const { paste } = require("./paste");

const ROOT = path.join(__dirname, "..");
const KEY_RE = /^gsk_[A-Za-z0-9_-]{20,200}$/;
const NOTICE = "Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. Open source under the Apache License, Version 2.0: you may use, modify and share it under that licence's terms. Provided \"as is\", without warranty of any kind.";
const MAC = process.platform === "darwin";
const VERSION = require("../package.json").version;

if (!app.requestSingleInstanceLock()) app.quit();

let st, tray, mainWin, panelWin, bubbleWin;
let phase = "idle"; // idle | rec | work  (hotkey dictation)
let live = null;    // model ids Groq says this key can use
let upd = { state: "idle", lastCheck: 0 };
let quitting = false;

// ---------- windows ----------
function make(kind, file, opts) {
  const w = new BrowserWindow({
    show: false, icon: path.join(ROOT, "build/icon.png"), ...opts,
    webPreferences: { preload: path.join(ROOT, "preload/preload.js"), additionalArguments: [`--wispr-kind=${kind}`], contextIsolation: true, sandbox: false, nodeIntegration: false, backgroundThrottling: false },
  });
  w.kind = kind;
  w.loadFile(path.join(ROOT, "renderer", file));
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  return w;
}

function showMain() {
  if (!mainWin || mainWin.isDestroyed()) {
    mainWin = make("main", "index.html", { width: 1180, height: 780, minWidth: 900, minHeight: 600, autoHideMenuBar: true, title: "Wispr" });
    mainWin.on("close", (e) => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });
  }
  mainWin.show(); mainWin.focus();
}

function togglePanel() {
  if (panelWin?.isVisible()) return panelWin.hide();
  if (!panelWin || panelWin.isDestroyed()) {
    panelWin = make("panel", "panel.html", { width: 440, height: 660, frame: false, transparent: true, alwaysOnTop: true, resizable: true, skipTaskbar: true, hasShadow: true });
    panelWin.on("blur", () => { if (!panelWin.webContents.isDevToolsOpened() && !panelWin.busy) panelWin.hide(); });
  }
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  panelWin.setPosition(Math.round(d.x + (d.width - 440) / 2), Math.round(d.y + Math.max(20, (d.height - 660) / 2)));
  panelWin.show(); panelWin.focus();
}

function makeBubble() {
  bubbleWin = make("bubble", "bubble.html", { width: 200, height: 44, backgroundColor: "#00000000", frame: false, transparent: true, focusable: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false });
  bubbleWin.setAlwaysOnTop(true, "screen-saver");
  bubbleWin.setIgnoreMouseEvents(false);
}

function bubble(state, msg) {
  if (!st.bool("bubble") || !bubbleWin) return;
  if (state === "hide") return bubbleWin.hide();
  const w = state === "rec" ? 200 : Math.min(380, Math.max(150, 90 + String(msg || "").length * 7));
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  bubbleWin.setBounds({ x: Math.round(d.x + (d.width - w) / 2), y: Math.round(d.y + d.height - 44 - 36), width: w, height: 44 });
  bubbleWin.webContents.send("bubble", state, msg);
  bubbleWin.showInactive();
}

// ---------- dictation by shortcut ----------
function setPhase(p) {
  phase = p;
  // while recording: Esc cancels, Enter stops and types (the pill never takes focus, so these are global)
  if (p === "rec") {
    globalShortcut.register("Escape", () => cancelDictation());
    globalShortcut.register("Return", () => toggleDictation());
  } else {
    globalShortcut.unregister("Escape");
    globalShortcut.unregister("Return");
  }
}

function toggleDictation() {
  if (phase === "idle") {
    if (!st.apiKey) { showMain(); return; }
    setPhase("rec");
    bubbleWin.webContents.send("rec", "start");
    bubble("rec");
  } else if (phase === "rec") {
    setPhase("work");
    bubbleWin.webContents.send("rec", "stop");
    bubble("work", "Working…");
  }
}

function cancelDictation() {
  if (phase !== "rec") return;
  bubbleWin.webContents.send("rec", "cancel");
  setPhase("idle");
  bubble("hide");
}

function endDictation(msg, err) {
  setPhase("idle");
  if (!msg) return bubble("hide");
  bubble(err ? "err" : "work", msg);
  setTimeout(() => { if (phase === "idle") bubble("hide"); }, err ? 4500 : 1400);
}

async function finishDictation(buf, mime) {
  const r = await Engine.submit(st, Buffer.from(buf), mime, (m) => bubble("work", m));
  if (!r.ok) return endDictation(r.text, true);
  const sent = await paste(r.text, { keepClipboard: st.bool("autoCopy") });
  endDictation(sent ? "" : "Copied. Press Ctrl+V to paste.", !sent);
}

// ---------- shortcuts ----------
function register(acc, fn) {
  try { return globalShortcut.register(acc, fn); } catch { return false; }
}

function bindKeys() {
  globalShortcut.unregister(st.str("hotkey"));
  globalShortcut.unregister(st.str("panelKey"));
  const a = register(st.str("hotkey"), toggleDictation);
  const b = register(st.str("panelKey"), togglePanel);
  return a && b;
}

/** Saves a new shortcut only if the OS lets us take it. */
function setShortcut(key, acc) {
  const old = st.str(key);
  if (acc === old) return true;
  if (acc === st.str(key === "hotkey" ? "panelKey" : "hotkey")) return false;
  globalShortcut.unregister(old);
  if (!register(acc, key === "hotkey" ? toggleDictation : togglePanel)) {
    register(old, key === "hotkey" ? toggleDictation : togglePanel);
    return false;
  }
  st.put(key, acc);
  return true;
}

// ---------- permissions ----------
const media = (t) => (MAC || process.platform === "win32") ? systemPreferences.getMediaAccessStatus(t) === "granted" : true;
const perms = () => ({ mic: media("microphone"), paste: MAC ? systemPreferences.isTrustedAccessibilityClient(false) : true, screen: MAC ? media("screen") : true });

function requestPerm(name) {
  if (name === "mic" && MAC) systemPreferences.askForMediaAccess("microphone");
  else if (name === "paste" && MAC) systemPreferences.isTrustedAccessibilityClient(true);
  const pane = { mic: "Privacy_Microphone", paste: "Privacy_Accessibility", screen: "Privacy_ScreenCapture" }[name];
  if (MAC && pane) shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
  else if (process.platform === "win32" && name === "mic") shell.openExternal("ms-settings:privacy-microphone");
}

// ---------- screen ----------
async function screenshotB64() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size });
  const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
  if (!src || src.thumbnail.isEmpty()) return null;
  const { width, height } = src.thumbnail.getSize();
  const k = 1600 / Math.max(width, height);
  const img = k < 1 ? src.thumbnail.resize({ width: Math.round(width * k), height: Math.round(height * k) }) : src.thumbnail;
  return img.toJPEG(80).toString("base64");
}

async function understand(wc, id) {
  const say = (m) => wc.send("status", id, m);
  const done = (ok, t) => wc.send("cb", id, ok, t);
  say("Scanning the screen…");
  panelWin.busy = true;
  panelWin.hide();
  await new Promise((r) => setTimeout(r, 300));
  let b64 = null;
  try { b64 = await screenshotB64(); } catch {}
  panelWin.show(); panelWin.busy = false;
  if (!b64) return done(false, MAC ? "Couldn't capture the screen. Allow Screen Recording for Wispr in System Settings." : "Couldn't capture the screen.");
  say("Reading the text in the picture…");
  const r = await Assistant.understandImage(st, b64, say);
  done(r.ok, r.text);
}

// ---------- updates ----------
function pushUpdate() {
  const o = { configured: true, current: VERSION, mode: st.str("updates"), skipped: st.str("skippedUpdate"), page: upd.page || `https://github.com/${Updater.REPO}/releases`, ...upd };
  mainWin?.webContents.send("js", `window.WisprUpdate&&WisprUpdate(${JSON.stringify(JSON.stringify(o))})`);
  return JSON.stringify(o);
}

async function checkUpdate(manual) {
  if (!manual && st.str("updates") === "off") return;
  upd = { ...upd, state: "checking" }; pushUpdate();
  try {
    const r = await Updater.check(VERSION);
    upd = r ? { state: "available", latest: r.version, notes: r.notes, page: r.page, size: r.size, lastCheck: Date.now() } : { state: "uptodate", lastCheck: Date.now() };
  } catch (e) {
    upd = { state: "error", msg: e.message || "Couldn't check", lastCheck: Date.now() };
  }
  pushUpdate();
}

// ---------- bridge (same method names as the Android WebView bridges) ----------
const publicSettings = () => st.publicJson({ version: VERSION, owner: "Deepu Gupta" });
const reply = (wc, id) => (ok, text) => { if (!wc.isDestroyed()) wc.send("cb", id, ok, text); };
const status = (wc, id) => (m) => { if (!wc.isDestroyed()) wc.send("status", id, m); };

const common = {
  getSettings: publicSettings,
  setSetting(k, v) {
    let value;
    try { value = JSON.parse(v); } catch { return false; }
    if (k === "hotkey" || k === "panelKey") return typeof value === "string" && setShortcut(k, value);
    const ok = st.putFromUi(k, value);
    if (ok && k === "autostart") app.setLoginItemSettings({ openAtLogin: !!value, args: ["--hidden"] });
    return ok;
  },
  models: () => Models.json(live),
  copy(text) { clipboard.writeText(String(text)); return true; },
};

const bridge = {
  main: {
    ...common,
    perms: () => JSON.stringify(perms()),
    requestPerm: requestPerm,
    notice: () => NOTICE,
    getHistory: () => st.historyJson(),
    clearHistory: () => st.clearHistory(),
    share: (text) => { clipboard.writeText(String(text)); },
    removeKey: () => { st.apiKey = ""; },
    updateState: pushUpdate,
    checkUpdate: () => { checkUpdate(true); },
    startUpdate: () => { shell.openExternal(upd.page || `https://github.com/${Updater.REPO}/releases`); },
    cancelUpdate: () => {},
    skipUpdate: (v) => { st.put("skippedUpdate", String(v).slice(0, 40)); },
    openReleasePage: () => { shell.openExternal(upd.page || `https://github.com/${Updater.REPO}/releases`); },
    async verifyKey(k, id, wc) {
      const done = reply(wc, id);
      const key = Groq.cleanKey(k);
      if (!key.startsWith("gsk_")) return done(false, "That doesn't look like a Groq key. It should start with gsk_");
      if (!KEY_RE.test(key)) return done(false, `This key looks cut off or has extra characters (${key.length} chars). Copy it again from console.groq.com/keys.`);
      try {
        await Groq.verify(key);
        st.apiKey = key; done(true, "ok");
      } catch (e) {
        if (e instanceof GroqError && e.retryable) { st.apiKey = key; done(true, "saved-unverified"); } // offline / Groq busy: first dictation re-checks
        else done(false, e.message || "Couldn't verify the key");
      }
    },
    async retry(itemId, id, wc) {
      const r = await Engine.retry(st, itemId, status(wc, id));
      reply(wc, id)(r.ok, r.text);
    },
  },
  panel: {
    ...common,
    canScan: () => true,
    hasTarget: () => true,
    close: () => panelWin.hide(),
    keyboard: () => {},
    chatHistory: () => Assistant.historyJson(),
    chatReset: () => Assistant.reset(),
    openApp: () => { panelWin.hide(); showMain(); },
    dictate() { panelWin.hide(); setTimeout(() => phase === "idle" && toggleDictation(), 250); },
    insert(text) { panelWin.hide(); setTimeout(() => paste(String(text), { keepClipboard: st.bool("autoCopy") }), 350); },
    async refreshModels(id, wc) {
      const done = reply(wc, id);
      if (!st.apiKey) return done(false, "Add your Groq key in the Wispr app first.");
      try { live = await Groq.listModels(st.apiKey); done(true, Models.json(live)); } catch (e) { done(false, e.message || "Couldn't load models"); }
    },
    async chat(text, id, wc) {
      const r = await Assistant.chat(st, text, status(wc, id));
      reply(wc, id)(r.ok, r.text);
    },
    understand: (mode, id, wc) => understand(wc, id),
  },
};

const kindOf = (e) => BrowserWindow.fromWebContents(e.sender)?.kind;

ipcMain.on("sync", (e, name, args) => {
  const fn = bridge[kindOf(e)]?.[name];
  try { e.returnValue = fn ? fn(...args) : null; } catch { e.returnValue = null; }
});

ipcMain.on("async", (e, name, args) => {
  const fn = bridge[kindOf(e)]?.[name];
  if (fn) Promise.resolve(fn(...args, e.sender)).catch(() => {});
});

ipcMain.on("audio", async (e, channel, id, buf, mime) => {
  const audio = Buffer.from(buf);
  if (channel === "hotkey") return finishDictation(audio, mime);
  const wc = e.sender;
  if (channel === "dictate") {
    const r = await Engine.submit(st, audio, mime, status(wc, id));
    reply(wc, id)(r.ok, r.text);
  } else if (channel === "voice") {
    const r = await Assistant.transcribe(st, audio, mime, status(wc, id));
    reply(wc, id)(r.ok, r.text);
  }
});

ipcMain.on("bubble:click", (_e, what) => (what === "stop" ? toggleDictation() : cancelDictation()));
ipcMain.on("rec:fail", (_e, msg) => endDictation(msg, true));

// ---------- start ----------
function makeTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ROOT, "build/tray.png")));
  tray.setToolTip("Wispr");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Dictate", click: toggleDictation },
    { label: "Mini window", click: togglePanel },
    { label: "Open Wispr", click: showMain },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]));
  tray.on("click", showMain);
}

app.on("second-instance", showMain);
app.on("before-quit", () => { quitting = true; });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {}); // lives in the tray

app.whenReady().then(() => {
  crypto.init(app.getPath("userData"), require("electron").safeStorage);
  st = new Store(app.getPath("userData"));
  Engine.env.online = () => require("electron").net.isOnline();
  st.onChange(() => mainWin?.webContents.send("js", "window.WisprHistoryChanged&&WisprHistoryChanged()"));

  const allow = new Set(["media", "display-capture"]);
  session.defaultSession.setPermissionRequestHandler((_wc, p, cb) => cb(allow.has(p)));
  session.defaultSession.setPermissionCheckHandler((_wc, p) => allow.has(p));

  makeTray();
  makeBubble();
  const ok = bindKeys();
  if (!process.argv.includes("--hidden") || !st.apiKey || !ok) showMain();
  if (!ok) new Notification({ title: "Wispr", body: "A Wispr shortcut is used by another app. Change it in Settings." }).show();
  setTimeout(() => checkUpdate(false), 8000);
  setInterval(() => checkUpdate(false), 12 * 3600 * 1000);
});
