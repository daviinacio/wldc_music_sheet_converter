// ── DCMS audio player ──────────────────────────────────────────────────
//
// Interprets the DCMS output format (the same bytes that ship to the Arduino)
// and plays every selected voice polyphonically via the Web Audio API. Each
// scheduled sound knows which line of the `.hpp` output it came from, so the UI
// can highlight the currently-sounding line of every voice array in real time.

import type { PlaybackData, PlaybackRow } from "./midi-to-dcms";

// ── DCMS constants (mirror of base.h) ──────────────────────────────────
const REST_NOTE = 70;
const TIE = 40;
const SLUR = 41;

// How a note connects to the following note:
//  - "tie"  → same pitch, held as one sustained tone
//  - "slur" → glide (portamento) into the next pitch, played legato
type Connector = "tie" | "slur" | null;

// DCMS pitch value (101..112) → semitone offset above C.
const SEMITONE_FROM_C: Record<number, number> = {
  104: 0, // C
  105: 1, // C#
  106: 2, // D
  107: 3, // D#
  108: 4, // E
  109: 5, // F
  110: 6, // F#
  111: 7, // G
  112: 8, // G#
  101: 9, // A
  102: 10, // A#
  103: 11, // B
};

// DCMS "octave" here matches scientific pitch notation (C4 = middle C = MIDI 60),
// because the converter derives it as floor(midiNote / 12) - 1.
function dcmsToMidi(pitchValue: number, octave: number): number | null {
  const semitone = SEMITONE_FROM_C[pitchValue];
  if (semitone === undefined) return null;
  return (octave + 1) * 12 + semitone;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Duration value → DCMS ticks (quarter note = 16 ticks, whole = 64).
function durationTicks(value: number): number {
  const standard = [64, 32, 16, 8, 4, 2, 1]; // WHOLE..SIXTY_FOURTH (50..56)
  if (value >= 50 && value <= 56) return standard[value - 50];
  if (value >= 57 && value <= 63) return standard[value - 57] * 1.5; // dotted
  return 0;
}

// ── Structural parse: rows → nested repeat tree ────────────────────────

type PlayNode =
  | { kind: "event"; line: number; midi: number | null; ticks: number; connector: Connector }
  | { kind: "repeat"; count: number; prefix: PlayNode[]; endings: { iters: number[]; content: PlayNode[] }[] };

interface RepeatFrame {
  count: number;
  prefix: PlayNode[];
  endings: { iters: number[]; content: PlayNode[] }[];
  target: PlayNode[]; // where new nodes are appended (prefix, or the current ending's content)
}

function parseVoice(rows: PlaybackRow[]): PlayNode[] {
  const root: PlayNode[] = [];
  const stack: RepeatFrame[] = [];
  const current = () => (stack.length ? stack[stack.length - 1].target : root);

  for (const row of rows) {
    const v = row.values;

    switch (row.type) {
      case "repeat_start": {
        const frame: RepeatFrame = { count: v[1] ?? 1, prefix: [], endings: [], target: [] };
        frame.target = frame.prefix;
        stack.push(frame);
        break;
      }
      case "repeat_ending": {
        const frame = stack[stack.length - 1];
        if (!frame) break;
        const ending = { iters: v.slice(1), content: [] as PlayNode[] };
        frame.endings.push(ending);
        frame.target = ending.content;
        break;
      }
      case "repeat_end": {
        const frame = stack.pop();
        if (!frame) break;
        current().push({ kind: "repeat", count: frame.count, prefix: frame.prefix, endings: frame.endings });
        break;
      }
      case "note": {
        const midi = dcmsToMidi(v[0], v[1]);
        const last = v[v.length - 1];
        const connector: Connector = last === TIE ? "tie" : last === SLUR ? "slur" : null;
        current().push({ kind: "event", line: row.line, midi, ticks: durationTicks(v[2]), connector });
        break;
      }
      case "rest": {
        // values: [REST_NOTE, duration]
        if (v[0] === REST_NOTE) {
          current().push({ kind: "event", line: row.line, midi: null, ticks: durationTicks(v[1]), connector: null });
        }
        break;
      }
      // meta / end / separator carry no audible duration
    }
  }

  return root;
}

// ── Execution: repeat tree → flat, absolutely-timed events ─────────────

export interface FlatEvent {
  line: number;
  midi: number | null; // null = rest
  startTick: number;
  ticks: number;
  connector: Connector; // link to the following note (tie/slur), if any
}

function flatten(nodes: PlayNode[]): FlatEvent[] {
  const out: FlatEvent[] = [];
  let tick = 0;

  const run = (list: PlayNode[]) => {
    for (const n of list) {
      if (n.kind === "event") {
        out.push({ line: n.line, midi: n.midi, startTick: tick, ticks: n.ticks, connector: n.connector });
        tick += n.ticks;
      } else {
        for (let it = 1; it <= n.count; it++) {
          run(n.prefix);
          if (n.endings.length) {
            const ending = n.endings.find((e) => e.iters.includes(it));
            if (ending) run(ending.content);
          }
        }
      }
    }
  };

  run(nodes);
  return out;
}

// ── Timeline ───────────────────────────────────────────────────────────

export interface VoiceTimeline {
  voiceIndex: number;
  name: string;
  events: FlatEvent[]; // sorted by startTick
}

// A frequency waypoint within a phrase. `glide` = ramp (portamento) from the
// previous waypoint; otherwise the pitch steps instantly.
interface FreqPoint {
  timeSec: number;
  freq: number;
  glide: boolean;
}

// A legato run of notes played by one oscillator: notes joined by TIE (same
// pitch, held) or SLUR (glide to the next pitch). A plain note is a phrase of one.
interface AudioPhrase {
  startSec: number;
  endSec: number;
  points: FreqPoint[];
}

export interface Timeline {
  voices: VoiceTimeline[];
  phrases: AudioPhrase[];
  durationSec: number;
  secondsPerTick: number;
}

export function buildTimeline(playback: PlaybackData): Timeline {
  const bpm = playback.bpm || 120;
  const beats = playback.beats || 4;
  // Match the firmware (MusicPlayer::update_interval): a whole note lasts one
  // measure, i.e. `beats × (60/bpm)` seconds — NOT a fixed 4 beats. Our whole
  // note is 64 DCMS ticks, so secondsPerTick = beats × (60/bpm) / 64.
  // (Reduces to the plain 60/(bpm×16) when beats = 4.)
  const secondsPerTick = (60 * beats) / (bpm * 64);

  const voices: VoiceTimeline[] = [];
  const phrases: AudioPhrase[] = [];
  let maxTick = 0;

  playback.voices.forEach((voice, vi) => {
    const events = flatten(parseVoice(voice.rows));
    voices.push({ voiceIndex: vi, name: voice.name, events });

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const end = ev.startTick + ev.ticks;
      if (end > maxTick) maxTick = end;
      if (ev.midi === null) continue; // rest: no audio

      // Grow a legato phrase across TIE/SLUR connectors.
      const points: FreqPoint[] = [{ timeSec: ev.startTick * secondsPerTick, freq: midiToFreq(ev.midi), glide: false }];
      let j = i;
      while (events[j].connector && j + 1 < events.length && events[j + 1].midi !== null) {
        const connector = events[j].connector;
        const next = events[j + 1];
        const nextFreq = midiToFreq(next.midi!);
        // TIE holds the pitch (only emit a step if the pitch actually changes);
        // SLUR glides into the next pitch.
        if (connector === "slur") {
          points.push({ timeSec: next.startTick * secondsPerTick, freq: nextFreq, glide: true });
        } else if (next.midi !== events[j].midi) {
          points.push({ timeSec: next.startTick * secondsPerTick, freq: nextFreq, glide: false });
        }
        j++;
      }

      const runEnd = events[j].startTick + events[j].ticks;
      if (runEnd > maxTick) maxTick = runEnd;
      phrases.push({ startSec: points[0].timeSec, endSec: runEnd * secondsPerTick, points });
      i = j;
    }
  });

  return { voices, phrases, durationSec: maxTick * secondsPerTick, secondsPerTick };
}

