import type { IMidiFile } from "midi-json-parser-worker";

// ── DCMS Constants (mirror of base.h) ──────────────────────────────────

const DCMS = {
  MUSIC_END: 0,
  MUSIC_BPM: 21,
  MUSIC_BEATS: 22,
  REST_NOTE: 70,
  TIE: 40,
  SLUR: 41,

  // Duration base values
  WHOLE_NOTE: 50,
  HALF_NOTE: 51,
  QUARTER_NOTE: 52,
  EIGHTH_NOTE: 53,
  SIXTEENTH_NOTE: 54,
  THIRTY_SECOND_NOTE: 55,
  SIXTY_FOURTH_NOTE: 56,

  // Dotted = base + 7
  WHOLE_NOTE_DOTTED: 57,
  HALF_NOTE_DOTTED: 58,
  QUARTER_NOTE_DOTTED: 59,
  EIGHTH_NOTE_DOTTED: 60,
  SIXTEENTH_NOTE_DOTTED: 61,
  THIRTY_SECOND_NOTE_DOTTED: 62,
  SIXTY_FOURTH_NOTE_DOTTED: 63,

  // Note pitch values (A=101 .. G#=112)
  NOTE_A: 101,
  NOTE_As: 102,
  NOTE_B: 103,
  NOTE_C: 104,
  NOTE_Cs: 105,
  NOTE_D: 106,
  NOTE_Ds: 107,
  NOTE_E: 108,
  NOTE_F: 109,
  NOTE_Fs: 110,
  NOTE_G: 111,
  NOTE_Gs: 112,
} as const;

// MIDI semitone (noteNumber % 12) → DCMS pitch value
const MIDI_SEMITONE_TO_DCMS: number[] = [
  DCMS.NOTE_C,  // 0
  DCMS.NOTE_Cs, // 1
  DCMS.NOTE_D,  // 2
  DCMS.NOTE_Ds, // 3
  DCMS.NOTE_E,  // 4
  DCMS.NOTE_F,  // 5
  DCMS.NOTE_Fs, // 6
  DCMS.NOTE_G,  // 7
  DCMS.NOTE_Gs, // 8
  DCMS.NOTE_A,  // 9
  DCMS.NOTE_As, // 10
  DCMS.NOTE_B,  // 11
];

// MIDI semitone → note name for human-readable output
const MIDI_SEMITONE_TO_NAME: string[] = [
  "C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B",
];

// Duration in DCMS ticks → [define_value, is_dotted]
interface DurationEntry {
  ticks: number;
  value: number;
  name: string;
  restName: string;
}

const DURATION_TABLE: DurationEntry[] = [
  // Sorted by ticks descending — standard before dotted at comparable sizes
  { ticks: 96, value: DCMS.WHOLE_NOTE_DOTTED, name: "WHOLE_NOTE_DOTTED", restName: "WHOLE_REST_DOTTED" },
  { ticks: 64, value: DCMS.WHOLE_NOTE, name: "WHOLE_NOTE", restName: "WHOLE_REST" },
  { ticks: 48, value: DCMS.HALF_NOTE_DOTTED, name: "HALF_NOTE_DOTTED", restName: "HALF_REST_DOTTED" },
  { ticks: 32, value: DCMS.HALF_NOTE, name: "HALF_NOTE", restName: "HALF_REST" },
  { ticks: 24, value: DCMS.QUARTER_NOTE_DOTTED, name: "QUARTER_NOTE_DOTTED", restName: "QUARTER_REST_DOTTED" },
  { ticks: 16, value: DCMS.QUARTER_NOTE, name: "QUARTER_NOTE", restName: "QUARTER_REST" },
  { ticks: 12, value: DCMS.EIGHTH_NOTE_DOTTED, name: "EIGHTH_NOTE_DOTTED", restName: "EIGHTH_REST_DOTTED" },
  { ticks: 8, value: DCMS.EIGHTH_NOTE, name: "EIGHTH_NOTE", restName: "EIGHTH_REST" },
  { ticks: 6, value: DCMS.SIXTEENTH_NOTE_DOTTED, name: "SIXTEENTH_NOTE_DOTTED", restName: "SIXTEENTH_REST_DOTTED" },
  { ticks: 4, value: DCMS.SIXTEENTH_NOTE, name: "SIXTEENTH_NOTE", restName: "SIXTEENTH_REST" },
  { ticks: 3, value: DCMS.THIRTY_SECOND_NOTE_DOTTED, name: "THIRTY_SECOND_NOTE_DOTTED", restName: "THIRTY_SECOND_REST_DOTTED" },
  { ticks: 2, value: DCMS.THIRTY_SECOND_NOTE, name: "THIRTY_SECOND_NOTE", restName: "THIRTY_SECOND_REST" },
  { ticks: 1, value: DCMS.SIXTY_FOURTH_NOTE, name: "SIXTY_FOURTH_NOTE", restName: "SIXTY_FOURTH_REST" },
];

