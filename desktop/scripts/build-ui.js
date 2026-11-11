// Builds renderer/ from the Android HTML (single source of truth) plus a few desktop-only patches.
// Every patch must match, so if the Android HTML changes in a way that breaks one, the build fails loudly.
// Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta. SPDX-License-Identifier: Apache-2.0
const fs = require("node:fs");
const path = require("node:path");

const WEB = path.join(__dirname, "../../app/src/main/assets/web");
const OUT = path.join(__dirname, "../renderer");
const UI = path.join(__dirname, "../ui");

const PERMS = `const PERMS = [
    ["mic","Microphone","So Wispr can hear you"],
    ["paste","Type into other apps","macOS: allow Accessibility so Wispr can paste your words into the app you are using"],
    ["screen","Understand screen","macOS: allow Screen Recording so Wispr can read your screen when you ask"]
  ];`;

const SHORTCUT_ROWS = `<div class="row"><label for="hotkeyIn">Dictation shortcut<small id="hotkeyNote">Press it to start talking, press it again to type. Esc cancels.</small></label><input class="field" id="hotkeyIn" readonly style="width:11rem;text-align:center"></div>
      <div class="row"><label for="panelKeyIn">Mini window shortcut<small>Modes, AI chat, Understand screen</small></label><input class="field" id="panelKeyIn" readonly style="width:11rem;text-align:center"></div>
      <div class="row"><label for="autoSw">Start with the computer<small>Wispr waits quietly in the tray</small></label><input type="checkbox" class="switch" id="autoSw"></div>`;

/** Replaces exactly one thing, or throws. `from` is a string or a RegExp. */
function rep(src, from, to, label) {
  const hit = typeof from === "string" ? src.includes(from) : from.test(src);
  if (!hit) throw new Error(`build-ui: patch "${label}" no longer matches the Android HTML`);
  return src.replace(from, () => to);
}

function patchIndex(h) {
  const p = (from, to, label) => (h = rep(h, from, to, label));
  p(/Allow the mic and the Wispr bubble once\. Then open any keyboard[^<]*/, "Allow the mic once. Then press your Wispr shortcut (Ctrl+Shift+Space, or ⌘+Shift+Space on Mac) in any app, speak, press it again, and your words get typed right there.", "onboarding");
  p(/Your key is locked with Android Keystore encryption on this phone and never shown again\. Audio goes straight from your phone to Groq/, "Your key is locked with your system keychain and never shown again. Audio goes straight from your computer to Groq", "privacy");
  p("Allow these once. Wispr then works over every keyboard, in every app.", "Allow these once. Wispr then works in every app.", "perms text");
  p(/<div class="tip hidden" id="restrictedTip">[\s\S]*?<\/div>/, '<div id="restrictedTip" style="display:none"></div>', "restrictedTip");
  p("(AES-256-GCM, Android Keystore)", "(AES-256-GCM, system keychain)", "legal");
  p("Look &amp; bubble", "Look &amp; orb", "eyebrow");
  p(/<div class="row"><label for="bubbleSw">[\s\S]*?id="bubbleSw"><\/div>/, '<div class="row"><label for="bubbleSw">Floating orb<small>A small pill at the bottom of the screen while you speak (✕ cancels, ✓ types). It only adds text, never deletes.</small></label><input type="checkbox" class="switch" id="bubbleSw"></div>', "bubble row");
  p(/<div class="row"><label for="holdSel">[\s\S]*?<\/select><\/div>/, SHORTCUT_ROWS, "hold row");
  p('$("holdSel").value = S.hold || "panel"; ', "", "holdSel value");
  p('  $("holdSel").onchange = e => set("hold", e.target.value);\n', "", "holdSel change");
  p("Auto: downloads on Wi-Fi and verifies it, then one tap installs. Your key and settings stay.", "A card appears here when a new version is out. It downloads inside Wispr; tap Install and Wispr restarts into the new version. Your key and settings stay.", "updates text");
  p('<option value="auto">Auto download</option><option value="notify">Just notify me</option>', '<option value="auto">Check automatically</option>', "update options");
  p(/<p class="legal">Every update is checked before install:[^<]*<\/p>/, '<p class="legal">Updates download inside Wispr from this project\'s GitHub Releases and are checked against their checksum before install.</p>', "update legal");
  p("runs inside its Android app.", "runs inside its desktop app.", "no bridge");
  p(/const PERMS = \[[\s\S]*?\n  \];/, PERMS, "PERMS");
  p("</style>", fs.readFileSync(path.join(UI, "desktop.css"), "utf8") + "</style>", "desktop css");
  p("  /* ---------- boot ---------- */", fs.readFileSync(path.join(UI, "settings.js"), "utf8") + "\n  /* ---------- boot ---------- */", "boot marker");
  return h;
}

function patchPanel(h) {
  h = rep(h, /\$\("dictLbl"\)\.textContent = N\.hasTarget\(\)[^;]*;/, '$("dictLbl").textContent = "Speak into the text box";', "dictLbl");
  return rep(h, "</style>", ".top{-webkit-app-region:drag}.top button{-webkit-app-region:no-drag}\n</style>", "drag region");
}

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const read = (f) => fs.readFileSync(path.join(WEB, f), "utf8").replace(/\r\n/g, "\n");
  fs.writeFileSync(path.join(OUT, "index.html"), patchIndex(read("index.html")));
  fs.writeFileSync(path.join(OUT, "panel.html"), patchPanel(read("panel.html")));
  fs.copyFileSync(path.join(UI, "bubble.html"), path.join(OUT, "bubble.html"));
}

if (require.main === module) build();
module.exports = { build, patchIndex, patchPanel };
