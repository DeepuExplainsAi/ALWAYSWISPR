<h1 align="center">Wispr: free, open-source Wispr Flow alternative</h1>

<p align="center"><b>Voice typing for Windows, macOS, Linux and Android.</b><br>
Speak in Hinglish, Hindi, English or 25+ languages. Wispr types it into any app, in seconds.<br>
Free, private, no account. Bring your own free Groq key.</p>

<p align="center">
  <a href="https://github.com/DeepuExplainsAi/ALWAYSWISPR/releases/latest"><img src="https://img.shields.io/badge/WINDOWS%20%7C%20DOWNLOAD-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="WINDOWS %7C DOWNLOAD"></a>
  <a href="https://github.com/DeepuExplainsAi/ALWAYSWISPR/releases/latest"><img src="https://img.shields.io/badge/macOS%20%7C%20DOWNLOAD-111111?style=for-the-badge&logo=apple&logoColor=white" alt="macOS %7C DOWNLOAD"></a>
  <a href="https://github.com/DeepuExplainsAi/ALWAYSWISPR/releases/latest"><img src="https://img.shields.io/badge/LINUX%20%7C%20DOWNLOAD-E95420?style=for-the-badge&logo=linux&logoColor=white" alt="LINUX %7C DOWNLOAD"></a>
  <a href="https://github.com/DeepuExplainsAi/ALWAYSWISPR/releases/latest"><img src="https://img.shields.io/badge/ANDROID%20APK%20%7C%20DOWNLOAD-34A853?style=for-the-badge&logo=android&logoColor=white" alt="ANDROID APK %7C DOWNLOAD"></a>
</p>

<table align="center">
  <tr>
    <td align="center" valign="top"><b>Windows 10 / 11</b><br>Press <code>Ctrl+Shift+Space</code>, speak,<br>press it again to type.<br><code>Esc</code> cancels · <code>Ctrl+Shift+W</code> mini window</td>
    <td align="center" valign="top"><b>macOS</b><br>Press <code>⌘+Shift+Space</code>, speak,<br>press it again to type.<br><code>Esc</code> cancels · <code>⌘+Shift+W</code> mini window</td>
    <td align="center" valign="top"><b>Linux</b><br>Press <code>Ctrl+Shift+Space</code>, speak,<br>press it again to type.<br><code>Esc</code> cancels · <code>Ctrl+Shift+W</code> mini window</td>
    <td align="center" valign="top"><b>Android 8.0+</b><br>Tap the orange orb, speak,<br>tap ✓ to type (✕ cancels).<br>Hold the orb for the mini window</td>
  </tr>
</table>

<p align="center">
  <a href="https://github.com/DeepuExplainsAi/ALWAYSWISPR/releases/latest">Latest release</a> ·
  <a href="#download">Which file do I need?</a> ·
  <a href="#why-wispr">Why Wispr</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="LICENSE">Apache-2.0</a>
</p>

https://github.com/user-attachments/assets/a830ca98-6e18-4123-a721-9fabcec612f3

## Download

