# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A client-side (no backend) React web app that converts MIDI files into the **DCMS** (Digital Clock Music Sheet) format — `uint8_t[]` arrays stored in `PROGMEM` for Arduino/AVR projects. All parsing and conversion happens in the browser; the output is a `.hpp` header file.

## Commands

```bash
yarn dev       # Vite dev server
yarn build     # tsc -b (typecheck) + vite build
yarn lint      # eslint .
yarn preview   # serve the production build
```

No test suite exists. `yarn build` is the correctness gate (typecheck must pass). Vite is aliased to `rolldown-vite` (see `resolutions` in package.json). `@` resolves to `src/`. Node version is pinned in `.nvmrc`.

## Architecture

The entire conversion pipeline lives in [src/lib/midi-to-dcms.ts](src/lib/midi-to-dcms.ts) — this is the heart of the app and where most non-trivial work happens. Data flows:

1. **UI** ([src/view/Home.tsx](src/view/Home.tsx)) — single-page app. Parses the uploaded file with `midi-json-parser` into an `IMidiFile`, then drives the worker. Two screens: upload dropzone → editor (track selection + live preview). Conversion is debounced (150ms) and re-runs on any input change.
2. **Worker boundary** ([src/lib/midi-converter.worker.ts](src/lib/midi-converter.worker.ts) + [src/lib/use-midi-converter.ts](src/lib/use-midi-converter.ts)) — analysis and conversion run off the main thread. The hook owns the `Worker` lifecycle and exposes `analyze()` / `convert()`. `WorkerRequest`/`WorkerResponse` are the message contract; keep them in sync with what the worker handles.
3. **Conversion core** (`midi-to-dcms.ts`) — pure functions, no React/DOM. `analyzeMidi()` extracts tracks/BPM/beats/division; `convertMidiToHpp()` produces the final `.hpp` string plus per-voice byte counts.

### The conversion pipeline (inside `convertMidiToHpp`)

Per selected track, in order:
- `extractNotes()` — walks delta-time events, pairs noteOn/noteOff into `NoteEvent`s with absolute ticks.
- `reduceToMonophonic()` — DCMS voices are monophonic; overlapping notes are reduced by keeping the **highest** pitch, truncating the lower one.
- `midiTicksToDcmsTicks()` — DCMS uses a fixed grid where **a quarter note = 16 DCMS ticks** (whole note = 64). This 16-tick-per-quarter constant is load-bearing throughout.
- `trackToDcmsTokens()` — emits `DcmsToken`s: notes, rests (for gaps), TIE-linked durations. `decomposeDuration()` breaks any duration into standard/dotted note values from `DURATION_TABLE`, chaining them with `TIE` when a single note spans multiple table entries. The header (`MUSIC_BPM`, `MUSIC_BEATS`) is emitted only on the first voice.
- `applyRepeatDetection()` (optional) — `compressRepeats()` splits the body into measures (`beats * 16` ticks each) and recursively finds **exact repeats** (`REPEAT_START`/`REPEAT_END`) and **near-repeats / volta brackets** (`REPEAT_ENDING`). Both candidates are scored by actual byte savings and the larger win is chosen. Recursion is bounded by `MAX_REPEAT_DEPTH`.

Every `DcmsToken` carries both `values` (numeric bytes) and `label` (human-readable `#define` name). The final serialization picks one based on the export mode ("With #defines" vs "Numbers only"). **Byte counts = sum of `values.length` across tokens** — each DCMS value is one `uint8_t`.

### The DCMS format

[base.h](base.h) is the canonical source of truth for every DCMS constant (note pitches 101–112, durations 50–63, `REST_NOTE` 70, `TIE`/`SLUR`, repeat markers, `MUSIC_END`). The `DCMS` / `DCMS_REPEAT` objects and `DURATION_TABLE` in `midi-to-dcms.ts` **mirror** these values — if you change one, change both. Notes are emitted as `<pitch>, <octave>`; dotted values = base + 7; ties/rests/slurs are macros that expand to two bytes.

## Conventions

- shadcn/ui (new-york style, zinc base) components live in [src/components/ui/](src/components/ui/); `cn()` from [src/lib/utils.ts](src/lib/utils.ts) merges Tailwind classes. Tailwind v4 (via `@tailwindcss/vite`, config-less, CSS variables in `src/index.css`).
- Routing is React Router with a single index route; `HomePage` is lazy-loaded. `basename`/`base` is `/wldc_music_sheet_converter/` (GitHub Pages subpath) — set in both [vite.config.ts](vite.config.ts) and [src/router.tsx](src/router.tsx).
- `@tanstack/react-query` is wired up in [src/providers/](src/providers/) but currently unused (no network calls).
- MIDI event objects are typed loosely (`as any`) because `midi-json-parser`'s event union is awkward to narrow — this is intentional in `analyzeMidi`/`extractNotes`.
