// Port of Models.kt. Every Groq model Wispr can use, all on Groq's free plan.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const m = (id, label, note, kind, o = {}) => ({ id, label, note, kind, preview: !!o.preview, vision: !!o.vision, web: !!o.web });

const ALL = [
  m("whisper-large-v3", "Whisper Large v3", "Most accurate, best for fast speech", "stt"),
  m("whisper-large-v3-turbo", "Whisper v3 Turbo", "Fastest", "stt"),
  m("openai/gpt-oss-120b", "GPT-OSS 120B", "Best quality (default)", "text"),
  m("openai/gpt-oss-20b", "GPT-OSS 20B", "Fastest replies", "text"),
  m("qwen/qwen3.8-27b", "Qwen 3.8 27B", "Newest, reads images (OCR)", "text", { preview: true, vision: true }),
  m("qwen/qwen3.6-27b", "Qwen 3.6 27B", "Reads images (OCR), strong multilingual", "text", { preview: true, vision: true }),
  m("groq/compound", "Groq Compound", "Searches the web for live answers (250/day)", "text", { web: true }),
  m("groq/compound-mini", "Groq Compound Mini", "Quick web search answers (250/day)", "text", { web: true }),
];

const DEFAULT_STT = "whisper-large-v3";
const FAST_STT = "whisper-large-v3-turbo";
const DEFAULT_LLM = "openai/gpt-oss-120b";
const FAST_LLM = "openai/gpt-oss-20b";
const DEFAULT_VISION = "qwen/qwen3.8-27b";

/** Model ids Groq has shut down. Saved settings pointing at these are moved to a default. */
const DEAD = new Set([
  "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama3-70b-8192", "llama3-8b-8192",
  "qwen/qwen3-32b", "meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct",
  "gemma2-9b-it", "mixtral-8x7b-32768", "deepseek-r1-distill-llama-70b", "moonshotai/kimi-k2-instruct",
  "moonshotai/kimi-k2-instruct-0905", "distil-whisper-large-v3-en",
]);

const find = (id) => ALL.find((x) => x.id === id);
const isVision = (id) => find(id)?.vision === true;
const uniq = (a) => [...new Set(a)];
const sttChain = (chosen) => uniq([chosen, DEFAULT_STT, FAST_STT]);
const textChain = (chosen) => uniq([chosen, DEFAULT_LLM, FAST_LLM]);
const visionChain = (chosen) => uniq([chosen].filter(isVision).concat(ALL.filter((x) => x.vision).map((x) => x.id)));

/** Ids that are not chat/speech models (safety, TTS, prompt guards). Hidden from the pickers. */
const NOT_CHAT = /guard|safeguard|orpheus|tts|whisper|embed/i;

/** Catalog for the UI. `live` = ids from Groq's /models for this key (null if not fetched yet). */
function json(live) {
  const out = ALL.map((x) => ({ ...x, live: live ? live.has(x.id) : true }));
  if (live) {
    [...live].filter((id) => !find(id) && !DEAD.has(id) && !NOT_CHAT.test(id)).sort().forEach((id) =>
      out.push({ id, label: id.split("/").pop(), note: "New on Groq", kind: "text", preview: true, vision: false, web: false, live: true }));
  }
  return JSON.stringify(out);
}

module.exports = { ALL, DEFAULT_STT, FAST_STT, DEFAULT_LLM, FAST_LLM, DEFAULT_VISION, DEAD, find, isVision, sttChain, textChain, visionChain, json };
