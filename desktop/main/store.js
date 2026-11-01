// Port of Store.kt: settings + history, always encrypted at rest. Shared by every window.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("./crypto");
const Models = require("./models");

const MAX = 40;
const IS_MAC = process.platform === "darwin";

const DEF = {
  key: "", mode: "polish", lang: "hinglish", deva: false, target: "en",
  stt: Models.DEFAULT_STT, llm: Models.DEFAULT_LLM, chatModel: Models.DEFAULT_LLM, visionModel: Models.DEFAULT_VISION,
  hold: "panel", explainIn: "hinglish", fixWrite: true,
  autoCopy: true, keepHist: true, sounds: false, spell: "",
  dark: false, bubble: true, updates: "auto",
  // desktop only
  hotkey: IS_MAC ? "Command+Shift+Space" : "Control+Shift+Space",
  panelKey: IS_MAC ? "Command+Shift+W" : "Control+Shift+W",
  autostart: false,
};

class Store {
  constructor(dir) {
    this.dir = dir;
    this.audioDir = path.join(dir, "audio");
    fs.mkdirSync(this.audioDir, { recursive: true });
    this.listeners = new Set();
    this.settings = this.#read("settings.enc", {});
    this.history = this.#read("history.enc", []);
    this.#migrate();
  }

  #read(name, fallback) {
    try { return JSON.parse(crypto.decStr(fs.readFileSync(path.join(this.dir, name)))); } catch { return fallback; }
  }
  #write(name, v) { fs.writeFileSync(path.join(this.dir, name), crypto.encStr(JSON.stringify(v))); }
  #fire() { for (const l of this.listeners) l(); }

  /** Settings saved by older versions that point at models Groq has shut down. */
  #migrate() {
    let changed = false;
    for (const k of ["llm", "chatModel"]) if (Models.DEAD.has(this.settings[k])) { this.settings[k] = Models.DEFAULT_LLM; changed = true; }
    if (Models.DEAD.has(this.settings.stt)) { this.settings.stt = Models.DEFAULT_STT; changed = true; }
    if (this.settings.visionModel && !Models.isVision(this.settings.visionModel)) { this.settings.visionModel = Models.DEFAULT_VISION; changed = true; }
    if (changed) this.#write("settings.enc", this.settings);
  }

  get(k) { return k in this.settings ? this.settings[k] : DEF[k]; }
  str(k) { return String(this.get(k) ?? ""); }
  bool(k) { return !!this.get(k); }

  put(k, v) {
    this.settings[k] = v;
    this.#write("settings.enc", this.settings);
    this.#fire();
  }

  get apiKey() { return this.str("key"); }
  set apiKey(v) { this.put("key", v); }

  /** What the UI may see. The API key itself is never included. */
  publicJson(extra = {}) {
    const o = {};
    for (const k of Object.keys(DEF)) if (k !== "key") o[k] = this.get(k);
    const key = this.apiKey;
    o.hasKey = !!key;
    o.keyHint = key.length > 8 ? "gsk_…" + key.slice(-4) : "";
    return JSON.stringify({ ...o, ...extra });
  }

  /** Whitelisted and type-checked. The UI can never write the key through this. */
  putFromUi(k, v) {
    if (k === "key" || !(k in DEF)) return false;
    const def = DEF[k];
    if (typeof def === "boolean" && typeof v === "boolean") { this.put(k, v); return true; }
    if (typeof def === "string" && typeof v === "string" && v.length <= 20000) { this.put(k, v); return true; }
    return false;
  }

  /** Correct spellings ("heard = correct" -> "correct"), also used as Whisper vocabulary. */
  vocabulary() {
    const seen = new Set();
    for (const line of this.str("spell").split("\n")) {
      const i = line.indexOf("=");
      const w = (i >= 0 ? line.slice(i + 1) : line).trim();
      if (w && w.length <= 40) seen.add(w);
    }
    return [...seen];
  }

  applySpell(text) {
    let t = text;
    for (const line of this.str("spell").split("\n")) {
      const i = line.indexOf("=");
      if (i <= 0) continue;
      const a = line.slice(0, i).trim();
      const b = line.slice(i + 1).trim();
      if (!a) continue;
      t = t.replace(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), () => b);
    }
    return t;
  }

  // ---------- history ----------
  historyJson() {
    return JSON.stringify(this.history.map((o) => ({ id: o.id, t: o.t, text: o.text || "", status: o.status || "", err: o.err || "", mode: o.mode || "" })));
  }
  item(id) { const o = this.history.find((x) => x.id === id); return o ? { ...o } : null; }

  addItem(o) {
    this.history.unshift(o);
    while (this.history.length > MAX) {
      const last = this.history.pop();
      fs.rmSync(this.audioPath(last.id), { force: true });
    }
    this.#write("history.enc", this.history);
    this.#fire();
  }
  patchItem(id, fn) {
    const o = this.history.find((x) => x.id === id);
    if (!o) return;
    fn(o);
    this.#write("history.enc", this.history);
    this.#fire();
  }
  removeItem(id) {
    this.history = this.history.filter((x) => x.id !== id);
    this.#write("history.enc", this.history);
    fs.rmSync(this.audioPath(id), { force: true });
    this.#fire();
  }
  clearHistory() {
    this.history = [];
    this.#write("history.enc", this.history);
    for (const f of fs.readdirSync(this.audioDir)) fs.rmSync(path.join(this.audioDir, f), { force: true });
    this.#fire();
  }
  audioPath(id) { return path.join(this.audioDir, `${id}.enc`); }

  onChange(l) { this.listeners.add(l); return () => this.listeners.delete(l); }
}

module.exports = { Store, DEF, MAX };
