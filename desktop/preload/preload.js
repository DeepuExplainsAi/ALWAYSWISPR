// One preload for all three windows (--wispr-kind=main|panel|bubble). It gives each page the same
// synchronous `N.xxx()` API the Android WebView bridge has, so the Android HTML runs unchanged.
// Recording happens here (MediaRecorder); audio goes straight to the main process, the page never sees it.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const { contextBridge, ipcRenderer, webFrame } = require("electron");

const kind = (process.argv.find((a) => a.startsWith("--wispr-kind=")) || "").slice("--wispr-kind=".length);
const MIN_MS = 700;
const MAX_MS = 15 * 60 * 1000;

function makeRecorder() {
  let ready = null, rec = null, stream = null, ctx = null, timer = 0, maxTimer = 0, chunks = [], t0 = 0, lvl = 0, cancelled = false;

  const cleanup = () => {
    clearInterval(timer); clearTimeout(maxTimer); lvl = 0;
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
    rec = stream = ctx = null;
  };

  /** Returns at once (like the Android bridge); mic problems show up in stop(). */
  function start(onMax) {
    cancelled = false; chunks = [];
    ready = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((s) => {
      if (cancelled) { s.getTracks().forEach((t) => t.stop()); return false; }
      stream = s;
      ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      timer = setInterval(() => {
        an.getByteTimeDomainData(buf);
        lvl = buf.reduce((m, v) => Math.max(m, Math.abs(v - 128)), 0) / 128;
      }, 50);
      rec = new MediaRecorder(s, { mimeType: "audio/webm;codecs=opus" });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(250);
      t0 = Date.now();
      maxTimer = setTimeout(() => onMax?.(), MAX_MS);
      return true;
    }).catch(() => false);
  }

  /** { buf, mime } | { err } */
  async function stop() {
    if (!(await ready)) { cleanup(); return { err: "Couldn't use the microphone. Allow it for Wispr and try again." }; }
    const ms = Date.now() - t0;
    const r = rec;
    await new Promise((done) => { r.onstop = done; r.stop(); });
    const type = r.mimeType || "audio/webm";
    cleanup();
    if (ms < MIN_MS) return { err: "Too short. Speak a little longer." };
    return { buf: await new Blob(chunks, { type }).arrayBuffer(), mime: type.split(";")[0] };
  }

  function cancel() { cancelled = true; ready?.then(cleanup); }
  return { start, stop, cancel, level: () => lvl };
}

const run = (code) => webFrame.executeJavaScript(code).catch(() => {});
const q = JSON.stringify;

if (kind === "bubble") {
  const rec = makeRecorder();
  ipcRenderer.on("rec", async (_e, cmd) => {
    if (cmd === "start") rec.start(() => ipcRenderer.send("bubble:click", "stop"));
    else if (cmd === "cancel") rec.cancel();
    else if (cmd === "stop") {
      const r = await rec.stop();
      if (r.err) ipcRenderer.send("rec:fail", r.err);
      else ipcRenderer.send("audio", "hotkey", "", r.buf, r.mime);
    }
  });
  contextBridge.exposeInMainWorld("WisprBubble", {
    level: () => rec.level(),
    click: (name) => ipcRenderer.send("bubble:click", name),
    on: (cb) => ipcRenderer.on("bubble", (_e, state, msg) => cb(state, msg)),
  });
} else {
  const rec = makeRecorder();
  const cb = (id, ok, data) => run(`window.WisprCb&&WisprCb(${q(id)},${ok},${q(String(data))})`);
  ipcRenderer.on("cb", (_e, id, ok, data) => cb(id, ok, data));
  ipcRenderer.on("status", (_e, id, msg) => run(`window.WisprStatus&&WisprStatus(${q(id)},${q(msg)})`));
  ipcRenderer.on("js", (_e, code) => run(code));

  const SYNC = {
    main: ["getSettings", "setSetting", "models", "perms", "requestPerm", "notice", "getHistory", "clearHistory", "copy", "share",
      "removeKey", "updateState", "checkUpdate", "startUpdate", "cancelUpdate", "skipUpdate", "openReleasePage"],
    panel: ["getSettings", "setSetting", "models", "canScan", "hasTarget", "close", "keyboard", "dictate", "insert", "copy",
      "chatHistory", "chatReset", "openApp"],
  }[kind];
  const ASYNC = { main: ["verifyKey", "retry"], panel: ["refreshModels", "chat", "understand"] }[kind];

  const api = {};
  for (const n of SYNC) api[n] = (...a) => ipcRenderer.sendSync("sync", n, a);
  for (const n of ASYNC) api[n] = (...a) => ipcRenderer.send("async", n, a);

  // Recording: the page asks for the same calls as on Android.
  const send = (channel, id, r) => (r.err ? cb(id, false, r.err) : ipcRenderer.send("audio", channel, id, r.buf, r.mime));
  api.level = api.voiceLevel = () => rec.level();
  api.startRec = api.voiceStart = () => { rec.start(); return true; };
  api.cancelRec = api.voiceCancel = () => rec.cancel();
  if (kind === "main") api.stopRec = async (id) => send("dictate", id, await rec.stop());
  if (kind === "panel") api.voiceStop = async (id) => send("voice", id, await rec.stop());

  contextBridge.exposeInMainWorld(kind === "main" ? "WisprNative" : "WisprPanel", api);
}
