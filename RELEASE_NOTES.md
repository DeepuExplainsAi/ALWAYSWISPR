## Wispr v4.1.11

**Fixed**
- PC: if the microphone cannot start, the error shows at once (no stuck "Starting mic…"), and ✕ works while it starts.
- PC: dragging the orb no longer jumps or resizes it.
- Android: clearer message when a screen has no readable text.

## Wispr v4.1.10

**Fixed**
- **Google Pay / banking apps no longer block payments.** The Android accessibility service no longer asks for the screenshot permission or click events, which payment apps treat as a risk. "Understand screen" still reads on-screen text; picture scan (OCR) is off.
- **Mixed Hindi + English:** English sentences stay English (never turned into Hindi), Hindi stays Hindi, in Polish and Write modes on phone and PC.
- **PC: first words were missed.** The pill now shows "Starting mic…" and switches to recording only when the microphone is really open.
- **PC: ✓ and ✕ buttons did not click.** Dragging the orb no longer swallows button clicks.

## Wispr v4.1.9

**Fixed**
- **Mixed languages are written as you speak them.** Speak Hindi and switch to English in the middle: the Hindi part is written as Hindi, the English part as English (in Hinglish mode both in Roman letters, in Hindi mode Hindi in Devanagari and English in English letters). Before, the speech model was forced to the language you picked, so the other language got twisted into it. Phone and PC.
- **Dark mode: the language list was unreadable** (white text on a white list). Every drop-down now uses the dark colours.

(v4.1.8: models follow Groq, update bar + in-app update on PC, draggable orb, latest toolchain.)
