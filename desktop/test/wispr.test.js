// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

let hits = [];
let script = () => ({ code: 200, body: {} });
const server = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    hits.push(req.url);
    const { code, body, headers } = script(req.url, hits.length);
    res.writeHead(code, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  });
});
test.before(() => new Promise((r) => server.listen(0, () => { process.env.WISPR_GROQ_BASE = `http://127.0.0.1:${server.address().port}/`; r(); })));
test.after(() => server.close());

const Groq = require("../main/groq");
const Engine = require("../main/engine");
const crypto = require("../main/crypto");
const { Store } = require("../main/store");
const Translit = require("../main/translit");
const Updater = require("../main/updater");

function newStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wispr-"));
  crypto.init(dir, null);
  const s = new Store(dir);
  s.apiKey = "gsk_" + "a".repeat(30);
  return s;
}

test("prompts are in sync with Prompts.kt", () => {
  execFileSync("node", [path.join(__dirname, "../scripts/port-prompts.js"), "--check"]);
});

test("UI patches still match the Android HTML", () => {
  require("../scripts/build-ui").build();
  const h = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
  assert.ok(h.includes("hotkeyIn") && !h.includes("Keystore encryption on this phone"));
});

test("cleanKey strips junk", () => {
  assert.strictEqual(Groq.cleanKey(' "Bearer gsk\\_abc123" \u200B'), "gsk_abc123");
});

test("parseWait understands Groq formats", () => {
  assert.strictEqual(Groq.parseWait("1.5"), 1500);
  assert.strictEqual(Groq.parseWait("300ms"), 300);
  assert.strictEqual(Groq.parseWait("7m2.5s"), 422500);
});

test("Devanagari becomes Roman", () => {
  assert.match(Translit.toRoman("कल मीटिंग है"), /kal/i);
});

test("verify maps 401 to an auth error", async () => {
  script = () => ({ code: 401, body: { error: { message: "bad" } } });
  await assert.rejects(Groq.verify("gsk_x"), (e) => e instanceof Groq.GroqError && e.auth && !e.retryable);
});

test("store never exposes or accepts the key from the UI", () => {
  const s = newStore();
  assert.ok(!s.publicJson().includes("gsk_aaaa"));
  assert.strictEqual(s.putFromUi("key", "gsk_evil"), false);
  assert.strictEqual(s.putFromUi("nope", "x"), false);
});

test("dictation: audio -> text, with a 429 retry", async () => {
  Engine.env.delays = [1, 1, 1, 1, 1];
  const s = newStore();
  s.put("mode", "write"); s.put("lang", "en");
  script = (url, n) => {
    if (url.includes("transcriptions")) return n === 1 ? { code: 429, body: { error: { message: "slow down" } }, headers: { "retry-after": "0" } } : { code: 200, body: { text: "hello world" } };
    return { code: 200, body: { choices: [{ message: { content: "Hello world." } }] } };
  };
  hits = [];
  const r = await Engine.submit(s, Buffer.from("fake-audio"), "audio/webm");
  assert.ok(r.ok, r.text);
  assert.match(r.text, /hello world/i);
  assert.ok(hits.filter((u) => u.includes("transcriptions")).length >= 2);
});

test("dictation: silence is reported, not pasted", async () => {
  Engine.env.delays = [1, 1, 1, 1, 1];
  const s = newStore();
  script = () => ({ code: 200, body: { text: "  " } });
  const r = await Engine.submit(s, Buffer.from("x"), "audio/webm");
  assert.strictEqual(r.ok, false);
});

test("updater only offers releases that carry a desktop installer", async () => {
  const rel = (tag, names, extra = {}) => ({ tag_name: tag, html_url: "u/" + tag, body: "", assets: names.map((name) => ({ name })), ...extra });
  const fakeFetch = async () => ({ ok: true, json: async () => [rel("v9.0.0", ["x.apk"]), rel("v4.2.0", ["x.apk", "Wispr-4.2.0-win-x64.exe"]), rel("v4.1.4", ["Wispr-4.1.4-mac-arm64.dmg"]), rel("v9.9.9", ["a.exe"], { draft: true })] });
  assert.strictEqual((await Updater.check("4.1.4", fakeFetch)).version, "4.2.0");
  assert.strictEqual(await Updater.check("4.2.0", fakeFetch), null);
});

