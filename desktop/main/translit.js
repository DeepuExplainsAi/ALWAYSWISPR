// Offline last line of defence for Hinglish mode (port of Translit.java).
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
// If Groq's text model is down / rate-limited, Devanagari and Urdu script are still turned into Roman letters locally.
const CONS = new Map([["क", "k"], ["ख", "kh"], ["ग", "g"], ["घ", "gh"], ["ङ", "n"], ["च", "ch"], ["छ", "chh"], ["ज", "j"], ["झ", "jh"], ["ञ", "n"], ["ट", "t"], ["ठ", "th"], ["ड", "d"], ["ढ", "dh"], ["ण", "n"], ["त", "t"], ["थ", "th"], ["द", "d"], ["ध", "dh"], ["न", "n"], ["प", "p"], ["फ", "ph"], ["ब", "b"], ["भ", "bh"], ["म", "m"], ["य", "y"], ["र", "r"], ["ल", "l"], ["व", "v"], ["श", "sh"], ["ष", "sh"], ["स", "s"], ["ह", "h"], ["ळ", "l"]]);
for (const [cp, r] of [["0958", "q"], ["0959", "kh"], ["095A", "g"], ["095B", "z"], ["095C", "d"], ["095D", "rh"], ["095E", "f"], ["095F", "y"], ["0929", "n"], ["0931", "r"], ["0934", "l"]]) CONS.set(String.fromCharCode(parseInt(cp, 16)), r);
const VOWEL = new Map([["अ", "a"], ["आ", "aa"], ["इ", "i"], ["ई", "ee"], ["उ", "u"], ["ऊ", "oo"], ["ऋ", "ri"], ["ए", "e"], ["ऐ", "ai"], ["ओ", "o"], ["औ", "au"], ["ऍ", "e"], ["ऑ", "o"], ["ऎ", "e"], ["ऒ", "o"]]);
const MATRA = new Map([["ा", "aa"], ["ि", "i"], ["ी", "ee"], ["ु", "u"], ["ू", "oo"], ["ृ", "ri"], ["े", "e"], ["ै", "ai"], ["ो", "o"], ["ौ", "au"], ["ॅ", "e"], ["ॉ", "o"], ["ॆ", "e"], ["ॊ", "o"]]);
const URDU = new Map([["ا", "a"], ["آ", "aa"], ["ب", "b"], ["پ", "p"], ["ت", "t"], ["ٹ", "t"], ["ث", "s"], ["ج", "j"], ["چ", "ch"], ["ح", "h"], ["خ", "kh"], ["د", "d"], ["ڈ", "d"], ["ذ", "z"], ["ر", "r"], ["ڑ", "r"], ["ز", "z"], ["ژ", "zh"], ["س", "s"], ["ش", "sh"], ["ص", "s"], ["ض", "z"], ["ط", "t"], ["ظ", "z"], ["ع", "a"], ["غ", "gh"], ["ف", "f"], ["ق", "q"], ["ک", "k"], ["ك", "k"], ["گ", "g"], ["ل", "l"], ["م", "m"], ["ن", "n"], ["ں", "n"], ["و", "o"], ["ہ", "h"], ["ھ", "h"], ["ه", "h"], ["ء", ""], ["ی", "i"], ["ي", "i"], ["ے", "e"], ["ۓ", "e"], ["ئ", "i"], ["ؤ", "o"], ["ۃ", "h"], ["،", ","], ["۔", "."], ["؟", "?"], ["٪", "%"]]);

const code = (ch) => ch.charCodeAt(0);
const isDeva = (ch) => code(ch) >= 0x0900 && code(ch) <= 0x097F;
const isArabic = (ch) => { const c = code(ch); return (c >= 0x0600 && c <= 0x06FF) || (c >= 0x0750 && c <= 0x077F) || (c >= 0x08A0 && c <= 0x08FF); };
const isArabicPunct = (ch) => "،۔؟٪".includes(ch) || (code(ch) >= 0x06F0 && code(ch) <= 0x06F9) || (code(ch) >= 0x0660 && code(ch) <= 0x0669);

/** True if the text still has Devanagari / Urdu / other Indic script that Hinglish mode must not type. */
function hasNonLatinIndic(s) {
  for (const ch of s) { const c = code(ch); if ((c >= 0x0900 && c <= 0x0DFF) || isArabic(ch)) return true; }
  return false;
}
const hasArabic = (s) => [...s].some(isArabic);

function nuktaGuess(ch) {
  switch (ch) {
    case "क": return "q"; case "ख": return "kh"; case "ग": return "g"; case "ज": return "z";
    case "ड": return "d"; case "ढ": return "rh"; case "फ": return "f";
    default: return CONS.get(ch) || "";
  }
}

const newAk = () => ({ cons: "", vowel: null, tail: "", independent: false });

