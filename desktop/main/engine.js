// Port of Engine.kt. Record -> encrypt audio on disk -> transcribe -> polish/translate.
// Every network step retries on its own (5 times, backing off, waiting for internet).
// If everything still fails, the encrypted audio stays saved so the user can tap Retry later.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const crypto = require("./crypto");
const Groq = require("./groq");
const { GroqError } = Groq;
const Models = require("./models");
const P = require("./prompts");
const Translit = require("./translit");

const DELAYS = [1500, 3000, 6000, 10000, 15000];
const HINDI_SCRIPT = /[\u0900-\u097F]/;
const running = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class NoSpeech extends Error {}

/** Set by main.js so tests can run without Electron. */
const env = { online: () => true, delays: DELAYS };

const hasHindiScript = (t) => HINDI_SCRIPT.test(t) || Translit.hasArabic(t);

/** Whisper's classic hallucinations on silence. */
function isWhisperNoise(t) {
  const x = t.trim().toLowerCase().replace(/[.! ]+$/, "");
  return ["thanks for watching", "thank you for watching", "you", "subtitles by the amara.org community", "please subscribe"].includes(x);
}

/** Retries network hiccups and free-plan rate limits (waits as long as Groq asks, max 20 s per try). */
async function withRetry(onStatus, block) {
  for (let i = 0; i < env.delays.length; i++) {
    try {
      return await block();
    } catch (e) {
      if (!(e instanceof GroqError) || !e.retryable) throw e;
      const wait = Math.max(env.delays[i], Math.min(e.retryAfterMs, 20000));
      onStatus(e.code === 429
        ? `Free-plan limit, waiting ${Math.round(wait / 1000)}s (${i + 1}/${env.delays.length})…`
        : `Network hiccup, retrying ${i + 1}/${env.delays.length}…`);
      await sleep(wait);
      for (let n = 0; n < 30 && !env.online(); n++) await sleep(1000);
    }
  }
  return block();
}

/** Speech model with automatic fallback if Groq removes the chosen one. */
async function transcribeAny(st, key, audio, lang, prompt, mime) {
  const chosen = st.str("stt");
  let last = null;
  for (const m of Models.sttChain(chosen)) {
    try {
      const t = await Groq.transcribe(key, audio, m, lang, prompt, mime);
      if (m !== chosen) st.put("stt", m);
      return t;
    } catch (e) {
      if (!(e instanceof GroqError) || !e.modelGone) throw e;
      last = e;
    }
  }
  throw last || new GroqError("No speech model available on Groq.", false);
}

/**
 * Whisper "prompt": a style example in the chosen language + the user's own words from Spellings.
 * This is the biggest accuracy win for fast speech. Whisper reads max ~224 tokens.
 */
function whisperPrompt(st, lang) {
  const style = { hinglish: P.HINGLISH_HINT, hi: P.HI_HINT, auto: P.AUTO_HINT, en: P.AUTO_HINT }[lang];
  const vocab = st.vocabulary().slice(0, 40).join(", ");
  const p = [style, vocab && `Words: ${vocab}.`].filter(Boolean).join(" ");
  return p.slice(0, 600) || null;
}

/** Text model with automatic fallback (Groq shut down Llama 3.x on 16 Aug 2026). */
async function chatAny(st, key, system, text) {
  const chosen = st.str("llm");
  let last = null;
  for (const m of Models.textChain(chosen)) {
    try {
      const t = await Groq.chat(key, m, system, text);
      if (m !== chosen) st.put("llm", m);
      return t;
    } catch (e) {
      if (!(e instanceof GroqError) || !e.modelGone) throw e;
      last = e;
    }
  }
  throw last || new GroqError("No text model available on Groq.", false);
}

/** Guarantees Latin-only output: second Groq pass, then the offline converter. */
async function forceRoman(st, key, text, onStatus) {
  if (!Translit.hasNonLatinIndic(text)) return text;
  const second = await withRetry(onStatus, () => chatAny(st, key, P.ROMAN, text)).catch(() => text);
  return Translit.hasNonLatinIndic(second) ? Translit.toRoman(second) : second;
}

/**
 * Output script rules:
 * - "hinglish" (Hindi toggle OFF): always Roman letters. Groq first; second pass if Hindi script is left; offline Translit as last resort.
 * - "hi" (Hindi toggle ON): Devanagari as spoken (Urdu script is fixed to Devanagari).
 * - "auto": each sentence stays in the language it was spoken in; only Hindi/Urdu script is romanised unless the Hindi toggle is ON.
 * - "en": English, polished. Other languages: their own script. Translate mode: target language's script.
 */