// ── Types ──────────────────────────────────────────────────────────────

export interface MidiTrackInfo {
  index: number;
  name: string;
  noteCount: number;
  channel: number | null;
}

interface NoteEvent {
  noteNumber: number;
  startTick: number;
  durationTicks: number;
}

const DCMS_REPEAT = {
  REPEAT_START: 30,
  REPEAT_END: 31,
  REPEAT_ENDING: 32,
} as const;

interface DcmsToken {
  type: "note" | "rest" | "meta" | "repeat_start" | "repeat_end" | "repeat_ending" | "separator" | "end";
  values: number[];    // numeric DCMS values
  label: string;       // human-readable define string
  indent?: number;     // nesting level for formatting
}

// ── MIDI Analysis ──────────────────────────────────────────────────────

export function analyzeMidi(midi: IMidiFile): {
  tracks: MidiTrackInfo[];
  bpm: number;
  beats: number;
  division: number;
} {
  let bpm = 120;
  let beats = 4;

  const tracks: MidiTrackInfo[] = [];

  for (let i = 0; i < midi.tracks.length; i++) {
    const track = midi.tracks[i];
    let name = `Track ${i + 1}`;
    let noteCount = 0;
    let channel: number | null = null;

    for (const event of track) {
      const ev = event as any;
      if (ev.trackName) {
        name = ev.trackName;
      }
      if (ev.setTempo) {
        bpm = Math.round(60_000_000 / ev.setTempo.microsecondsPerQuarter);
      }
      if (ev.timeSignature) {
        beats = ev.timeSignature.numerator;
      }
      if (ev.noteOn && ev.noteOn.velocity > 0) {
        noteCount++;
        if (channel === null) channel = ev.channel;
      }
    }

    if (noteCount > 0) {
      tracks.push({ index: i, name, noteCount, channel });
    }
  }

  return { tracks, bpm, beats, division: midi.division };
}

// ── MIDI → Note Events ─────────────────────────────────────────────────

function extractNotes(track: IMidiFile["tracks"][number]): NoteEvent[] {
  const notes: NoteEvent[] = [];
  const activeNotes = new Map<number, number>(); // noteNumber → startTick
  let absoluteTick = 0;

  for (const event of track) {
    const ev = event as any;
    absoluteTick += ev.delta;

    if (ev.noteOn) {
      if (ev.noteOn.velocity > 0) {
        activeNotes.set(ev.noteOn.noteNumber, absoluteTick);
      } else {
        // velocity 0 = note off
        const start = activeNotes.get(ev.noteOn.noteNumber);
        if (start !== undefined) {
          notes.push({
            noteNumber: ev.noteOn.noteNumber,
            startTick: start,
            durationTicks: absoluteTick - start,
          });
          activeNotes.delete(ev.noteOn.noteNumber);
        }
      }
    }

    if (ev.noteOff) {
      const start = activeNotes.get(ev.noteOff.noteNumber);
      if (start !== undefined) {
        notes.push({
          noteNumber: ev.noteOff.noteNumber,
          startTick: start,
          durationTicks: absoluteTick - start,
        });
        activeNotes.delete(ev.noteOff.noteNumber);
      }
    }
  }

  // Close any remaining active notes
  for (const [noteNumber, start] of activeNotes) {
    notes.push({
      noteNumber,
      startTick: start,
      durationTicks: absoluteTick - start,
    });
  }

  notes.sort((a, b) => a.startTick - b.startTick || b.noteNumber - a.noteNumber);
  return notes;
}

