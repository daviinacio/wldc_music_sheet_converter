import { useCallback, useEffect, useRef, useState } from "react";
import type { IMidiFile } from "midi-json-parser-worker";
import type { ConvertResult, MidiTrackInfo } from "./midi-to-dcms";
import type { WorkerRequest, WorkerResponse } from "./midi-converter.worker";

interface AnalysisResult {
  tracks: MidiTrackInfo[];
  bpm: number;
  beats: number;
  division: number;
}

export function useMidiConverter() {
  const workerRef = useRef<Worker | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [convertResult, setConvertResult] = useState<ConvertResult | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Create worker once
  useEffect(() => {
    const worker = new Worker(
      new URL("./midi-converter.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "analyze") {
        setAnalysis({
          tracks: msg.tracks,
          bpm: msg.bpm,
          beats: msg.beats,
          division: msg.division,
        });
      } else if (msg.type === "convert") {
        setConvertResult(msg.result);
        setIsConverting(false);
      }
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const post = useCallback((msg: WorkerRequest) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const analyze = useCallback(
    (midi: IMidiFile) => {
      setAnalysis(null);
      setConvertResult(null);
      post({ type: "analyze", midi });
    },
    [post],
  );

  const convert = useCallback(
    (midi: IMidiFile, songName: string, selectedTracks: number[], useDefines: boolean, detectRepeats: boolean) => {
      setIsConverting(true);
      post({
        type: "convert",
        midi,
        options: { songName, selectedTracks, useDefines, detectRepeats },
      });
    },
    [post],
  );

  return { analysis, convertResult, isConverting, analyze, convert };
}
