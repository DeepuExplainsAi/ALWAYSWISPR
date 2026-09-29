# Wispr by Deepu Gupta (Android)

© 2026 Deepu Gupta. All rights reserved. See `LICENSE`.

Voice typing for every app, built the way Wispr Flow works on Android: a glowing orange orb
appears whenever any keyboard opens. Tap it, speak, tap **✓** and your words are typed straight
into the box you tapped (and copied too). Speaks **Hinglish** properly: you talk Hindi, it writes
Roman letters ("kal meeting hai"). Uses your own Groq API key.

## Languages

- **Hinglish (Roman Hindi)**: the default. Always Roman letters, never Devanagari. Works with just
  a Groq key: Whisper hears Hindi, a Groq text model writes it in Roman letters, and a built-in
  offline converter makes sure no Devanagari ever slips through.
- **Hindi (Devanagari)**: turn on *Settings → Hindi script* (or pick हिन्दी in "I speak").
- **Hindi script toggle OFF** = Hinglish, always.
- **Auto detect**: any of the 26 languages, each in its own script (Hindi comes out as Hinglish
  unless the Hindi script toggle is on).
- **Translate** mode can also write *into* Hinglish.

## Put it on GitHub and get the APK (no Android Studio needed)

1. Create a new GitHub repo (can be public). Upload **everything in this folder**
   (including the hidden `.github` folder). Do **not** upload the signing key zip.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**, add these 4
   (values are in `SIGNING-KEY-PRIVATE/HOW-TO-ADD-SECRETS.txt`, which you got separately):
   - `WISPR_KEYSTORE_BASE64`
   - `WISPR_KEYSTORE_PASSWORD`
   - `WISPR_KEY_ALIAS`
   - `WISPR_KEY_PASSWORD`
3. Repo → **Releases → Draft a new release → Choose a tag** → type `v3.0.0` → Create tag → **Publish**.
   (Or on a computer: `git tag v3.0.0 && git push origin v3.0.0`.)
4. Open the **Actions** tab. In about 5 to 8 minutes the build finishes and
   `Wispr-by-Deepu-Gupta-v3.0.0.apk` appears on that Release page.
5. For updates: change code, push a new tag (`v3.0.1`, `v3.1.0`...). Always keep the SAME
   signing key, or phones won't accept the update.

Build fails? Open the failed run in **Actions**, copy the red error lines and share them.

## Permissions the app asks for (and why)

| Permission | Why |
|---|---|
| Microphone | To hear you |
| Accessibility ("Wispr bubble") | To show the bubble when a keyboard opens and type the text into the box. It does not read or save what you type. |
| Notifications | "Listening" indicator + failure alert with a Retry button |
| Ignore battery optimisation | So the phone doesn't kill the bubble |

Android 13+ blocks Accessibility for apps installed from outside the Play Store until you
allow it: **App info → ⋮ (top right) → Allow restricted settings**. The app shows this tip too.
On Xiaomi / Redmi / POCO also turn on **Autostart**.

## Security

- Groq key, settings and history are encrypted with **AES-256-GCM** using a key locked inside
  the **Android Keystore** (it can't be copied out of the phone).
- The app screen (WebView) never gets the key. All Groq calls happen in native code.
- HTTPS only; user-installed certificates are not trusted (blocks MITM sniffing).
- Content-Security-Policy blocks all network access from the web layer.
- Backups and device-transfer are disabled. Recordings are stored encrypted until they succeed, then deleted.
- No Wispr server, no analytics, no tracking. Each person uses their own Groq key.

## Reliability

- Every network step auto-retries 5 times with back-off and waits for internet to return.
- If polishing fails, you still get the plain transcript (nothing is lost).
- If everything fails, the encrypted audio stays saved: tap **Retry** on the orange bubble,
  on the notification, or on the item in the app's Recent list.
- Long dictation is fine: up to 15 minutes per recording.

## Bubble controls

- Tap the orb: it opens into a pill **[ ✕ | live waveform | ✓ ]**. ✓ = type it in, ✕ = cancel.
- Hold the orb = talk while holding, let go to type (slide onto ✕ before letting go to cancel).
- Orb spins an orange ring while writing. A small badge means: ↻ failed (tap to retry) or
  paste (couldn't type automatically; tap the text box, then the orb, or long-press and paste).
- Text is inserted the Flow way: into the field you tapped, retried 3 times, then copied as a fallback.
- Drag it anywhere; it snaps to the nearest edge and remembers the spot.
- Hidden in password, number and phone fields, and inside Wispr itself.

## Ownership

"Wispr by Deepu Gupta" and the copyright notice are embedded in the app code, manifest, app
resources, `assets/NOTICE.txt`, the About screen and the APK signing certificate
(CN=Deepu Gupta). Anyone who unzips the APK or this source will see it.

## Build setup (latest as of Sep 2026)

Android Gradle Plugin 9.4.1 (built-in Kotlin, Kotlin 2.4.10) · Gradle 9.6.0 · JDK 21 on CI ·
compileSdk / targetSdk 36 · minSdk 26 (Android 8) · OkHttp 5.5.0 · AndroidX WebKit 1.17.1.
Groq models: whisper-large-v3-turbo (speech) and openai/gpt-oss-120b (text). The old Llama 3.x
models were shut down by Groq on 16 Aug 2026; old installs are moved over automatically.

## Local build (optional)

Android Studio (latest) → Open this folder → Build → Build APK(s).