// ── Monophonic reduction (keep highest note at each time) ──────────────

function reduceToMonophonic(notes: NoteEvent[]): NoteEvent[] {
  if (notes.length === 0) return [];

  const result: NoteEvent[] = [];

  // Sort by start time, then highest note first
  const sorted = [...notes].sort(
    (a, b) => a.startTick - b.startTick || b.noteNumber - a.noteNumber,
  );

  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentEnd = current.startTick + current.durationTicks;

    if (next.startTick >= currentEnd) {
      // No overlap — emit current, move on
      result.push(current);
      current = next;
    } else if (next.noteNumber > current.noteNumber) {
      // Higher note overlaps — truncate current, start new
      if (next.startTick > current.startTick) {
        result.push({
          ...current,
          durationTicks: next.startTick - current.startTick,
        });
      }
      current = next;
    }
    // else: lower/equal overlapping note → skip
  }

  result.push(current);
  return result;
}

// ── Tick conversion ────────────────────────────────────────────────────

function midiTicksToDcmsTicks(midiTicks: number, division: number): number {
  // division = MIDI ticks per quarter note
  // quarter note = 16 DCMS ticks
  return Math.round((midiTicks * 16) / division);
}

// ── Duration decomposition using TIE ───────────────────────────────────

function decomposeDuration(dcmsTicks: number): DurationEntry[] {
  const parts: DurationEntry[] = [];
  let remaining = dcmsTicks;

  for (const entry of DURATION_TABLE) {
    const count = Math.floor(remaining / entry.ticks);
    for (let i = 0; i < count; i++) {
      parts.push(entry);
    }
    remaining -= count * entry.ticks;
    if (remaining <= 0) break;
  }

  return parts;
}

// ── Note number to DCMS ────────────────────────────────────────────────

function midiNoteToDcms(noteNumber: number): { pitchValue: number; octave: number; name: string } {
  const semitone = noteNumber % 12;
  const octave = Math.floor(noteNumber / 12) - 1;
  const clampedOctave = Math.max(1, Math.min(7, octave));

  return {
    pitchValue: MIDI_SEMITONE_TO_DCMS[semitone],
    octave: clampedOctave,
    name: `NOTE_${MIDI_SEMITONE_TO_NAME[semitone]}${clampedOctave}`,
  };
}

// ── Convert a track to DCMS tokens ─────────────────────────────────────

