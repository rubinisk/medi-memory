import { useCallback, useEffect, useRef, useState } from "react";
import { api, blobErrorMessage } from "../services/api";

/** Plays ElevenLabs TTS audio for a message via the backend (key stays server-side). */
export function useSpeech(onError) {
  const audio = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const cache = useRef(new Map());

  const stop = useCallback(() => {
    if (audio.current) { audio.current.pause(); }
    setPlayingId(null);
  }, []);

  useEffect(() => () => {
    audio.current?.pause();
    cache.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const play = useCallback(async (id, text) => {
    if (playingId === id) { stop(); return; }
    stop();
    try {
      let url = cache.current.get(id);
      if (!url) {
        setBusyId(id);
        const r = await api.post("/api/voice/speak", { text }, { responseType: "blob" });
        url = URL.createObjectURL(r.data);
        cache.current.set(id, url);
      }
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => setPlayingId(null);
      a.onpause = () => setPlayingId((p) => (p === id ? null : p));
      setPlayingId(id);
      await a.play();
    } catch (e) {
      setPlayingId(null);
      onError?.(await blobErrorMessage(e, "Couldn't play the voice response."));
    } finally {
      setBusyId(null);
    }
  }, [playingId, stop, onError]);

  return { play, stop, playingId, busyId };
}
