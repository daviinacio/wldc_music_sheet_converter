// ── Tolerant Standard MIDI File (SMF) parser ───────────────────────────
//
// Drop-in replacement for midi-json-parser's parseArrayBuffer that produces the
// same IMidiFile shape but does NOT throw on meta events it doesn't recognise
// (midi-json-parser hard-throws e.g. `Cannot parse a meta event with a type of
// "4B"`). Unknown meta/sysex events are skipped by their declared length; every
// event still carries its delta so timing stays correct.

import type { IMidiFile } from "midi-json-parser-worker";

// Event objects are intentionally loose — downstream (analyzeMidi/extractNotes)
// reads them via `as any`, matching how midi-json-parser's union is consumed.
type MidiEvent = Record<string, unknown> & { delta: number };

export function parseMidiArrayBuffer(buffer: ArrayBuffer): IMidiFile {
  const view = new DataView(buffer);
  const size = view.byteLength;
  let pos = 0;

  const u8 = () => view.getUint8(pos++);
  const u16 = () => {
    const v = view.getUint16(pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = view.getUint32(pos);
    pos += 4;
    return v;
  };
  const str = (n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(pos++));
    return s;
  };
  // Variable-length quantity (7 bits per byte, high bit = continue).
  const varint = () => {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = u8();
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return value;
  };

  // ── Header ──
  if (str(4) !== "MThd") {
    throw new Error("Not a valid MIDI file (missing MThd header).");
  }
  const headerLen = u32();
  const format = u16();
  const numTracks = u16();
  const division = u16();
  pos = 8 + headerLen; // tolerate a longer-than-6 header

  const tracks: MidiEvent[][] = [];

  for (let t = 0; t < numTracks && pos + 8 <= size; t++) {
    const chunkId = str(4);
    const chunkLen = u32();
    const end = Math.min(pos + chunkLen, size);

    if (chunkId !== "MTrk") {
      pos = end; // skip unknown chunk types
      continue;
    }

    const events: MidiEvent[] = [];
    let runningStatus = 0;

    while (pos < end) {
      const delta = varint();
      if (pos >= end) break;

      let status = view.getUint8(pos);
      if (status & 0x80) {
        pos++;
        if (status < 0xf0) runningStatus = status; // channel messages set running status
      } else {
        status = runningStatus; // running status: `status` byte is actually data
        if (status === 0) break; // malformed — bail out of this track
      }

      if (status === 0xff) {
        // Meta event: <type> <varint length> <data…>
        const metaType = u8();
        const len = varint();
        const dataStart = pos;

        if (metaType === 0x2f) {
          events.push({ delta, endOfTrack: true });
          pos = dataStart + len;
          break;
        } else if (metaType === 0x51 && len >= 3) {
          const mpq = (view.getUint8(dataStart) << 16) | (view.getUint8(dataStart + 1) << 8) | view.getUint8(dataStart + 2);
          events.push({ delta, setTempo: { microsecondsPerQuarter: mpq } });
        } else if (metaType === 0x58 && len >= 4) {
          events.push({
            delta,
            timeSignature: {
              numerator: view.getUint8(dataStart),
              denominator: Math.pow(2, view.getUint8(dataStart + 1)),
              metronome: view.getUint8(dataStart + 2),
              thirtyseconds: view.getUint8(dataStart + 3),
            },
          });
        } else if (metaType === 0x03) {
          events.push({ delta, trackName: str(len) });
        } else {
          // Any other meta type (0x4B, sequencer-specific 0x7F, etc.) — skip it.
          events.push({ delta });
        }

        pos = dataStart + len;
        runningStatus = 0;
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx — skip by declared length.
        const len = varint();
        pos += len;
        events.push({ delta });
        runningStatus = 0;
      } else {
        // Channel voice message.
        const hi = status & 0xf0;
        const channel = status & 0x0f;
        if (hi === 0x90) {
          events.push({ delta, channel, noteOn: { noteNumber: u8(), velocity: u8() } });
        } else if (hi === 0x80) {
          events.push({ delta, channel, noteOff: { noteNumber: u8(), velocity: u8() } });
        } else if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) {
          pos += 2; // key pressure / control change / pitch bend — carry delta only
          events.push({ delta, channel });
        } else if (hi === 0xc0) {
          // Program change — keep the patch number so voices can be named.
          events.push({ delta, channel, programChange: { programNumber: u8() } });
        } else if (hi === 0xd0) {
          pos += 1; // channel pressure
          events.push({ delta, channel });
        } else {
          break; // unrecoverable status — stop this track
        }
      }
    }

    pos = end; // realign to the next chunk regardless of how the track ended
    tracks.push(events);
  }

  return { division, format, tracks } as unknown as IMidiFile;
}