function trackToDcmsTokens(
  notes: NoteEvent[],
  division: number,
  bpm: number,
  beats: number,
  includeHeader: boolean,
): DcmsToken[] {
  const tokens: DcmsToken[] = [];

  // Header (only on first voice)
  if (includeHeader) {
    tokens.push({ type: "meta", values: [DCMS.MUSIC_BPM, bpm], label: `MUSIC_BPM,    ${bpm}` });
    tokens.push({ type: "meta", values: [DCMS.MUSIC_BEATS, beats], label: `MUSIC_BEATS,  ${beats}` });
  }

  let currentTick = 0;
  const measureTicks = 64; // 1 whole note in DCMS ticks
  let measureAccum = 0;

  const emitToken = (token: DcmsToken, ticks: number) => {
    tokens.push(token);
    measureAccum += ticks;
    if (measureAccum >= measureTicks) {
      measureAccum -= measureTicks;
      tokens.push({ type: "separator", values: [], label: "" });
    }
  };

  for (const note of notes) {
    const startDcms = midiTicksToDcmsTicks(note.startTick, division);
    const durationDcms = Math.max(1, midiTicksToDcmsTicks(note.durationTicks, division));

    // Insert rest if there's a gap
    const gap = startDcms - currentTick;
    if (gap > 0) {
      const restParts = decomposeDuration(gap);
      for (const part of restParts) {
        emitToken({
          type: "rest",
          values: [DCMS.REST_NOTE, part.value],
          label: part.restName,
        }, part.ticks);
      }
    }

    // Insert note with duration (potentially tied)
    const { pitchValue, octave, name: noteName } = midiNoteToDcms(note.noteNumber);
    const durationParts = decomposeDuration(durationDcms);

    for (let i = 0; i < durationParts.length; i++) {
      const part = durationParts[i];
      const isLast = i === durationParts.length - 1;
      const needsTie = !isLast;

      if (needsTie) {
        emitToken({
          type: "note",
          values: [pitchValue, octave, part.value, DCMS.TIE],
          label: `${noteName},  ${part.name}_TIE`,
        }, part.ticks);
      } else {
        emitToken({
          type: "note",
          values: [pitchValue, octave, part.value],
          label: `${noteName},  ${part.name}`,
        }, part.ticks);
      }
    }

    currentTick = startDcms + durationDcms;
  }

  // End marker
  tokens.push({ type: "end", values: [DCMS.MUSIC_END], label: "MUSIC_END" });

  return tokens;
}

// ── Repeat detection ───────────────────────────────────────────────────

function getDurationTicks(durationValue: number): number {
  const standard = [64, 32, 16, 8, 4, 2, 1]; // WHOLE..SIXTY_FOURTH (50..56)
  if (durationValue >= 50 && durationValue <= 56) return standard[durationValue - 50];
  if (durationValue >= 57 && durationValue <= 63) return standard[durationValue - 57] * 1.5;
  return 0;
}

function getTokenDurationTicks(token: DcmsToken): number {
  if (token.type === "note") {
    // values: [pitch, octave, duration, ?tie]
    return getDurationTicks(token.values[2]);
  } else if (token.type === "rest") {
    // values: [REST_NOTE, duration]
    return getDurationTicks(token.values[1]);
  }
  return 0;
}

function tokensFingerprint(tokens: DcmsToken[]): string {
  return tokens.map((t) => t.values.join(",")).join("|");
}

function splitIntoMeasures(body: DcmsToken[], measureTicks: number): DcmsToken[][] {
  const measures: DcmsToken[][] = [];
  let current: DcmsToken[] = [];
  let accum = 0;

  for (const token of body) {
    current.push(token);
    accum += getTokenDurationTicks(token);

    if (accum >= measureTicks) {
      measures.push(current);
      current = [];
      accum = 0;
    }
  }

  // Remaining tokens (incomplete last measure)
  if (current.length > 0) {
    measures.push(current);
  }

  return measures;
}

function applyRepeatDetection(tokens: DcmsToken[], beats: number): DcmsToken[] {
  const header: DcmsToken[] = [];
  const body: DcmsToken[] = [];
  let end: DcmsToken | null = null;

  for (const t of tokens) {
    if (t.type === "meta") header.push(t);
    else if (t.type === "end") end = t;
    else if (t.type !== "separator") body.push(t);
  }

  const measureTicks = beats * 16;
  const compressed = compressRepeats(body, measureTicks, 0);

  const result = [...header, ...compressed];
  if (end) result.push(end);
  return result;
}

const MAX_REPEAT_DEPTH = 10;

// ── Helpers ───────────────────────────────────────────────────────────

function measureTokenBytes(measures: DcmsToken[][], start: number, count: number): number {
  let bytes = 0;
  for (let m = start; m < start + count && m < measures.length; m++) {
    for (const t of measures[m]) bytes += t.values.length;
  }
  return bytes;
}