test("no key handler returns false (that silently blocks typing and Ctrl+V)", () => {
  require("../scripts/build-ui").build();
  for (const f of ["index.html", "panel.html"]) {
    const h = fs.readFileSync(path.join(__dirname, "../renderer", f), "utf8");
    assert.ok(!/onkey(down|up|press)\s*=\s*e\s*=>\s*e\.key\s*===[^;{]*&&/.test(h), `${f}: key handler can return false`);
  }
});

test("key listener: chords fire once per press, extra modifiers and repeats do not", () => {
  const Hook = require("../main/hook");
  const K = { Space: 57, W: 17, Escape: 1 };
  const fired = [];
  const m = Hook.matcher(() => ({ hotkey: "Control+Shift+Space", panelKey: "Command+Shift+W" }), K, (n) => fired.push(n));
  const tap = (...c) => { c.forEach((k) => m.key(k, true)); [...c].reverse().forEach((k) => m.key(k, false)); };
  tap(29, 42, 57);                       // Ctrl+Shift+Space
  assert.deepStrictEqual(fired, ["hotkey"]);
  m.key(29, true); m.key(42, true); m.key(57, true); m.key(57, true); m.key(57, true); // key repeat
  assert.deepStrictEqual(fired, ["hotkey", "hotkey"]);
  m.reset();
  tap(29, 42, 56, 57);                   // + Alt: a different chord
  tap(57);                               // bare Space
  assert.strictEqual(fired.length, 2);
  tap(3675, 42, 17);                     // Cmd+Shift+W
  assert.strictEqual(fired[2], "panelKey");
  assert.deepStrictEqual(Hook.parse("Control+Shift+Space", { Space: 57 }), { mods: ["ctrl", "shift"], code: 57 });
  assert.strictEqual(Hook.parse("Control+Shift+Bogus", { Space: 57 }), null);
});

test("Hindi, Hinglish and English are never forced on Whisper (mixed speech must be written as spoken)", async () => {
  let form;
  const orig = globalThis.fetch;
  globalThis.fetch = async (_u, o) => { form = o.body; return { ok: true, status: 200, text: async () => JSON.stringify({ text: "ok" }) }; };
  try {
    await Groq.transcribe("gsk_" + "a".repeat(30), Buffer.from("x"), "whisper-large-v3", "en", "", "audio/webm");
    assert.strictEqual(form.get("language"), null);
    for (const l of ["hinglish", "hi", "auto"]) {
      await Groq.transcribe("gsk_" + "a".repeat(30), Buffer.from("x"), "whisper-large-v3", l, "", "audio/webm");
      assert.strictEqual(form.get("language"), null, l);
    }
    await Groq.transcribe("gsk_" + "a".repeat(30), Buffer.from("x"), "whisper-large-v3", "ta", "", "audio/webm");
    assert.strictEqual(form.get("language"), "ta");
  } finally { globalThis.fetch = orig; }
});

test("model chains follow Groq's live list and fall back when a pick is gone", () => {
  const Models = require("../main/models");
  Models.setLive(new Set(["whisper-large-v3-turbo", "openai/gpt-oss-20b", "whisper-large-v4"]));
  assert.deepStrictEqual(Models.sttChain("whisper-large-v3"), ["whisper-large-v3-turbo", "whisper-large-v4"]);
  assert.deepStrictEqual(Models.textChain("openai/gpt-oss-120b"), ["openai/gpt-oss-20b"]);
  const list = JSON.parse(Models.json(new Set(["whisper-large-v4", "newco/chat-1", "some-guard"])));
  assert.ok(list.find((m) => m.id === "whisper-large-v4" && m.kind === "stt"));
  assert.ok(list.find((m) => m.id === "newco/chat-1" && m.kind === "text"));
  assert.ok(!list.find((m) => m.id === "some-guard"));
  Models.setLive(new Set(["unrelated"]));            // nothing matches: keep the full chain instead of an empty one
  assert.ok(Models.sttChain("whisper-large-v3").length >= 2);
  Models.setLive(null);
});

test("mac updater picks the zip for this CPU from latest-mac.yml", () => {
  const { pickZip } = require("../main/macupdate");
  const yml = "version: 4.1.8\nfiles:\n  - url: Wispr-4.1.8-mac-x64.zip\n    sha512: AAA\n    size: 10\n  - url: Wispr-4.1.8-mac-arm64.zip\n    sha512: BBB\n    size: 20\n  - url: Wispr-4.1.8-mac-arm64.dmg\n    sha512: CCC\n    size: 30\npath: x.zip\nsha512: AAA\n";
  assert.deepStrictEqual(pickZip(yml, "arm64"), { url: "Wispr-4.1.8-mac-arm64.zip", sha512: "BBB", size: 20 });
  assert.strictEqual(pickZip(yml, "x64").sha512, "AAA");
  assert.strictEqual(pickZip("files: []", "arm64"), null);
});