// Line currently sounding in a voice at time `cur` (seconds), or null.
function activeLineAt(events: FlatEvent[], cur: number, spt: number): number | null {
  let lo = 0;
  let hi = events.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].startTick * spt <= cur) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (res < 0) return null;
  const e = events[res];
  return cur < (e.startTick + e.ticks) * spt ? e.line : null;
}

// ── Player ─────────────────────────────────────────────────────────────

export interface PlayerUpdate {
  time: number; // seconds
  duration: number;
  playing: boolean;
  activeLines: Set<number>; // absolute hpp line numbers currently sounding
}

type Listener = (u: PlayerUpdate) => void;

export class DcmsPlayer {
  private timeline: Timeline;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private raf = 0;
  private t0 = 0; // ctx time that maps to offset 0 of the piece
  private offset = 0; // seconds into the piece
  private _playing = false;
  private listeners = new Set<Listener>();

  constructor(timeline: Timeline) {
    this.timeline = timeline;
  }

  get duration(): number {
    return this.timeline.durationSec;
  }

  get playing(): boolean {
    return this._playing;
  }

  addListener(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(activeLines: Set<number>, time: number, playing: boolean) {
    const u: PlayerUpdate = { time, duration: this.duration, playing, activeLines };
    for (const l of this.listeners) l(u);
  }

  private ensureCtx() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
  }