function flattenMeasures(measures: DcmsToken[][], start: number, count: number): DcmsToken[] {
  const tokens: DcmsToken[] = [];
  for (let m = start; m < start + count && m < measures.length; m++) {
    for (const t of measures[m]) tokens.push(t);
  }
  return tokens;
}

// ── Exact repeat detection ────────────────────────────────────────────

interface ExactRepeatMatch {
  patternLen: number;
  count: number;
  saving: number;
}

function findBestExactRepeat(
  measures: DcmsToken[][],
  startIdx: number,
  measureFps: string[],
): ExactRepeatMatch | null {
  const remaining = measures.length - startIdx;
  let best: ExactRepeatMatch | null = null;

  for (let patLen = Math.floor(remaining / 2); patLen >= 1; patLen--) {
    let count = 1;

    while (startIdx + (count + 1) * patLen <= measures.length) {
      let matches = true;
      for (let m = 0; m < patLen; m++) {
        if (measureFps[startIdx + m] !== measureFps[startIdx + count * patLen + m]) {
          matches = false;
          break;
        }
      }
      if (matches) count++;
      else break;
    }

    if (count >= 2) {
      const patternBytes = measureTokenBytes(measures, startIdx, patLen);
      const saving = (count - 1) * patternBytes - 3; // REPEAT_START(2) + REPEAT_END(1)

      if (saving > 0 && (!best || saving > best.saving)) {
        best = { patternLen: patLen, count, saving };
      }
    }
  }

  return best;
}

// ── Near-repeat detection (REPEAT_ENDING / volta brackets) ────────────

interface EndingGroup {
  iterations: number[];    // 1-indexed iteration numbers
  startMeasureIdx: number; // index into the measures array for this ending's content
}

interface NearRepeatMatch {
  blockLen: number;
  count: number;
  prefixLen: number;
  endings: EndingGroup[];
  saving: number;
}

function findBestNearRepeat(
  measures: DcmsToken[][],
  startIdx: number,
  measureFps: string[],
): NearRepeatMatch | null {
  const remaining = measures.length - startIdx;
  let best: NearRepeatMatch | null = null;

  for (let blockLen = Math.floor(remaining / 2); blockLen >= 2; blockLen--) {
    for (let count = Math.floor(remaining / blockLen); count >= 2; count--) {
      if (startIdx + count * blockLen > measures.length) continue;

      // Find common prefix length across all blocks
      let prefixLen = 0;
      for (let m = 0; m < blockLen; m++) {
        const refFp = measureFps[startIdx + m];
        let allMatch = true;
        for (let b = 1; b < count; b++) {
          if (measureFps[startIdx + b * blockLen + m] !== refFp) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) prefixLen++;
        else break;
      }

      // Skip exact repeats (handled by findBestExactRepeat) and no-prefix cases
      if (prefixLen === blockLen || prefixLen < 1) continue;

      const endingLen = blockLen - prefixLen;

      // Group identical endings together (e.g., REPEAT_ENDING, 2, 3)
      const endingFps: string[] = [];
      for (let b = 0; b < count; b++) {
        const parts: string[] = [];
        for (let m = 0; m < endingLen; m++) {
          parts.push(measureFps[startIdx + b * blockLen + prefixLen + m]);
        }
        endingFps.push(parts.join("||"));
      }

      const groups: EndingGroup[] = [];
      const seen = new Map<string, number>();
      for (let b = 0; b < count; b++) {
        const fp = endingFps[b];
        const existing = seen.get(fp);
        if (existing !== undefined) {
          groups[existing].iterations.push(b + 1);
        } else {
          seen.set(fp, groups.length);
          groups.push({
            iterations: [b + 1],
            startMeasureIdx: startIdx + b * blockLen + prefixLen,
          });
        }
      }

      // Calculate byte savings
      const originalBytes = measureTokenBytes(measures, startIdx, count * blockLen);
      const prefixBytes = measureTokenBytes(measures, startIdx, prefixLen);

      let endingsBytes = 0;
      let endingsOverhead = 0;
      for (const group of groups) {
        endingsBytes += measureTokenBytes(measures, group.startMeasureIdx, endingLen);
        endingsOverhead += 1 + group.iterations.length; // REPEAT_ENDING byte + iteration indices
      }

      const overhead = 3 + endingsOverhead; // REPEAT_START(2) + REPEAT_END(1) + ending markers
      const compressedBytes = prefixBytes + endingsBytes + overhead;
      const saving = originalBytes - compressedBytes;

      if (saving > 0 && (!best || saving > best.saving)) {
        best = { blockLen, count, prefixLen, endings: groups, saving };
      }
    }
  }

  return best;
}

