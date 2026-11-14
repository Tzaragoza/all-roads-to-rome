# Your own music

Drop **one** audio file in this folder (`theme.ogg`, `theme.mp3` or `theme.m4a`; any name works, the first file
alphabetically is used) and rebuild. The game then loops your track instead of the generated music.
Delete the file to go back to the generated music.

Guidelines:
- A seamless loop of 1–3 minutes. Start and end on the same chord, with no silence at either end, or the loop clicks.
- Keep it quiet and calm: it plays under the sound effects for the whole 3–5 minute game. Normalise to about −18 LUFS.
- OGG Vorbis at 96–128 kbps, mono or stereo, under ~2 MB (it ships inside the post's bundle).
- Volume in game: `FILE_VOL` in `../music.ts`.

Free tools: BeepBox or JummBox (browser, chiptune-ish), Bosca Ceoil (simple, loop-friendly), LMMS or
MuseScore (full), Audacity (trim the loop and export OGG).
