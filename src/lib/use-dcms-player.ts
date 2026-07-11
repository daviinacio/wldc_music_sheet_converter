import { useCallback, useEffect, useState } from "react";
import type { PlaybackData } from "./midi-to-dcms";
import { buildTimeline, DcmsPlayer } from "./dcms-player";

// Owns a DcmsPlayer instance tied to the current conversion output. Rebuilds the
// player whenever the playback data changes (i.e. on every re-conversion) and
// exposes transport state plus the player itself (for imperative line highlight).
export function useDcmsPlayer(playback: PlaybackData | undefined) {
  const [player, setPlayer] = useState<DcmsPlayer | null>(null);
  const [transport, setTransport] = useState({ playing: false, time: 0, duration: 0 });

  useEffect(() => {
    if (!playback || playback.voices.length === 0) {
      setPlayer(null);
      setTransport({ playing: false, time: 0, duration: 0 });
      return;
    }

    const timeline = buildTimeline(playback);
    const instance = new DcmsPlayer(timeline);
    const unsubscribe = instance.addListener((u) =>
      setTransport({ playing: u.playing, time: u.time, duration: u.duration }),
    );

    setPlayer(instance);
    setTransport({ playing: false, time: 0, duration: timeline.durationSec });

    return () => {
      unsubscribe();
      instance.dispose();
    };
  }, [playback]);

  const toggle = useCallback(() => player?.toggle(), [player]);
  const stop = useCallback(() => player?.stop(), [player]);
  const seek = useCallback((sec: number) => player?.seek(sec), [player]);

  return { player, ...transport, toggle, stop, seek };
}
