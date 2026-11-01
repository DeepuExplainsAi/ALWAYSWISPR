# Wispr Desktop (PC) — handoff

Goal (from the owner, Hinglish): make the existing Android repo `ALWAYSWISPR` also work as a **PC/laptop app** (download + run). It must behave like Wispr Flow:
- a **global keyboard shortcut** opens the floating orb; the same shortcut (or ✓) stops it; ✕ / Esc cancels;
- on stop, audio → Groq Whisper → Polish/Write/Translate → **sent (pasted) into whatever app/text box was focused**, never overwriting existing text;
- the same **mobile interface** (index.html = main screen + settings, panel.html = mini window with Dictate / AI Chat / Screen / Models) reused as-is for PC.

Branch: `desktop-app`. Everything lives in `desktop/`. Android code under `app/` is untouched; do not change it except to keep prompts in sync.

## Stack
Electron 45 + Node 24 (global `fetch`/`FormData`/`Blob`), CommonJS, no bundler. `uiohook-napi` for synthetic Ctrl/Cmd+V and (optional) push-to-talk. `electron-builder` for installers. Tests: `node --test test/`.

## DONE (all in `desktop/main/`, plain Node, no Electron imports, unit-testable)
| File | Port of | Notes |
|---|---|---|
| `prompts.generated.js` | `Prompts.kt` | **Generated**: `node scripts/port-prompts.js` (`--check` fails if stale). Never hand-edit. |
| `prompts.js` | `Prompts.kt` rest | re-exports generated prompts + desktop-worded `chatSystem`, `screenImage`, `translate`, `replyStyle`, `langName`. |
| `models.js` | `Models.kt` | catalog, DEAD ids, fallback chains, `json(live)`. |
| `groq.js` | `Groq.kt` | `GroqError`, `cleanKey`, `parseWait`, `verify`, `listModels`, `transcribe(key,audio,model,lang,prompt,mime)`, `complete`, `chat`, `imageMessage`. Base URL overridable with env `WISPR_GROQ_BASE` (for tests). |
| `translit.js` | `Translit.java` | offline Devanagari/Urdu → Roman. Checked on sample sentences. |
| `crypto.js` | `Crypto.kt` | AES-256-GCM; master key wrapped by Electron `safeStorage` when available (`init(dir, safeStorage)` must be called first). |
| `store.js` | `Store.kt` | encrypted settings+history. Extra desktop settings: `hotkey`, `panelKey`, `autostart`. Key never in `publicJson()`. |
| `engine.js` | `Engine.kt` | `submit(store, audioBuffer, mime, onStatus)`, `retry`, `withRetry`, `transcribeAny`, `chatAny`, `forceRoman`. Async/Promise based; returns `{ok,text,id}`; never throws. `engine.env.online` / `env.delays` are injectable for tests. |
| `assistant.js` | `Assistant.kt` | `chat`, `understandImage`, `transcribe`, `historyJson`, `reset`. |
| `build/icon.png`, `build/tray.png` | | generated from the Android icon (PIL). |
| `package.json` | | scripts + electron-builder config (nsis+portable, dmg+zip, AppImage+deb, GitHub publish). |

None of this has been run end-to-end yet; only smoke-checked (`node --check`, Translit samples, Groq helpers, models json).

## STATUS
Items 1-11 of the old TODO are done: `scripts/build-ui.js`, `preload/preload.js`, `main/main.js` (+ `paste.js`, `updater.js`), `ui/bubble.html`, `ui/settings.js`, tests (`npm test`), `.github/workflows/desktop.yml`, README section.
Smoke-tested under xvfb: windows open, bridge round-trips, hotkey registers. NOT tested on real hardware: mic recording, paste into other apps, tray, installers. Item 12 (CI build + `desktop-v4.1.4` release) needs the owner to push the tag.

## Releases
APK and PC installers live on the same release `vX.Y.Z` (the "latest" one). The phone updater only takes the `.apk` asset, so extra files are safe. Pushing tag `desktop-vX.Y.Z` builds the installers and uploads them to `vX.Y.Z` (`.github/workflows/desktop.yml`). `release.yml` still triggers on `v*` only; `desktop-v*` does not match it.

## Sandbox / test notes
- Sandbox has 480 MB RAM. Electron runs only with: `xvfb-run -a npx electron --no-sandbox --disable-gpu --disable-dev-shm-usage --js-flags=--jitless <script>` (root requires `--no-sandbox`; `--single-process`/`--no-zygote` crash). Always wrap in `timeout -s KILL 50` and `pkill -9 -f electron; pkill -9 Xvfb` afterwards — leftovers hang the shell.
- No mic in the sandbox: test recording by feeding a pre-recorded file to `Engine.submit` or by stubbing `getUserMedia`.
- Real Groq key is not available to the agent; use the local mock server for tests. Do not ask the owner for the key; they run the real thing.
- `sh` is dash: no brace expansion in `mkdir -p {a,b}`.
- Scratch dir `~/w/t` (outside the repo) has Electron + uiohook-napi installed; `desktop/` itself has no `node_modules` yet (`npm install` there before running).

## Conventions
Short, self-explaining code; reuse Android logic 1:1 (same prompts, same fallbacks, same retry delays); keep the Apache-2.0 header line "Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta."