  play(from?: number) {
    if (this.duration <= 0) return;
    this.ensureCtx();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") void ctx.resume();

    if (from !== undefined) this.offset = from;
    if (this.offset >= this.duration) this.offset = 0;

    this.stopNodes();
    this.t0 = ctx.currentTime - this.offset;

    for (const phrase of this.timeline.phrases) {
      if (phrase.endSec <= this.offset) continue;
      this.schedulePhrase(ctx, phrase);
    }

    this._playing = true;
    this.loop();
  }

  private schedulePhrase(ctx: AudioContext, phrase: AudioPhrase) {
    const start = Math.max(this.offset, phrase.startSec);
    const startAt = this.t0 + start;
    const endAt = this.t0 + phrase.endSec;

    const osc = ctx.createOscillator();
    osc.type = "triangle";

    const gain = ctx.createGain();
    const peak = 0.22;
    const releaseStart = Math.max(startAt + 0.006, endAt - 0.03);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + 0.006);
    gain.gain.setValueAtTime(peak, releaseStart);
    gain.gain.linearRampToValueAtTime(0, endAt);

    // Frequency automation. A SLUR glides linearly from the note's pitch to the
    // next note's, spanning that whole note (matches the firmware's
    // calc_current_frequency). A TIE/plain boundary steps instantly. When
    // seeking mid-phrase, begin at whichever waypoint is active at `start`.
    const points = phrase.points;
    let curFreq = points[0].freq;
    for (const p of points) {
      if (p.timeSec <= start) curFreq = p.freq;
    }
    osc.frequency.setValueAtTime(curFreq, startAt);

    for (const p of points) {
      if (p.timeSec <= start) continue;
      const at = this.t0 + p.timeSec;
      if (p.glide) {
        // Ramp spans from the previous waypoint's time to this one — i.e. the
        // full duration of the note being slurred.
        osc.frequency.linearRampToValueAtTime(p.freq, at);
      } else {
        osc.frequency.setValueAtTime(p.freq, at);
      }
    }

    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
    this.nodes.push({ osc, gain });
  }

  private loop = () => {
    if (!this.ctx) return;
    const cur = this.ctx.currentTime - this.t0;

    if (cur >= this.duration) {
      this.offset = 0;
      this.stopNodes();
      this._playing = false;
      this.emit(new Set(), this.duration, false);
      return;
    }

    this.emit(this.linesAt(cur), cur, true);
    this.raf = requestAnimationFrame(this.loop);
  };

  private linesAt(cur: number): Set<number> {
    const set = new Set<number>();
    for (const v of this.timeline.voices) {
      const line = activeLineAt(v.events, cur, this.timeline.secondsPerTick);
      if (line !== null) set.add(line);
    }
    return set;
  }

  pause() {
    if (!this.ctx || !this._playing) return;
    this.offset = this.ctx.currentTime - this.t0;
    this.stopNodes();
    cancelAnimationFrame(this.raf);
    this._playing = false;
    this.emit(new Set(), this.offset, false);
  }

  stop() {
    this.offset = 0;
    this.stopNodes();
    cancelAnimationFrame(this.raf);
    this._playing = false;
    this.emit(new Set(), 0, false);
  }

  seek(sec: number) {
    const clamped = Math.max(0, Math.min(sec, this.duration));
    if (this._playing) {
      this.play(clamped);
    } else {
      this.offset = clamped;
      this.emit(this.linesAt(clamped), clamped, false);
    }
  }

  toggle() {
    if (this._playing) this.pause();
    else this.play();
  }

  private stopNodes() {
    for (const n of this.nodes) {
      try {
        n.osc.stop();
      } catch {
        // already stopped
      }
      n.osc.disconnect();
      n.gain.disconnect();
    }
    this.nodes = [];
  }

  dispose() {
    this.stopNodes();
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
    void this.ctx?.close();
    this.ctx = null;
  }
}
