// Port of Groq.kt. Talks to Groq over HTTPS only; the key goes in a header and is never logged.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const base = () => process.env.WISPR_GROQ_BASE || "https://api.groq.com/openai/v1/";

class GroqError extends Error {
  /** o: auth (key refused), modelGone, badParam (retry without optional fields), code, retryAfterMs */
  constructor(message, retryable, o = {}) {
    super(message);
    this.retryable = retryable;
    this.auth = !!o.auth;
    this.modelGone = !!o.modelGone;
    this.badParam = !!o.badParam;
    this.code = o.code || 0;
    this.retryAfterMs = o.retryAfterMs || 0;
  }
}

/** Cleans whatever the user pasted: spaces, zero-width chars, quotes, a leading "Bearer ", markdown-escaped "gsk\_". */
function cleanKey(input) {
  let k = String(input).replaceAll("\\_", "_").replace(/[\s\u200B-\u200F\u2060\uFEFF\u00A0"'`“”‘’<>]/g, "");
  if (/^bearer/i.test(k)) k = k.slice(6);
  const i = k.indexOf("gsk_");
  if (i > 0) k = k.slice(i);
  return [...k].filter((c) => c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 126).join("");
}

/** "2", "1.5", "7m2.5s", "300ms" -> milliseconds (Groq uses all of these). */
function parseWait(v) {
  if (!v || !String(v).trim()) return 0;
  const n = Number(String(v).trim());
  if (Number.isFinite(n)) return Math.round(n * 1000);
  let ms = 0;
  for (const [, num, unit] of String(v).matchAll(/([0-9.]+)(ms|h|m|s)/g)) {
    const x = parseFloat(num) || 0;
    ms += unit === "ms" ? x : unit === "s" ? x * 1000 : unit === "m" ? x * 60000 : x * 3600000;
  }
  return Math.round(ms);
}

async function exec(path, init) {
  let res, body;
  try {
    res = await fetch(base() + path, { ...init, signal: AbortSignal.timeout(180000) });
    body = await res.text();
  } catch {
    throw new GroqError("Couldn't reach Groq. Check your internet.", true);
  }
  if (res.ok) return body;
  const code = res.status;
  const wait = parseWait(res.headers.get("retry-after"));
  let err = null;
  try { err = JSON.parse(body).error; } catch { /* not json */ }
  const apiMsg = err?.message || "";
  const apiCode = String(err?.code || "");
  const low = apiMsg.toLowerCase();
  const modelIssue = apiCode.includes("model") || (low.includes("model") &&
    ["decommission", "does not exist", "not found", "no longer", "not have access", "not supported"].some((s) => low.includes(s)));
  if (code === 401) throw new GroqError(`Groq didn't accept this key (401). ${apiMsg || "It may be deleted or mistyped."} Create a new one at console.groq.com/keys.`, false, { auth: true, code });
  if (code === 403) throw new GroqError(`Groq blocked the request (403). ${apiMsg || "Your account or network may be restricted."} Turn off VPN / try another network.`, false, { auth: true, code });
  if (code === 429 && (low.includes("per day") || low.includes("tpd") || low.includes("rpd")))
    throw new GroqError("Today's free Groq limit for this model is used up. Pick another model (AI models) or try tomorrow.", false, { code, retryAfterMs: wait });
  if (code === 429) throw new GroqError("Groq free-plan limit hit, waiting a moment…", true, { code, retryAfterMs: wait });
  if (code === 413) throw new GroqError("Too big for Groq. Try a shorter recording / smaller text.", false, { code });
  if (code === 408 || (code >= 500 && code <= 599)) throw new GroqError("Groq is busy right now.", true, { code });
  if ((code === 404 || code === 400) && modelIssue) throw new GroqError(apiMsg || "Model not available on Groq.", false, { modelGone: true, code });
  if (code === 400 && ["reasoning", "property", "unsupported", "unknown"].some((s) => low.includes(s)))
    throw new GroqError(apiMsg || "Groq rejected an option.", false, { badParam: true, code });
  throw new GroqError(apiMsg || `Groq error ${code}`, false, { code });
}

const auth = (key) => ({ Authorization: `Bearer ${key}` });
const get = (key, path) => exec(path, { method: "GET", headers: auth(key) });
const postJson = (key, path, body) => exec(path, { method: "POST", headers: { ...auth(key), "Content-Type": "application/json" }, body: JSON.stringify(body) });

const verify = (key) => get(key, "models");

/** Ids of every model this key can use right now. */
async function listModels(key) {
  let data;
  try { data = JSON.parse(await get(key, "models")).data; } catch (e) {
    if (e instanceof GroqError) throw e;
    throw new GroqError("Groq sent a bad model list.", true);
  }
  return new Set((data || []).filter((o) => o.active !== false && o.id).map((o) => o.id));
}

async function transcribe(key, audio, model, lang, prompt, mime = "audio/webm") {
  const f = new FormData();
  f.append("file", new Blob([audio], { type: mime }), `speech.${mime.includes("mp4") ? "m4a" : "webm"}`);
  f.append("model", model);
  f.append("response_format", "json");
  f.append("temperature", "0");
  // Whisper has no Odia code; "hinglish" is sent as Hindi (best recognition) and romanised afterwards.
  // English is NOT forced: with language=en Whisper translates Hindi speech into English instead of writing what was said.
  const wl = lang === "auto" || lang === "or" || lang === "en" ? null : lang === "hinglish" ? "hi" : lang;
  if (wl) f.append("language", wl);
  if (prompt && prompt.trim()) f.append("prompt", prompt);
  const body = await exec("audio/transcriptions", { method: "POST", headers: auth(key), body: f });
  try { return String(JSON.parse(body).text ?? "").trim(); } catch { throw new GroqError("Groq sent a bad reply.", true); }
}

/** Any chat/completions call. Sends the "think briefly" options first and retries without them if a model refuses them. */
async function complete(key, model, messages, temperature, maxTokens) {
  try {
    return await completeOnce(key, model, messages, temperature, maxTokens, true);
  } catch (e) {
    if (e instanceof GroqError && e.badParam) return completeOnce(key, model, messages, temperature, maxTokens, false);
    throw e;
  }
}

async function completeOnce(key, model, messages, temperature, maxTokens, extras) {
  const p = { model, messages, temperature, max_completion_tokens: maxTokens };
  if (extras) {
    if (model.startsWith("openai/gpt-oss")) p.reasoning_effort = "low";
    if (model.startsWith("qwen/")) p.reasoning_format = "hidden";
  }
  const body = await postJson(key, "chat/completions", p);
  let out;
  try { out = JSON.parse(body).choices[0].message.content ?? ""; } catch { throw new GroqError("Groq sent a bad reply.", true); }
  const clean = out.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!clean) throw new GroqError("Groq sent an empty reply.", true);
  return clean;
}

/** Dictation clean-up / translation: one system prompt + the dictated text. */
async function chat(key, model, system, text) {
  const msgs = [
    { role: "system", content: system },
    { role: "user", content: `<dictation>\n${text}\n</dictation>` },
  ];
  // Free plan = 8K tokens/min: never reserve more output than this text can need.
  const maxOut = Math.min(4096, Math.max(512, text.length * 2 + 512));
  let out = (await complete(key, model, msgs, 0.2, maxOut)).replace(/<\/?dictation>/g, "").trim();
  const q = (c) => c === '"' || c === "“";
  const qe = (c) => c === '"' || c === "”";
  if (out.length > 1 && q(out[0]) && qe(out.at(-1)) && !q(text[0])) out = out.slice(1, -1).trim();
  if (!out) throw new GroqError("Groq sent an empty reply.", true);
  return out;
}

/** Message with one image (JPEG, base64) for the vision models. */
const imageMessage = (prompt, jpegBase64) => ({
  role: "user",
  content: [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
  ],
});

module.exports = { GroqError, cleanKey, parseWait, verify, listModels, transcribe, complete, chat, imageMessage };
