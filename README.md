# WLDC Music Sheet Converter

Web app that converts MIDI files to the DCMS (Digital Clock Music Sheet) format — a compact binary representation used by Arduino/AVR projects with `PROGMEM`.

## Features

- Upload MIDI files via drag & drop or file picker
- Automatic track/voice detection with selection
- Export as `.hpp` with human-readable `#define` names or raw numbers
- Repeat detection and compression (`REPEAT_START`, `REPEAT_END`, `REPEAT_ENDING`)
- Real-time output preview with PROGMEM byte count per voice
- Copy to clipboard or download as `.hpp`

## DCMS Format

The output targets the `base.h` header, encoding notes, durations, rests, ties, and repeats as `uint8_t` arrays stored in `PROGMEM`. See [base.h](base.h) for the full constant reference.

## Development

```bash
yarn install
yarn dev
```

## Build

```bash
yarn build
```

## Stack

React, TypeScript, Vite, Tailwind CSS, Radix UI, midi-json-parser