// ── Main compression (recursive, handles exact + near-repeat) ─────────

function compressRepeats(body: DcmsToken[], measureTicks: number, depth: number): DcmsToken[] {
  if (depth > MAX_REPEAT_DEPTH) return body;

  const measures = splitIntoMeasures(body, measureTicks);
  if (measures.length < 2) return body;

  // Precompute fingerprints for each measure
  const measureFps = measures.map((m) => tokensFingerprint(m));

  const result: DcmsToken[] = [];
  let i = 0;

  while (i < measures.length) {
    const exact = findBestExactRepeat(measures, i, measureFps);
    const near = findBestNearRepeat(measures, i, measureFps);

    // Pick whichever saves more bytes
    const useNear = near && (!exact || near.saving > exact.saving);
    const useExact = exact && !useNear;

    if (useExact && exact) {
      const { patternLen, count } = exact;
      const patternTokens = flattenMeasures(measures, i, patternLen);
      const innerTokens = compressRepeats(patternTokens, measureTicks, depth + 1);

      result.push({
        type: "repeat_start",
        values: [DCMS_REPEAT.REPEAT_START, count],
        label: `REPEAT_START, ${count}`,
      });

      for (const token of innerTokens) {
        result.push({ ...token, indent: (token.indent ?? 0) + 1 });
      }

      result.push({
        type: "repeat_end",
        values: [DCMS_REPEAT.REPEAT_END],
        label: "REPEAT_END",
      });

      i += count * patternLen;
    } else if (useNear && near) {
      const { blockLen, count, prefixLen, endings } = near;
      const endingLen = blockLen - prefixLen;

      // Recursively compress the common prefix
      const prefixTokens = flattenMeasures(measures, i, prefixLen);
      const compressedPrefix = compressRepeats(prefixTokens, measureTicks, depth + 1);

      result.push({
        type: "repeat_start",
        values: [DCMS_REPEAT.REPEAT_START, count],
        label: `REPEAT_START, ${count}`,
      });

      // Emit common prefix (plays every iteration)
      for (const token of compressedPrefix) {
        result.push({ ...token, indent: (token.indent ?? 0) + 1 });
      }

      // Emit each ending group with REPEAT_ENDING marker
      for (const group of endings) {
        result.push({
          type: "repeat_ending",
          values: [DCMS_REPEAT.REPEAT_ENDING, ...group.iterations],
          label: `REPEAT_ENDING, ${group.iterations.join(", ")}`,
          indent: 1,
        });

        // Recursively compress the ending content
        const endingTokens = flattenMeasures(measures, group.startMeasureIdx, endingLen);
        const compressedEnding = compressRepeats(endingTokens, measureTicks, depth + 1);

        for (const token of compressedEnding) {
          result.push({ ...token, indent: (token.indent ?? 0) + 1 });
        }
      }

      result.push({
        type: "repeat_end",
        values: [DCMS_REPEAT.REPEAT_END],
        label: "REPEAT_END",
      });

      i += count * blockLen;
    } else {
      // No repeat found — emit measure as-is
      for (const token of measures[i]) {
        result.push(token);
      }
      i++;
    }
  }

  return result;
}

