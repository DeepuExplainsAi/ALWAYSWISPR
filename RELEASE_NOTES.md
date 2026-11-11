## Wispr v4.1.8

**Fixed**
- **Hindi turned into English** (Polish mode, "I speak: English"): English is no longer forced on the speech model, so what you say is what gets written. Phone and PC.
- **Shortcut and orb on PC**: the typed text now goes into the app you were using even if the orb click moved the focus; a second paste method is used if the first fails.
- **Models stay in sync with Groq**: the app asks Groq which models are live, hides or replaces removed ones and shows new ones by itself. Phone and PC.

**New**
- **PC: update bar at the top of the app** with *Update now* / *Later*. The update downloads inside Wispr, is checked against its checksum, and Wispr restarts into the new version. Windows, Linux (AppImage) and macOS.
- **PC: move the orb anywhere** (drag it up, down or sideways); it remembers the place. Tray → *Reset orb position* puts it back.
- Latest toolchain: Android SDK 37, AGP 9.5.1, Gradle 9.9.1, Kotlin 2.4.21, Electron 45.3. Android 8.0+ still supported.
