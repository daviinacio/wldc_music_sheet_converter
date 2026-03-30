import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { type MidiTrackInfo } from "@/lib/midi-to-dcms";
import { useMidiConverter } from "@/lib/use-midi-converter";
import * as MidiJsonParser from "midi-json-parser";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IMidiFile } from "midi-json-parser-worker";
import {
  UploadIcon,
  Music2Icon,
  FileCodeIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  XIcon,
  Loader2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ExportMode = "defines" | "numbers";

export default function HomePage() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [midiFile, setMidiFile] = useState<IMidiFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [songName, setSongName] = useState("");
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [exportMode, setExportMode] = useState<ExportMode>("defines");
  const [detectRepeats, setDetectRepeats] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const { analysis, convertResult, isConverting, analyze, convert } =
    useMidiConverter();

  const hppOutput = convertResult?.hpp ?? "";

  // Trigger conversion when inputs change (debounced via worker)
  useEffect(() => {
    if (!midiFile || !analysis || selectedTracks.size === 0) return;
    convert(
      midiFile,
      songName || "untitled",
      Array.from(selectedTracks),
      exportMode === "defines",
      detectRepeats,
    );
  }, [midiFile, analysis, selectedTracks, songName, exportMode, detectRepeats, convert]);

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "mid" && ext !== "midi") return;

      const midi = await MidiJsonParser.parseArrayBuffer(
        await file.arrayBuffer(),
      );
      setMidiFile(midi);
      setFileName(file.name);
      setSongName(file.name.replace(/\.(mid|midi)$/i, ""));

      // Analyze in the worker — auto-select all tracks once done
      analyze(midi);
    },
    [analyze],
  );

  // Auto-select all tracks once analysis completes
  useEffect(() => {
    if (analysis) {
      setSelectedTracks(new Set(analysis.tracks.map((t) => t.index)));
    }
  }, [analysis]);

  const handleInputChange = useCallback<
    React.ChangeEventHandler<HTMLInputElement>
  >(
    (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(hppOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [hppOutput]);

  const handleDownload = useCallback(() => {
    const safeName = (songName || "untitled")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    const blob = new Blob([hppOutput], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.hpp`;
    a.click();
    URL.revokeObjectURL(url);
  }, [hppOutput, songName]);

  const toggleTrack = useCallback((index: number) => {
    setSelectedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleClear = useCallback(() => {
    setMidiFile(null);
    setFileName("");
    setSongName("");
    setSelectedTracks(new Set());
  }, []);

  // ── Upload screen ────────────────────────────────────────────────────

  if (!midiFile || !analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div
          className={cn(
            "w-full max-w-lg rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 cursor-pointer",
            isDragging
              ? "border-primary bg-primary/5 scale-[1.02]"
              : "border-border hover:border-primary/50 hover:bg-muted/30",
          )}
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mid,.midi"
            className="hidden"
            onChange={handleInputChange}
          />

          <div className="flex flex-col items-center gap-4">
            <div
              className={cn(
                "rounded-full p-4 transition-colors",
                isDragging ? "bg-primary/10" : "bg-muted",
              )}
            >
              {midiFile && !analysis ? (
                <Loader2Icon className="size-10 text-primary animate-spin" />
              ) : (
                <UploadIcon
                  className={cn(
                    "size-10 transition-colors",
                    isDragging ? "text-primary" : "text-muted-foreground",
                  )}
                />
              )}
            </div>

            <div>
              <h2 className="text-xl font-semibold">
                {midiFile && !analysis
                  ? "Analyzing..."
                  : isDragging
                    ? "Drop MIDI file here"
                    : "Upload MIDI file"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Drag & drop or click to select a <strong>.mid</strong> file
              </p>
            </div>

            <Badge variant="secondary" className="text-xs">
              .mid / .midi
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  // ── Main editor screen ───────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Music2Icon className="size-5 text-primary" />
          <h1 className="font-semibold text-lg">MIDI to HPP Converter</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <FileCodeIcon className="size-3" />
            {fileName}
          </Badge>
          <Button variant="ghost" size="icon-sm" onClick={handleClear}>
            <XIcon className="size-4" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-[360px_1fr] h-[calc(100vh-53px)]">
        {/* ── Left panel: Settings ── */}
        <aside className="border-r flex flex-col">
          {/* Song name */}
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Song name
              </label>
              <Input
                className="mt-1.5"
                value={songName}
                onChange={(e) => setSongName(e.target.value)}
                placeholder="song_name"
              />
            </div>

            {/* Metadata */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">BPM: </span>
                <span className="font-medium">{analysis.bpm}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Beats: </span>
                <span className="font-medium">{analysis.beats}/4</span>
              </div>
              <div>
                <span className="text-muted-foreground">Voices: </span>
                <span className="font-medium">{analysis.tracks.length}</span>
              </div>
            </div>

            {/* PROGMEM size */}
            {convertResult && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">PROGMEM total:</span>
                  <span className="font-semibold font-mono">
                    {convertResult.totalBytes} bytes
                  </span>
                </div>
                {convertResult.bytesPerVoice.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span className="truncate mr-2">
                      Voice {i + 1}: {v.name}
                    </span>
                    <span className="font-mono shrink-0">{v.bytes} B</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Track list */}
          <div className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tracks ({selectedTracks.size}/{analysis.tracks.length})
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6"
                onClick={() => {
                  if (selectedTracks.size === analysis.tracks.length) {
                    setSelectedTracks(new Set());
                  } else {
                    setSelectedTracks(
                      new Set(analysis.tracks.map((t) => t.index)),
                    );
                  }
                }}
              >
                {selectedTracks.size === analysis.tracks.length
                  ? "Deselect all"
                  : "Select all"}
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 px-4" fitContainer>
            <ul className="space-y-1 pb-4">
              {analysis.tracks.map((track) => (
                <TrackItem
                  key={track.index}
                  track={track}
                  selected={selectedTracks.has(track.index)}
                  onToggle={toggleTrack}
                />
              ))}
            </ul>
          </ScrollArea>

          <Separator />

          {/* Export mode */}
          <div className="p-4 space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Export format
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={exportMode === "defines" ? "default" : "outline"}
                size="sm"
                onClick={() => setExportMode("defines")}
              >
                With #defines
              </Button>
              <Button
                variant={exportMode === "numbers" ? "default" : "outline"}
                size="sm"
                onClick={() => setExportMode("numbers")}
              >
                Numbers only
              </Button>
            </div>

            {/* Repeat detection */}
            <label
              className="flex items-center gap-2 cursor-pointer select-none"
              onClick={() => setDetectRepeats((v) => !v)}
            >
              <div
                className={cn(
                  "size-5 rounded border-2 flex items-center justify-center transition-all shrink-0",
                  detectRepeats
                    ? "bg-primary border-primary"
                    : "border-border",
                )}
              >
                {detectRepeats && (
                  <CheckIcon className="size-3 text-primary-foreground" />
                )}
              </div>
              <span className="text-sm">Detect repeats</span>
            </label>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                className="flex-1 gap-2"
                onClick={handleDownload}
                disabled={!hppOutput}
              >
                <DownloadIcon className="size-4" />
                Download .hpp
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                disabled={!hppOutput}
              >
                {copied ? (
                  <CheckIcon className="size-4 text-green-600" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </aside>

        {/* ── Right panel: Preview ── */}
        <main className="flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Output preview
              </span>
              {isConverting && (
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <Badge variant="secondary" className="text-xs">
              {hppOutput ? `${hppOutput.split("\n").length} lines` : "---"}
            </Badge>
          </div>
          <ScrollArea className="flex-1" fitContainer>
            <pre className="p-6 text-sm font-mono leading-relaxed whitespace-pre text-foreground/90">
              {hppOutput || (
                <span className="text-muted-foreground italic">
                  {selectedTracks.size === 0
                    ? "Select at least one track to preview the output"
                    : "Converting..."}
                </span>
              )}
            </pre>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}

// ── Track item component ───────────────────────────────────────────────

function TrackItem({
  track,
  selected,
  onToggle,
}: {
  track: MidiTrackInfo;
  selected: boolean;
  onToggle: (index: number) => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all",
        "hover:bg-muted/70",
        selected ? "bg-primary/5 ring-1 ring-primary/20" : "opacity-60",
      )}
      onClick={() => onToggle(track.index)}
    >
      <div
        className={cn(
          "size-5 rounded border-2 flex items-center justify-center transition-all shrink-0",
          selected ? "bg-primary border-primary" : "border-border",
        )}
      >
        {selected && <CheckIcon className="size-3 text-primary-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{track.name}</div>
        <div className="text-xs text-muted-foreground">
          {track.noteCount} notes
          {track.channel !== null && ` \u00B7 Ch ${track.channel + 1}`}
        </div>
      </div>
      <Badge variant="secondary" className="text-xs shrink-0">
        Voice {track.index + 1}
      </Badge>
    </li>
  );
}