// ── Public: Convert MIDI to HPP string ─────────────────────────────────

export interface ConvertOptions {
  songName: string;
  selectedTracks: number[];
  useDefines: boolean;
  detectRepeats: boolean;
}

// A single emitted output line, tagged with its absolute line number in the
// final `.hpp` text so the audio player can highlight it while playing.
export interface PlaybackRow {
  line: number; // 0-based index into hpp.split("\n")
  type: DcmsToken["type"];
  values: number[];
}

export interface PlaybackVoice {
  name: string;
  rows: PlaybackRow[];
}

export interface PlaybackData {
  voices: PlaybackVoice[];
  bpm: number;
  beats: number;
}

export interface ConvertResult {
  hpp: string;
  totalBytes: number;
  bytesPerVoice: { name: string; bytes: number }[];
  playback: PlaybackData;
}

export function convertMidiToHpp(midi: IMidiFile, options: ConvertOptions): ConvertResult {
  const { tracks, bpm, beats } = analyzeMidi(midi);
  const { songName, selectedTracks, useDefines, detectRepeats } = options;

  const safeName = songName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  const lines: string[] = [];

  if (useDefines) {
    lines.push(`#include "assets/music/base.h"`);
    lines.push("");
  }

  const voiceNames: string[] = [];
  const bytesPerVoice: { name: string; bytes: number }[] = [];
  const playbackVoices: PlaybackVoice[] = [];

  const filteredTracks = tracks.filter((t) => selectedTracks.includes(t.index));

  for (let vi = 0; vi < filteredTracks.length; vi++) {
    const trackInfo = filteredTracks[vi];
    const rawNotes = extractNotes(midi.tracks[trackInfo.index]);
    const monoNotes = reduceToMonophonic(rawNotes);
    let tokens = trackToDcmsTokens(monoNotes, midi.division, bpm, beats, vi === 0);

    if (detectRepeats) {
      tokens = applyRepeatDetection(tokens, beats);
    }

    const voiceName = `${safeName}__voice_${vi + 1}`;
    voiceNames.push(voiceName);

    // Count bytes: sum of all token values (each value = 1 byte in the uint8_t array)
    const voiceBytes = tokens.reduce((sum, t) => sum + t.values.length, 0);
    bytesPerVoice.push({ name: trackInfo.name, bytes: voiceBytes });

    const rows: PlaybackRow[] = [];
    lines.push(`static const uint8_t ${voiceName}[] PROGMEM = {`);

    for (const token of tokens) {
      if (token.type === "separator") {
        lines.push("");
        continue;
      }

      const indent = "  " + "  ".repeat(token.indent ?? 0);
      const content = useDefines ? token.label : token.values.join(", ");
      const comma = token.type === "end" ? "" : ",";

      // Absolute line number of the line we're about to push.
      rows.push({ line: lines.length, type: token.type, values: token.values });

      if (token.type === "repeat_start" || token.type === "repeat_end" || token.type === "repeat_ending") {
        lines.push(`${indent}${content},`);
      } else {
        lines.push(`${indent}${content}${comma}`);
      }
    }

    playbackVoices.push({ name: trackInfo.name, rows });

    lines.push(`};`);
    lines.push("");
  }

  // Array of voices (pointers: 2 bytes each on AVR, + music_sheet_end pointer)
  const pointerArrayBytes = (voiceNames.length + 1) * 2;

  lines.push("");
  lines.push(`const uint8_t* const ${safeName}[] PROGMEM = {`);
  for (const vn of voiceNames) {
    lines.push(`  ${vn},`);
  }
  lines.push(`  music_sheet_end`);
  lines.push(`};`);
  lines.push("");

  const totalBytes = bytesPerVoice.reduce((sum, v) => sum + v.bytes, 0) + pointerArrayBytes;

  return {
    hpp: lines.join("\n"),
    totalBytes,
    bytesPerVoice,
    playback: { voices: playbackVoices, bpm, beats },
  };
}