async function shape(st, key, raw, onStatus) {
  const mode = st.str("mode");
  const lang = st.str("lang");
  const deva = st.bool("deva");
  const fix = st.bool("fixWrite"); // Write mode: repair misheard words only, never reword
  const call = (system, text) => withRetry(onStatus, () => chatAny(st, key, system, text));

  if (mode === "translate") {
    const target = st.str("target");
    const t = await call(P.translate(target), raw).catch(() => raw);
    return target === "hinglish" ? forceRoman(st, key, t, onStatus) : t;
  }
  const roman = lang === "hinglish" || ((lang === "auto" || lang === "en") && !deva);
  if (roman) {
    const auto = lang === "auto";
    const needs = auto ? hasHindiScript(raw) : Translit.hasNonLatinIndic(raw);
    const polish = lang === "hinglish" ? P.POLISH_HINGLISH : lang === "en" ? P.POLISH : P.POLISH_AUTO;
    let first = raw;
    try {
      if (mode === "polish") first = await call(polish, raw);
      else if (needs) first = await call(P.ROMAN, raw);
      else if (fix) first = await call(P.FIX_ONLY, raw);
    } catch { first = raw; }
    // Auto: only Hindi/Urdu script gets romanised; Tamil, Bengali, etc. keep their own script.
    if (auto && !hasHindiScript(first)) return first;
    return forceRoman(st, key, first, onStatus);
  }
  let t = raw;
  try {
    if (mode !== "polish") t = fix ? await call(P.FIX_ONLY, raw) : raw;
    else t = await call(lang === "hi" ? P.POLISH_NATIVE : P.POLISH, raw);
  } catch { t = raw; }
  if (lang === "hi" && Translit.hasArabic(t)) {
    const src = t;
    t = await call(P.TO_DEVANAGARI, src).catch(() => src);
  }
  return t;
}

const noop = () => {};

/** Transcribe + shape one saved recording. Resolves { ok, text, id }; never throws. */
async function work(st, id, onStatus = noop) {
  if (running.has(id)) return { ok: false, text: "Already working on this one…", id };
  running.add(id);
  try {
    const key = st.apiKey;
    if (!key) throw new GroqError("Add your Groq key in the Wispr app first.", false, { auth: true });
    const item = st.item(id);
    if (!item) throw new GroqError("That recording is gone.", false);
    st.patchItem(id, (o) => { o.status = "pending"; delete o.err; });
    let raw = item.raw || "";
    if (!raw) {
      const f = st.audioPath(id);
      if (!fs.existsSync(f)) throw new GroqError("Audio for this one is missing.", false);
      const audio = crypto.decrypt(fs.readFileSync(f));
      const lang = st.str("lang");
      const prompt = whisperPrompt(st, lang);
      raw = await withRetry(onStatus, () => transcribeAny(st, key, audio, lang, prompt, item.mime));
      if (!raw.trim() || isWhisperNoise(raw)) throw new NoSpeech();
      st.patchItem(id, (o) => { o.raw = raw; });
    }
    const text = st.applySpell(await shape(st, key, raw, onStatus));
    st.patchItem(id, (o) => { o.status = "ok"; o.text = text; delete o.raw; });
    fs.rmSync(st.audioPath(id), { force: true });
    if (!st.bool("keepHist")) st.removeItem(id);
    return { ok: true, text, id };
  } catch (e) {
    if (e instanceof NoSpeech) {
      st.removeItem(id);
      return { ok: false, text: "Didn't catch that. Try again a bit closer to the mic.", id: "" };
    }
    const base = e instanceof GroqError ? e.message : `Something went wrong (${e.constructor.name}).`;
    const msg = e instanceof GroqError && e.auth ? base : `${base} Audio saved, click Retry.`;
    st.patchItem(id, (o) => { o.status = "failed"; o.err = msg; });
    return { ok: false, text: msg, id };
  } finally {
    running.delete(id);
  }
}

/** Save the recording encrypted, then work on it. */
async function submit(st, audio, mime, onStatus = noop) {
  const id = randomUUID();
  try {
    fs.writeFileSync(st.audioPath(id), crypto.encrypt(audio));
  } catch {
    return { ok: false, text: "Couldn't save the recording. Try again.", id: "" };
  }
  st.addItem({ id, t: Date.now(), status: "pending", mode: st.str("mode"), mime });
  return work(st, id, onStatus);
}

const retry = (st, id, onStatus = noop) => work(st, id, onStatus);

module.exports = { env, submit, retry, withRetry, transcribeAny, chatAny, forceRoman, whisperPrompt, isWhisperNoise };
