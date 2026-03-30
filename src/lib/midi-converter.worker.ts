import { analyzeMidi, convertMidiToHpp, type ConvertOptions, type ConvertResult, type MidiTrackInfo } from "./midi-to-dcms";
import type { IMidiFile } from "midi-json-parser-worker";

export type WorkerRequest =
  | { type: "analyze"; midi: IMidiFile }
  | { type: "convert"; midi: IMidiFile; options: ConvertOptions };

export type WorkerResponse =
  | { type: "analyze"; tracks: MidiTrackInfo[]; bpm: number; beats: number; division: number }
  | { type: "convert"; result: ConvertResult };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === "analyze") {
    const result = analyzeMidi(msg.midi);
    self.postMessage({ type: "analyze", ...result } satisfies WorkerResponse);
  } else if (msg.type === "convert") {
    const result = convertMidiToHpp(msg.midi, msg.options);
    self.postMessage({ type: "convert", result } satisfies WorkerResponse);
  }
};