All downloads are on one page: **[Latest release](https://github.com/DeepuExplainsAi/ALWAYSWISPR/releases/latest)**. Pick the file for your device.

| Your device | File to download | Notes |
| --- | --- | --- |
| **Windows 10 / 11** | `Wispr-by-Deepu-Gupta-<version>-win-x64.exe` | Installer. `…-portable.exe` runs without installing. |
| **macOS, Apple Silicon (M1 to M4)** | `…-mac-arm64.dmg` | Open the dmg, drag Wispr to Applications. |
| **macOS, Intel** | `…-mac-x64.dmg` | |
| **Linux (any distro)** | `…-linux-x86_64.AppImage` | `chmod +x` it and run. |
| **Debian / Ubuntu / Mint** | `…-linux-amd64.deb` | `sudo apt install ./file.deb` |
| **Android 8.0+** | `Wispr-by-Deepu-Gupta-v<version>.apk` | Updates itself from GitHub Releases. |

First start: the builds are not code-signed yet. Windows SmartScreen: **More info → Run anyway**. macOS: right-click → **Open**. Then paste your free Groq key from [console.groq.com/keys](https://console.groq.com/keys) and you are ready.

## How to use on each device

### Windows 10 / 11

**Download:** `…-win-x64.exe` (installer) or `…-portable.exe` (no install)

**Install**
1. Run the file. If SmartScreen appears: **More info → Run anyway** (the app is not code-signed yet).
2. Open Wispr, paste your free Groq key from [console.groq.com/keys](https://console.groq.com/keys), tap **Verify**.
3. Allow the microphone when asked. Wispr then waits in the system tray.

**How to use (shortcuts)**

| Action | Shortcut |
| --- | --- |
| Start talking | `Ctrl` + `Shift` + `Space` |
| Stop and type into the app you were using | `Ctrl` + `Shift` + `Space` (again) |
| Cancel | `Esc` (or ✕ on the pill) |
| Open the mini window (AI chat, modes, Understand screen) | `Ctrl` + `Shift` + `W` |

Click in any text box first (browser, Word, WhatsApp Web, Slack...), press the shortcut, speak, press it again. Update: download the new installer and run it over the old one; your key and settings stay.


### macOS (Apple Silicon and Intel)

**Download:** `…-mac-arm64.dmg` (M1 to M4) or `…-mac-x64.dmg` (Intel)

**Install**
1. Open the dmg and drag **Wispr** to Applications. First start: right-click → **Open**.
2. Paste your free Groq key and tap **Verify**.
3. System Settings → Privacy & Security: allow **Microphone**, **Accessibility** (needed to paste into other apps) and **Screen Recording** (only for Understand screen).

**How to use (shortcuts)**

| Action | Shortcut |
| --- | --- |
| Start talking | `⌘` + `Shift` + `Space` |
| Stop and type into the app you were using | `⌘` + `Shift` + `Space` (again) |
| Cancel | `Esc` (or ✕ on the pill) |
| Open the mini window | `⌘` + `Shift` + `W` |


### Linux

**Download:** `…-linux-x86_64.AppImage` (any distro) or `…-linux-amd64.deb` (Debian, Ubuntu, Mint)

**Install**
1. AppImage: `chmod +x Wispr-*.AppImage && ./Wispr-*.AppImage`. Deb: `sudo apt install ./Wispr-*.deb`.
2. Paste your free Groq key and tap **Verify**. Allow the microphone.
3. Auto-paste works on X11. On Wayland the text is copied and you press `Ctrl` + `V` yourself.

**How to use (shortcuts)**

| Action | Shortcut |
| --- | --- |
| Start talking | `Ctrl` + `Shift` + `Space` |
| Stop and type into the app you were using | `Ctrl` + `Shift` + `Space` (again) |
| Cancel | `Esc` (or ✕ on the pill) |
| Open the mini window | `Ctrl` + `Shift` + `W` |


### Android 8.0+

**Download:** `Wispr-by-Deepu-Gupta-v<version>.apk`

**Install**
1. Open the APK. Android asks once to allow **Install unknown apps** for your browser or file manager.
2. Open Wispr, paste your free Groq key and tap **Verify**.
3. Allow the microphone and turn on the **Wispr bubble** (Accessibility). If Android says "Restricted setting": App info → ⋮ → **Allow restricted settings**, then turn it on again.

**How to use (no keyboard shortcuts on a phone, you use the bubble)**

| Action | Gesture |
| --- | --- |
| Start talking | Tap the orange orb over any keyboard |
| Type it into the box | Tap ✓ |
| Cancel | Tap ✕ |
| Open the mini window (modes, AI chat, Understand screen) | Hold the orb |
| Understand screen from any app | Android Accessibility button / shortcut |

Updates: the app shows an update card and installs the new version over the old one; your key and settings stay.


## Why Wispr

Wispr is a free alternative to Wispr Flow, Superwhisper and paid dictation apps. It is built for people who write in **Hinglish** and mix languages all day.

- **Works in every app.** Press one shortcut, speak, press it again. The text appears where your cursor is: browser, Word, Slack, WhatsApp Web, VS Code, email. It only adds text and never deletes yours.
- **Hinglish first.** "kal meeting hai" stays Roman Hinglish. Turn on Hindi to get Devanagari. 25+ languages, plus translate while you speak.
- **Fast and accurate.** Whisper large-v3 on Groq for speech, then an AI pass that fixes punctuation, removes filler words and keeps your meaning.
- **Private by design.** No Wispr server, no account, no tracking. Audio goes straight from your device to Groq over HTTPS with your own key, which is stored encrypted in the system keychain.
- **Free.** Groq's free plan is enough for daily use. The app, the source code and updates cost nothing.
- **More than dictation.** AI chat in a mini window, Understand screen (reads and explains anything on your screen, with OCR for images and PDFs), custom spellings, history with one-tap retry.
- **Open source.** Apache-2.0. Read it, fork it, audit it.

| | Wispr | Typical paid dictation apps |
| --- | --- | --- |
| Price | **Free** | Monthly subscription |
| Hinglish and Indian languages | **Built in** | Limited |
| Account and cloud server | **None** | Required |
| Platforms | **Windows, macOS, Linux, Android** | Often 1 or 2 |
| Source code | **Open (Apache-2.0)** | Closed |

## FAQ

<details><summary><b>Is Wispr really free?</b></summary>
Yes. You use your own free Groq API key. There is no subscription and no Wispr account.
</details>

<details><summary><b>Is it a Wispr Flow alternative?</b></summary>
Yes: global shortcut, floating recording pill, AI cleanup, works in any app, plus Hinglish, Android and Linux support, and it is open source.
</details>

<details><summary><b>Does it work offline?</b></summary>
No. Speech recognition runs on Groq. Your recordings are saved encrypted on your device and retried automatically when the internet is back.
</details>

<details><summary><b>Is my voice or screen sent anywhere?</b></summary>
Only to Groq, using your own key, and only when you dictate or tap Understand screen. Wispr never reads what you type and never sends data on its own.
</details>

<details><summary><b>Linux: it copies but does not paste.</b></summary>
Auto-paste works on X11. On Wayland the text is copied and you press `Ctrl+V`.
</details>

<details><summary><b>macOS asks for permissions.</b></summary>
Allow Microphone, Accessibility (to paste into other apps) and Screen Recording (only for Understand screen) in System Settings → Privacy & Security.
</details>

<sub>Keywords: Wispr Flow alternative, free voice typing, speech to text, dictation app, Hinglish voice typing, Hindi voice typing, Whisper, Groq, Windows, macOS, Linux, Android, open source.</sub>

---

## Features


- **Bubble over every keyboard.** Tap the orange orb, talk, tap ✓. Text is typed where your cursor is (✕ cancels).
- **Never deletes your notes.** Wispr only *adds* text. It never replaces what's already in Notes, Keep, Docs or Word.
- **Hold the bubble: mini window.** Write / Polish / Translate, target language, Hindi ⇄ Hinglish, AI models, **AI chat**, **Understand screen**.
- **Understand any screen in one tap.** Reads the text on screen in any language and explains or translates it. **Scan picture (OCR)** reads text inside images, videos and PDFs (Android 11+). Works from any app via Android's Accessibility button/shortcut.
- **AI chat anywhere.** Type or speak; tap **Insert** to drop the answer into the box you were in.
- **Hinglish by default.** Hindi toggle OFF = always Roman Hinglish ("kal meeting hai"). ON = Devanagari.
- **Your own free Groq key.** Stored with Android Keystore (AES-256-GCM). No Wispr server, no account, no tracking.

| Use | Model | Notes |
| --- | --- | --- |
| Speech | `whisper-large-v3` (default), `whisper-large-v3-turbo` | 20 req/min, 2,000/day, 8 h audio/day |
| Polish / translate / chat | `openai/gpt-oss-120b` (default), `openai/gpt-oss-20b` | 30 req/min, 1,000/day |
| Chat + screen OCR (vision) | `qwen/qwen3.8-27b`, `qwen/qwen3.6-27b` | Preview |
| Chat with live web search | `groq/compound`, `groq/compound-mini` | 250/day |

"Check what's live on Groq" in the mini window's **Models** tab lists every model your key can use, including new ones. Add a model permanently with one line in `Models.kt`.

## Requirements

- Android **8.0 (API 26)** or newer. OCR screen scan needs Android 11+.
- Build: AGP 9.4.0, Gradle 9.6.0, JDK 21, compileSdk/targetSdk **37**, Kotlin 2.4.10 (built into AGP 9).

## Build and release (GitHub Actions)

1. **Signing key, once** (required for releases, so phones can update in place):
   ```
   keytool -genkeypair -v -keystore wispr.jks -alias wispr -keyalg RSA -keysize 4096 -validity 10000
   base64 -w0 wispr.jks > wispr.jks.b64
   ```
   In GitHub: **Settings → Secrets and variables → Actions** add `WISPR_KEYSTORE_BASE64` (contents of `wispr.jks.b64`), `WISPR_KEYSTORE_PASSWORD`, `WISPR_KEY_ALIAS` (`wispr`), `WISPR_KEY_PASSWORD`. Back up `wispr.jks` safely: lose it and nobody can update again.
2. **Release**: bump `wispr.version` in `gradle.properties`, write `RELEASE_NOTES.md`, then `git tag v4.1.0 && git push origin v4.1.0`. The signed APK + `SHA256SUMS.txt` land on the **Releases** page. Tags with a dash (`v4.2.0-beta.1`) become pre-releases.
3. Test build without releasing: **Actions → Build APK and publish release → Run workflow** (APK under *Artifacts*).

## PC app (Windows, macOS, Linux)

Same Wispr, on your computer. Press a shortcut in any app, speak, press it again: your words are typed where your cursor is. It only adds text, never deletes. Same screens, prompts and Groq key logic as the phone app (the PC app builds its screens from the Android HTML).

- **Download**: the latest Releases page, next to the APK (Windows `.exe` installer or portable, macOS `.dmg`, Linux `.AppImage` / `.deb`).
- **Shortcuts** (change in Settings): dictate `Ctrl+Shift+Space` (`⌘+Shift+Space` on Mac), mini window `Ctrl+Shift+W`. Esc cancels. Wispr lives in the tray.
- **Permissions**: microphone everywhere. macOS also needs *Accessibility* (to paste) and *Screen Recording* (Understand screen). Linux: pasting works on X11; on Wayland the text is copied and you press Ctrl+V.
- **First run**: unsigned builds. Windows SmartScreen: *More info → Run anyway*. macOS: right-click → *Open*.
- **Build from source**: `cd desktop && npm install && npm start` (Node 24). Tests: `npm test`. Installers: `npm run dist`.
- **Release**: push the `v4.1.4` tag for the APK, then `git tag desktop-v4.1.4 && git push origin desktop-v4.1.4` adds the PC installers to that same release.

## In-app updates

Every installed Wispr checks this repo's latest GitHub Release (app open: every 6 h, keyboard bubble: every 12 h, with ETag caching and a fallback when GitHub's 60 requests/hour limit is hit). When a newer tag is out:

- The app shows an **update card** with the release notes and **Update now**; outside the app a notification appears.
- **Auto** (default): it downloads on Wi-Fi, checks the SHA-256 and that the APK is the same app signed with the same key, then one tap installs it. On Android 12+ it installs without the extra Android prompt; Android 8 to 11 show the normal "Update" dialog. Settings and the Groq key stay.
- First time only, Android asks to allow **Install unknown apps** for Wispr.
- If an APK is signed with a different key (for example an old debug-signed build), Wispr says so and opens the GitHub page: uninstall once, install the new APK, and from then on updates work in-app.
- The repo is baked in from `github.repository` at build time, so forks check their own Releases. Local builds: set `wispr.repo=owner/name` in `gradle.properties`.
- **Google Play build**: set `wispr.selfUpdate=false` and remove `REQUEST_INSTALL_PACKAGES` and `UPDATE_PACKAGES_WITHOUT_USER_ACTION` from the manifest (Play doesn't allow self-updating apps).
- Android developer verification: as of 30 Sep 2026 it's enforced only for 7 app stores in Brazil, Indonesia, Singapore and Thailand; direct GitHub APKs aren't covered yet. Google plans a global rollout in 2027, so register the package in the Android Developer Console before then.

## Code map

| File | What it does |
| --- | --- |
| `BubbleService.kt` | Accessibility service: bubble, gestures, recording, Accessibility button |
| `BubbleView.kt` | Orange orb + ✕ / waveform / ✓ pill (Canvas) |
| `Inserter.kt` | Safe typing into other apps (paste only, never overwrites) |
| `Panel.kt` + `assets/web/panel.html` | Floating mini window |
| `Assistant.kt` | AI chat, Understand screen, voice-to-chat |
| `ScreenReader.kt` | On-screen text + screenshot for OCR |
| `Engine.kt` | Dictation pipeline: record → Whisper → Hinglish / Polish / Translate, auto-retry |
| `Groq.kt`, `Models.kt`, `Prompts.kt` | Groq API client, model catalog, prompts |
| `Store.kt`, `Crypto.kt` | Encrypted settings + history |
| `Translit.java` | Offline Hindi → Hinglish fallback |
| `Updater.kt`, `UpdateReceiver.kt` | In-app updates from GitHub Releases: check, download, verify, install |

## Privacy

- Update checks only ask GitHub for this repo's latest release (no personal data, no key). Turn them off in Settings → Updates.

Audio, and screen text when **you** tap Understand, go only to Groq over HTTPS, using your key. Wispr never reads what you type, and it never sends your data on its own.

## License

Copyright 2026 Deepu Gupta. Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE).
Forks are welcome under the licence. Please use your own app name and icon (Apache 2.0 §6 does not grant trademark rights).
