// ── DCMS .hpp parser ───────────────────────────────────────────────────
//
// Reads a generated `.hpp` file back into PlaybackData so the audio player can
// play a sheet directly, without going through MIDI conversion. Handles both
// export modes: raw numbers and human-readable `#define` names (resolved
// against a symbol table that mirrors base.h).

import type { PlaybackData, PlaybackRow, PlaybackVoice } from "./midi-to-dcms";

// ── Symbol table (mirror of base.h) ────────────────────────────────────

const DURATIONS: [string, number][] = [
  ["WHOLE_NOTE", 50],
  ["HALF_NOTE", 51],
  ["QUARTER_NOTE", 52],
  ["EIGHTH_NOTE", 53],
  ["SIXTEENTH_NOTE", 54],
  ["THIRTY_SECOND_NOTE", 55],
  ["SIXTY_FOURTH_NOTE", 56],
  ["WHOLE_NOTE_DOTTED", 57],
  ["HALF_NOTE_DOTTED", 58],
  ["QUARTER_NOTE_DOTTED", 59],
  ["EIGHTH_NOTE_DOTTED", 60],
  ["SIXTEENTH_NOTE_DOTTED", 61],
  ["THIRTY_SECOND_NOTE_DOTTED", 62],
  ["SIXTY_FOURTH_NOTE_DOTTED", 63],
];

// Base note name → pitch value (includes enharmonic flats, matching base.h).
const NOTES: [string, number][] = [
  ["NOTE_A", 101],
  ["NOTE_As", 102],
  ["NOTE_Bb", 102],
  ["NOTE_B", 103],
  ["NOTE_C", 104],
  ["NOTE_Cs", 105],
  ["NOTE_Db", 105],
  ["NOTE_D", 106],
  ["NOTE_Ds", 107],
  ["NOTE_Eb", 107],
  ["NOTE_E", 108],
  ["NOTE_F", 109],
  ["NOTE_Fs", 110],
  ["NOTE_Gb", 110],
  ["NOTE_G", 111],
  ["NOTE_Gs", 112],
  ["NOTE_Ab", 112],
];

const SINGLE: Record<string, number> = {
  MUSIC_END: 0,
  MUSIC_BPM: 21,
  MUSIC_BEATS: 22,
  REPEAT_START: 30,
  REPEAT_END: 31,
  REPEAT_ENDING: 32,
  TIE: 40,
  SLUR: 41,
  REST_NOTE: 70,
};

// Each symbol expands to one or more numeric DCMS values.
const SYMBOLS: Record<string, number[]> = {};
for (const [key, value] of Object.entries(SINGLE)) SYMBOLS[key] = [value];
for (const [key, value] of DURATIONS) {
  SYMBOLS[key] = [value];
  SYMBOLS[`${key}_TIE`] = [value, 40];
  SYMBOLS[`${key}_SLUR`] = [value, 41];
  SYMBOLS[key.replace("_NOTE", "_REST")] = [70, value]; // WHOLE_REST, HALF_REST_DOTTED, ...
}
for (const [key, value] of NOTES) {
  SYMBOLS[key] = [value];
  for (let octave = 1; octave <= 7; octave++) {
    SYMBOLS[`${key}${octave}`] = [value, octave]; // NOTE_C4 → NOTE_C, 4
  }
}

function resolveToken(token: string): number[] | null {
  if (/^-?\d+$/.test(token)) return [parseInt(token, 10)];
  return SYMBOLS[token] ?? null;
}

// Parse one array row's content ("NOTE_C4, QUARTER_NOTE" or "104, 4, 52") into
// its flat numeric values. Unresolvable tokens are skipped.
function parseRowValues(content: string): number[] {
  const values: number[] = [];
  for (const raw of content.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const resolved = resolveToken(token);
    if (resolved) values.push(...resolved);
  }
  return values;
}

function rowType(values: number[]): PlaybackRow["type"] {
  const first = values[0];
  if (first === 0) return "end";
  if (first === 21 || first === 22) return "meta";
  if (first === 30) return "repeat_start";
  if (first === 31) return "repeat_end";
  if (first === 32) return "repeat_ending";
  if (first === 70) return "rest";
  if (first >= 101 && first <= 112) return "note";
  return "meta";
}

// Voice data arrays look like `static const uint8_t NAME[] PROGMEM = {`.
// The trailing voice-pointer array is `const uint8_t* const NAME[]` — excluded
// by requiring `static` and forbidding `*`.
const VOICE_START = /\bstatic\s+const\s+uint8_t\s+(\w+)\s*\[\s*\]/;

export function parseHppToPlayback(text: string): PlaybackData {
  const lines = text.split("\n");
  const voices: PlaybackVoice[] = [];
  let bpm = 120;
  let beats = 4;

  let current: PlaybackVoice | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\/\/.*$/, "").trim(); // strip line comments

    if (current === null) {
      const match = line.match(VOICE_START);
      if (match && !line.includes("*")) {
        current = { name: match[1], rows: [] };
      }
      continue;
    }

    // Inside a voice data array.
    if (line.includes("}")) {
      voices.push(current);
      current = null;
      continue;
    }

    const content = line.replace(/[{}]/g, "").replace(/,\s*$/, "").trim();
    if (!content) continue;

    const values = parseRowValues(content);
    if (values.length === 0) continue;

    const type = rowType(values);
    if (type === "meta") {
      if (values[0] === 21) bpm = values[1] ?? bpm;
      else if (values[0] === 22) beats = values[1] ?? beats;
    }

    current.rows.push({ line: i, type, values });
  }

  return { voices, bpm, beats };
}
