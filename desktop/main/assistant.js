// Port of Assistant.kt: chat, "understand screen" and voice-to-text for the chat box, all with the user's own Groq key.
// Chat history lives only in memory and is trimmed to fit Groq's free plan (8K tokens/min).
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const Groq = require("./groq");
const { GroqError } = Groq;
const Models = require("./models");
const P = require("./prompts");
const Engine = require("./engine");

const MAX_CHARS = 9000; // ~2.5K tokens of history per request
const MAX_TURNS = 24;
let turns = []; // { role, text }

const historyJson = () => JSON.stringify(turns);
const reset = () => { turns = []; };

function key(st) {
  if (!st.apiKey) throw new GroqError("Add your Groq key in the Wispr app first.", false, { auth: true });
  return st.apiKey;
}

/** Reply language: explicit "Explain in" pick, else the dictation language. */
const style = (st) => st.str("explainIn") || ({ hi: "hi", hinglish: "hinglish" }[st.str("lang")] || "en");

/** Runs `block`, resolves { ok, text } and never throws. */
async function run(st, block) {
  try { return { ok: true, text: await block(key(st)) }; } catch (e) {
    return { ok: false, text: e instanceof GroqError ? e.message : `Something went wrong (${e.constructor.name}).` };
  }
}

/** Tries the chosen model, then safe defaults if Groq removed it. */
async function completeAny(st, k, pref, chain, msgs, maxTokens) {
  let last = null;
  for (const m of chain) {
    try {
      const out = await Groq.complete(k, m, msgs, 0.4, maxTokens);
      if (m !== st.str(pref)) st.put(pref, m);
      return out;
    } catch (e) {
      if (!(e instanceof GroqError) || !e.modelGone) throw e;
      last = e;
    }
  }
  throw last || new GroqError("No model available on Groq.", false);
}

/** Newest turns that fit in MAX_CHARS, oldest first. */
function trimmed() {
  const out = [];
  let total = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    total += turns[i].text.length;
    if (total > MAX_CHARS) break;
    out.unshift(turns[i]);
  }
  return out;
}

function chat(st, userText, onStatus) {
  const q = String(userText).trim().slice(0, 6000);
  if (!q) return Promise.resolve({ ok: false, text: "Type or say something first." });
  return run(st, async (k) => {
    const msgs = [{ role: "system", content: P.chatSystem(style(st)) },
      ...trimmed().map((t) => ({ role: t.role, content: t.text })),
      { role: "user", content: q }];
    const answer = await Engine.withRetry(onStatus, () => completeAny(st, k, "chatModel", Models.textChain(st.str("chatModel")), msgs, 2048));
    turns.push({ role: "user", text: q }, { role: "assistant", text: answer });
    while (turns.length > MAX_TURNS) turns.shift();
    return answer;
  });
}

/** Screenshot -> OCR + meaning with a vision model (Qwen 3.8 / 3.6, free plan). */
const understandImage = (st, jpegB64, onStatus) => run(st, (k) => {
  const msgs = [Groq.imageMessage(P.screenImage(style(st)), jpegB64)];
  return Engine.withRetry(onStatus, () => completeAny(st, k, "visionModel", Models.visionChain(st.str("visionModel")), msgs, 2048));
});

/** Voice -> text for the chat box (same language rules as dictation, no rewriting). */
const transcribe = (st, audio, mime, onStatus) => run(st, async (k) => {
  const lang = st.str("lang");
  const raw = await Engine.withRetry(onStatus, () => Engine.transcribeAny(st, k, audio, lang, Engine.whisperPrompt(st, lang), mime));
  if (!raw.trim() || Engine.isWhisperNoise(raw)) throw new GroqError("Didn't catch that. Try again.", false);
  const roman = lang === "hinglish" || ((lang === "auto" || lang === "en") && !st.bool("deva"));
  return st.applySpell(roman ? await Engine.forceRoman(st, k, raw, onStatus) : raw);
});

module.exports = { historyJson, reset, chat, understandImage, transcribe };