function deva(w) {
  const aks = [];
  let cur = null;
  const startCons = (r) => { const a = newAk(); a.cons = r; aks.push(a); return a; };
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    const next = i + 1 < w.length ? w[i + 1] : "";
    if (next === "\u093C" && CONS.has(ch)) { cur = startCons(nuktaGuess(ch)); i++; continue; }
    if (CONS.has(ch)) { cur = startCons(CONS.get(ch)); continue; }
    if (VOWEL.has(ch)) {
      let vv = VOWEL.get(ch);
      if (cur) {
        // vowel right after a vowel: "भाई" -> "bhai", "आऊंगा" -> "aaunga", "गए" -> "gaye"
        if (ch === "ई" || ch === "इ") vv = "i";
        else if (ch === "ऊ" || ch === "उ") vv = "u";
        else if (ch === "ए") vv = "ye";
        else if (ch === "ऐ") vv = "ai";
        if ((ch === "ई" || ch === "इ") && cur.vowel === "aa") cur.vowel = "a";
      }
      cur = newAk(); cur.vowel = vv; cur.independent = true; aks.push(cur); continue;
    }
    if (MATRA.has(ch) && cur) { cur.vowel = MATRA.get(ch); continue; }
    if (ch === "्" && cur) { cur.vowel = ""; continue; }
    if ((ch === "ं" || ch === "ँ") && cur) { cur.tail = "n"; continue; }
    if (ch === "ः" && cur) { cur.tail = "h"; continue; }
  }
  // merge virama-killed consonants into the next akshara as a cluster
  const merged = [];
  let carry = "";
  for (const a of aks) {
    if (!a.independent && a.vowel === "" && a.tail === "") { carry += a.cons; continue; }
    if (carry) {
      if (a.independent) { const c = newAk(); c.cons = carry; c.vowel = ""; merged.push(c); }
      else a.cons = carry + a.cons;
      carry = "";
    }
    merged.push(a);
  }
  if (carry) { const c = newAk(); c.cons = carry; c.vowel = ""; merged.push(c); }

  const n = merged.length;
  const dropSchwa = new Array(n).fill(false);
  // final schwa is silent in Hindi: "कल" -> "kal", but keep it for one-letter words: "न" -> "na"
  if (n > 1 && merged[n - 1].vowel === null && merged[n - 1].tail === "") dropSchwa[n - 1] = true;
  // medial schwa deletion: V C(a) C V -> V C C V  ("समझना" -> "samajhna", "लड़की" -> "ladki")
  for (let i = n - 2; i >= 1; i--) {
    const a = merged[i];
    if (a.vowel !== null || a.tail !== "") continue;
    const prev = merged[i - 1], nxt = merged[i + 1];
    const prevVoiced = prev.vowel === null ? !dropSchwa[i - 1] : prev.vowel !== "";
    const nextHasVowel = (nxt.vowel !== null && nxt.vowel !== "") || (nxt.vowel === null && !dropSchwa[i + 1]);
    if (prevVoiced && nextHasVowel && !nxt.independent && !dropSchwa[i + 1] && i + 1 < n) {
      if (i + 1 === n - 1 && nxt.vowel === null) continue; // "अमर" style: keep "amar"
      dropSchwa[i] = true;
    }
  }
  let b = "";
  for (let i = 0; i < n; i++) {
    const a = merged[i];
    b += a.cons;
    let v = a.vowel === null ? (dropSchwa[i] ? "" : "a") : a.vowel;
    const last = i === n - 1;
    // chat-style spelling at word end: "क्या" -> "kya", "थी" -> "thi", "तू" -> "tu"
    if (last || (i === n - 2 && merged[n - 1].cons === "" && !merged[n - 1].independent)) {
      if (v === "aa" && a.cons) v = "a";
      else if (v === "ee" && a.cons) v = "i";
      else if (v === "oo" && a.cons) v = "u";
    }
    if (a.tail && v === "ee") v = "i";
    b += v;
    if (a.tail === "n") b += a.cons === "" && v === "" ? "" : "n";
    else b += a.tail;
  }
  b = b.replaceAll("chchh", "chh").replaceAll("kkh", "kh");
  if (b === "maen" || b === "maein") b = "main";
  if (b === "naheen" || b === "nahin") b = "nahi";
  return b;
}

function convertWord(w, mode) {
  if (mode === 2) return [...w].map((c) => URDU.get(c) ?? "").join("");
  return deva(w);
}

function capitalizeSentences(s) {
  const out = [...s];
  let cap = true;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (cap && /[\p{L}\p{N}]/u.test(ch)) { if (/\p{L}/u.test(ch)) out[i] = ch.toUpperCase(); cap = false; }
    else if (ch === "." || ch === "?" || ch === "!" || ch === "\n") cap = true;
  }
  return out.join("");
}

/** Devanagari + Urdu script -> Hinglish-style Roman letters. Latin text passes through untouched. */
function toRoman(s) {
  if (!s) return "";
  let out = "", word = "", mode = 0; // 0 other, 1 devanagari word, 2 urdu word
  for (const ch of s) {
    const c = code(ch);
    const m = isDeva(ch) && ch !== "।" && ch !== "॥" && !(c >= 0x0966 && c <= 0x096F) ? 1 : isArabic(ch) && !isArabicPunct(ch) ? 2 : 0;
    if (m !== mode && word) { out += convertWord(word, mode); word = ""; }
    mode = m;
    if (m === 0) {
      if (ch === "।" || ch === "॥") out += ".";
      else if (isArabicPunct(ch)) out += URDU.get(ch) ?? "";
      else if (c >= 0x0966 && c <= 0x096F) out += String.fromCharCode(48 + c - 0x0966);
      else if (c >= 0x06F0 && c <= 0x06F9) out += String.fromCharCode(48 + c - 0x06F0);
      else if (c >= 0x0660 && c <= 0x0669) out += String.fromCharCode(48 + c - 0x0660);
      else if (c >= 0x0980 && c <= 0x0DFF) { /* other Indic scripts: drop rather than type them */ }
      else out += ch;
    } else word += ch;
  }
  if (word) out += convertWord(word, mode);
  return capitalizeSentences(out);
}

module.exports = { hasNonLatinIndic, hasArabic, toRoman };
