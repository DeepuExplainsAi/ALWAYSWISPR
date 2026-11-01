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

## TODO (in this order)
1. **`scripts/build-ui.js`** → copies `../app/src/main/assets/web/{index,panel}.html` to `renderer/` and patches strings (single source of truth = the Android HTML; do NOT fork it). Patches needed (all verified present in the Android files):
   - index.html: Android-only text (onboarding step 3 line ~305, privacy line ~307 "Android Keystore", perms text ~326/328 restrictedTip, settings legal ~377, "Bubble over keyboard"/"Hold the bubble" rows ~392-394, updates text ~422/425 "Wi-Fi", "APK"); `PERMS` array (~521) → desktop perms (mic, accessibility/paste on macOS); `"Tap the orb to speak"` hint (~546) → mention the shortcut; the `if (!N) {… runs inside its Android app}` guard (~443).
   - Add settings rows: global shortcut (`hotkey`), mini-window shortcut (`panelKey`), launch at login (`autostart`). Add a shortcut recorder input.
   - panel.html: `dictLbl` text (~262), `N.keyboard` (not needed on desktop → no-op), `sizeBtn` (~250, optional), OCR note (~353, `canScan` → true), titles mentioning "hold the bubble"/Android.
   - Remove CSP `connect-src 'none'` is fine (all network is in main process) — keep it.
2. **`preload/preload.js`** → `contextBridge` exposing `window.WisprNative` (main window) and `window.WisprPanel` (panel) with the **same method names** as the Android `Bridge` (see `MainActivity.kt` Bridge and `Panel.kt` Bridge). The Android bridge is **synchronous** (`N.getSettings()`, `N.models()`, `N.perms()`, `N.level()`, `N.hasTarget()`, `N.canScan()`…): implement those with `ipcRenderer.sendSync`, except `level()` which must be computed locally in the renderer with a WebAudio `AnalyserNode` (called every 60 ms). Async ones (`verifyKey(k,id)`, `stopRec(id)`, `retry`, `chat(text,id)`, `voiceStop(id)`, `understand(mode,id)`, `refreshModels(id)`) answer through `window.WisprCb(id, ok, data)` / `window.WisprStatus(id, msg)` — keep that protocol (main → `webContents.executeJavaScript` or `ipcRenderer.on`).
3. **Recording**: `getUserMedia` + `MediaRecorder` (webm/opus; pass mime to `Engine.submit`) inside the renderer that owns the orb. Reject recordings < ~0.7 s ("Too short"). Max 15 min like Android.
4. **`main/main.js`** (Electron main): single-instance lock; `crypto.init(app.getPath('userData'), safeStorage)`; `Store`; windows: main app window, **bubble window** (frameless, transparent, always-on-top, `focusable:false` so the target app keeps focus, bottom-centre; shows orb → pill `✕ waveform ✓` — reuse the orb/wave canvas code from index.html lines ~567-600), panel window (mini window, 2nd shortcut). Tray (`build/tray.png`): click = toggle dictation, menu = Open / Mini window / Quit. Close main window → hide to tray. `app.setLoginItemSettings` for `autostart`. Mic permission: `session.setPermissionRequestHandler`.
5. **Hotkey**: `globalShortcut.register(store.hotkey)` = toggle (idle→record, recording→stop+send). Register `Escape` only while recording (cancel). Optional push-to-talk later via uiohook keydown/keyup. Warn in UI if registration fails.
6. **Insert into the focused app** (the core Wispr Flow behaviour): before showing the bubble remember nothing (bubble is non-focusable so focus stays in the target app). After Engine result: `clipboard.writeText(text)` (always, like Android `deliver()`), then `uIOhook.keyTap(UiohookKey.V, [Ctrl|Meta])`. Optionally restore the old clipboard after ~300 ms when `autoCopy` is false. macOS needs Accessibility permission for synthetic keys (`systemPreferences.isTrustedAccessibilityClient(true)`); Linux Wayland can't inject keys → fall back to "copied, press Ctrl+V" toast. Verified in the sandbox that `clipboard + uIOhook.keyTap(V,[Ctrl])` pastes into a focused textarea under Xvfb.
7. **Understand screen**: `desktopCapturer.getSources({types:['screen']})` → JPEG base64 (longest side 1600) → `Assistant.understandImage`. `canScan()` = true. macOS needs Screen Recording permission.
8. **Updates**: replace Android `updateState/checkUpdate/startUpdate…` bridge with a small updater that lists GitHub releases of `DeepuExplainsAi/ALWAYSWISPR` and only considers tags starting with `desktop-v`; use `electron-updater` or just open the release page. ⚠ See "Release trap" below.
9. **CI**: `.github/workflows/desktop.yml`, matrix windows/macos/ubuntu, trigger on tag `desktop-v*`, `electron-builder --publish never`, upload with `softprops/action-gh-release` with **`make_latest: false`**.
10. **Tests** in `desktop/test/`: translit samples; groq `cleanKey`/`parseWait`/error mapping against a tiny local `http` server via `WISPR_GROQ_BASE`; engine happy path + 429 retry + model-gone fallback + NoSpeech with a mock server and `engine.env.delays=[1,1,1,1,1]`; `port-prompts --check`; store never leaks key.
11. **README**: add a "PC app" section (download, shortcut, permissions per OS, build from source). Also add `desktop/` build artefacts (`dist/`, `renderer/`, `node_modules/`) to `.gitignore`.
12. Build installers on CI and attach to a `desktop-v4.1.4` pre-release; hand the owner the download link.

## Release trap (important)
The Android in-app updater (`Updater.kt`) reads `releases/latest` and looks for an `.apk` asset. If a desktop release becomes "latest", **every phone's updater breaks**. So desktop releases MUST use tags `desktop-v*` and `make_latest: false` (and be skipped by the phone: it already ignores releases without an apk, but do not rely on that).
Also `.github/workflows/release.yml` triggers on `v*` tags — `desktop-v*` does not match it (good, keep it that way).

## Sandbox / test notes
- Sandbox has 480 MB RAM. Electron runs only with: `xvfb-run -a npx electron --no-sandbox --disable-gpu --disable-dev-shm-usage --js-flags=--jitless <script>` (root requires `--no-sandbox`; `--single-process`/`--no-zygote` crash). Always wrap in `timeout -s KILL 50` and `pkill -9 -f electron; pkill -9 Xvfb` afterwards — leftovers hang the shell.
- No mic in the sandbox: test recording by feeding a pre-recorded file to `Engine.submit` or by stubbing `getUserMedia`.
- Real Groq key is not available to the agent; use the local mock server for tests. Do not ask the owner for the key; they run the real thing.
- `sh` is dash: no brace expansion in `mkdir -p {a,b}`.
- Scratch dir `~/w/t` (outside the repo) has Electron + uiohook-napi installed; `desktop/` itself has no `node_modules` yet (`npm install` there before running).

## Conventions
Short, self-explaining code; reuse Android logic 1:1 (same prompts, same fallbacks, same retry delays); keep the Apache-2.0 header line "Wispr by Deepu Gupta. Copyright 2026 Deepu Gupta."
