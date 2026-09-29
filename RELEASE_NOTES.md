## Wispr by Deepu Gupta v3.0.0

Speak in Hinglish, Hindi, English or 23 more languages. Wispr types it for you, in any app.

**New in v3**
- **Hinglish that actually works.** Talk in Hindi, get Roman letters: "kal meeting hai". Hindi script toggle off = Hinglish, always. On = Devanagari. Hinglish is also a Translate target.
- **Fixed: Polish, Hinglish and Translate silently failing.** Groq shut down the Llama 3.x models in Aug 2026; Wispr now uses GPT-OSS 120B with automatic fallback to other live models.
- **Fixed: Groq key rejected.** Keys copied with spaces, quotes or hidden characters are cleaned up, and Groq's real error is shown.
- **Fixed: text not pasted after ✓.** Wispr Flow-style insertion into the box you tapped, with 3 retries and a Paste fallback. Works with any keyboard.
- **New bubble.** Glowing orange orb; tap it and it opens into ✕ | live waveform | ✓. No more popping animation.
- Updated for Android 16, AGP 9.4, Gradle 9.6, Kotlin 2.4. Fixed the GitHub build workflow.

**Install**
1. Download the `.apk` below and open it. Allow "Install unknown apps" if asked.
2. Open Wispr, paste your free Groq key (console.groq.com/keys), tap Verify.
3. Tap **Allow** on each permission. For the bubble, if Android says *Restricted setting*: App info → ⋮ → **Allow restricted settings**, then turn on **Wispr bubble** in Accessibility.

Updating from v2? Install over it; your key and history stay. Same signing key required.

---
© 2026 Deepu Gupta. All rights reserved. Wispr by Deepu Gupta is proprietary software. Copying, re-branding or re-uploading it is not allowed.
