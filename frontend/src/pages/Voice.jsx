import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Keyboard, Mic, Pause, Play, Send, Square, Volume2 } from "lucide-react";
import { AssistantDisclaimer, MessageBubble } from "../components/Chat";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, blobErrorMessage, errorMessage } from "../services/api";

const STAGES = [
  { key: "recording", label: "Listening" },
  { key: "transcribing", label: "ElevenLabs speech-to-text" },
  { key: "thinking", label: "Searching your records" },
  { key: "speaking", label: "ElevenLabs voice" },
];
const BARS = 22;
const MAX_SECONDS = 60;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
}

function Waveform({ levels, active }) {
  const bars = [...levels.slice().reverse(), ...levels];
  return (
    <div className="my-3 flex h-20 w-full items-center justify-center gap-[3px]" aria-hidden="true">
      <span className="h-[2px] flex-1 rounded-full bg-gradient-to-r from-transparent to-brand/50" />
      {bars.map((l, i) => (
        <span key={i} className={`w-[3px] rounded-full bg-gradient-to-b from-sky-400 to-brand transition-[height] duration-75 ${active ? "" : "opacity-35"}`}
          style={{ height: `${Math.max(4, Math.round(l * 72))}px` }} />
      ))}
      <span className="h-[2px] flex-1 rounded-full bg-gradient-to-l from-transparent to-brand/50" />
    </div>
  );
}

export default function Voice() {
  const { user } = useAuth();
  const toast = useToast();
  const status = useApi("/api/voice/status");
  const [stage, setStage] = useState("idle"); // idle|recording|transcribing|thinking|speaking
  const [levels, setLevels] = useState(() => Array(BARS).fill(0.1));
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const [showTyped, setShowTyped] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [playing, setPlaying] = useState(false);

  const rec = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);
  const raf = useRef(null);
  const timer = useRef(null);
  const audioCtx = useRef(null);
  const player = useRef(null);
  const cancelled = useRef(false);

  const configured = status.data?.configured;
  const consent = status.data?.consent;
  const ready = configured && consent;

  const cleanupStream = useCallback(() => {
    cancelAnimationFrame(raf.current);
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    setLevels(Array(BARS).fill(0.1));
  }, []);

  useEffect(() => () => { cleanupStream(); player.current?.pause(); }, [cleanupStream]);
  useEffect(() => () => audioUrl && URL.revokeObjectURL(audioUrl), [audioUrl]);

  // Simple "speaking" animation while audio plays
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setLevels(Array.from({ length: BARS }, (_, i) => 0.2 + 0.8 * Math.abs(Math.sin(Date.now() / 180 + i * 0.6)) * Math.random())), 90);
    return () => { clearInterval(id); setLevels(Array(BARS).fill(0.1)); };
  }, [playing]);

  const speak = async (text, msgId) => {
    setStage("speaking");
    try {
      const r = await api.post("/api/voice/speak", { text }, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      setAudioUrl(url);
      const a = new Audio(url);
      player.current?.pause();
      player.current = a;
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.onended = () => setPlaying(false);
      if (user?.profile?.voice_autoplay !== false) {
        try { await a.play(); } catch { toast.info("Press play to hear the answer."); }
      }
    } catch (e) {
      setError(await blobErrorMessage(e, "Couldn't generate the voice response."));
    } finally { setStage("idle"); }
    return msgId;
  };

  const askAndSpeak = async (question) => {
    setStage("thinking");
    try {
      const r = await api.post("/api/assistant/ask", { question, session_id: sessionId, channel: "voice" });
      setSessionId(r.data.session_id);
      setMessages((m) => [...m, r.data.question, r.data.answer]);
      if (ready) await speak(r.data.answer.content, r.data.answer.id);
      else setStage("idle");
    } catch (e) { setError(errorMessage(e)); setStage("idle"); }
  };

  const onStop = async () => {
    const blob = new Blob(chunks.current, { type: rec.current?.mimeType || "audio/webm" });
    cleanupStream();
    if (cancelled.current) { setStage("idle"); return; }
    if (blob.size < 1500) { setError("That recording was too short. Hold the button a little longer and speak clearly."); setStage("idle"); return; }
    setStage("transcribing");
    const fd = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    fd.append("file", blob, `question.${ext}`);
    const lang = user?.profile?.preferred_language;
    if (lang && lang !== "auto") fd.append("language_code", lang);
    try {
      const r = await api.post("/api/voice/transcribe", fd);
      setTranscript(r.data.text);
      await askAndSpeak(r.data.text);
    } catch (e) { setError(errorMessage(e, "Transcription failed.")); setStage("idle"); }
  };

  const start = async () => {
    setError(""); setTranscript(""); cancelled.current = false;
    player.current?.pause();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio. Use the latest Chrome, Edge or Firefox, or type your question instead."); setShowTyped(true); return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = pickMime();
      const mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = onStop;
      rec.current = mr;
      mr.start(250);
      setStage("recording");
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((x) => {
        if (x + 1 >= MAX_SECONDS) stop();
        return x + 1;
      }), 1000);
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtx.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 128;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const draw = () => {
          an.getByteFrequencyData(buf);
          setLevels(Array.from({ length: BARS }, (_, i) => Math.min(1, (buf[Math.floor((i / BARS) * buf.length * 0.7)] || 0) / 200)));
          raf.current = requestAnimationFrame(draw);
        };
        draw();
      }
    } catch (e) {
      cleanupStream();
      setError(e?.name === "NotAllowedError" ? "Microphone access was blocked. Allow microphone access in your browser's address bar and try again."
        : e?.name === "NotFoundError" ? "No microphone was found. Connect one, or type your question instead." : `Couldn't start recording: ${e?.message || e}`);
      setStage("idle");
    }
  };

  const stop = () => { if (rec.current?.state === "recording") rec.current.stop(); };
  const cancel = () => { cancelled.current = true; stop(); };

  const togglePlay = () => {
    const a = player.current;
    if (!a) return;
    if (a.paused) a.play().catch((e) => setError(String(e))); else a.pause();
  };

  const submitTyped = async (e) => {
    e.preventDefault();
    const t = typed.trim();
    if (t.length < 2) return;
    setTyped(""); setTranscript(t); setError("");
    await askAndSpeak(t);
  };

  const busy = ["transcribing", "thinking", "speaking"].includes(stage);
  const stageIdx = STAGES.findIndex((s) => s.key === stage);
  const statusText = stage === "recording" ? "Listening…" : stage === "transcribing" ? "Transcribing with ElevenLabs…" : stage === "thinking" ? "Finding the answer in your records…"
    : stage === "speaking" ? "Generating voice with ElevenLabs…" : playing ? "Speaking…" : ready ? "Tap to Speak" : "Voice input unavailable";

  return (
    <div>
      <PageHeader title="Voice Assistant" subtitle="Speak naturally and get answers in voice. Powered by ElevenLabs speech-to-text and text-to-speech." />

      {status.loading ? null : !configured ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-semibold">ElevenLabs is not configured</p>
            <p className="mt-1">{status.data?.message} Add <code>ELEVENLABS_API_KEY</code> to the <code>.env</code> file in the MediMemory folder and restart the backend. You can still use the typed fallback below; answers will be shown as text.</p></div>
        </div>
      ) : !consent ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-semibold">Voice processing is turned off</p>
            <p className="mt-1">Voice features send your recording and the answer text to ElevenLabs. Turn on “AI &amp; voice processing” in <Link to="/app/settings" className="font-semibold underline">Settings</Link> to continue.</p></div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className="card flex flex-col items-center bg-gradient-to-b from-white via-white to-brand-50/50 px-6 pb-6 pt-10 text-center">
          <div className="relative my-6">
            {(stage === "recording" || playing) && <><span className="absolute inset-0 animate-pulseRing rounded-full bg-brand/30" /><span className="absolute inset-0 animate-pulseRing rounded-full bg-sky-300/40 [animation-delay:0.6s]" /></>}
            <button onClick={stage === "recording" ? stop : start} disabled={!ready || busy}
              aria-label={stage === "recording" ? "Stop recording" : "Start recording your question"}
              className={`relative flex h-40 w-40 items-center justify-center rounded-full text-white shadow-glow ring-8 ring-white transition focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60 ${stage === "recording" ? "bg-gradient-to-br from-red-400 to-red-600" : "bg-orb hover:scale-[1.03]"}`}>
              {stage === "recording" ? <Square className="h-12 w-12" fill="currentColor" /> : busy ? <Spinner className="h-12 w-12" /> : <Mic className="h-16 w-16" strokeWidth={2.2} />}
            </button>
          </div>
          <p className="text-lg font-semibold text-ink" aria-live="polite">{statusText}</p>
          <p className="text-sm text-muted">{stage === "recording" ? `${seconds}s · tap the button to finish` : "Ask anything about your medical records"}</p>
          {stage === "recording" && <button className="mt-1 text-xs text-muted underline" onClick={cancel}>Cancel</button>}

          <Waveform levels={levels} active={stage === "recording" || playing} />

          <ol className="mt-1 grid w-full grid-cols-2 gap-2 text-left text-[11px] sm:grid-cols-4" aria-label="Progress">
            {STAGES.map((s, i) => (
              <li key={s.key} className={`rounded-full px-3 py-1.5 text-center font-medium ${i === stageIdx ? "bg-brand text-white" : i < stageIdx ? "bg-brand-50 text-brand-700" : "bg-canvas text-muted"}`}>{s.label}</li>
            ))}
          </ol>

          {transcript && (
            <div className="mt-5 w-full rounded-2xl bg-canvas px-4 py-3 text-left ring-1 ring-line">
              <p className="text-xs font-medium text-muted">You said:</p>
              <p className="mt-0.5 text-sm font-medium text-ink">“{transcript}”</p>
            </div>
          )}

          {audioUrl && (
            <div className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-card ring-1 ring-line">
              <Volume2 className="h-5 w-5 text-brand" />
              <div className="flex-1 text-left"><p className="text-sm font-semibold text-ink">{playing ? "Playing response…" : "Response ready"}</p>
                <p className="text-xs text-muted">ElevenLabs text-to-speech</p></div>
              <button className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-md shadow-brand/30" onClick={togglePlay} aria-label={playing ? "Pause answer" : "Play answer"}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button className="btn-outline rounded-full" onClick={() => { if (stage === "recording") stop(); else player.current?.pause(); }} disabled={stage !== "recording" && !playing}>
              <Square className="h-3.5 w-3.5" fill="currentColor" /> Stop</button>
            <button className="btn-outline rounded-full" onClick={togglePlay} disabled={!audioUrl || playing}><Play className="h-3.5 w-3.5" fill="currentColor" /> Play Response</button>
          </div>

          <div className="mt-4 w-full"><ErrorBox message={error} /></div>

          <div className="mt-4 w-full border-t border-line pt-4">
            <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand" onClick={() => setShowTyped(!showTyped)}><Keyboard className="h-3.5 w-3.5" /> {showTyped ? "Hide" : "Type instead"}</button>
            {showTyped && (
              <form onSubmit={submitTyped} className="mt-2 flex gap-2">
                <label htmlFor="typed" className="sr-only">Type your question</label>
                <input id="typed" className="input rounded-full" placeholder="Type your question" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} />
                <button className="btn-brand rounded-full" disabled={busy || typed.trim().length < 2} aria-label="Ask"><Send className="h-4 w-4" /></button>
              </form>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">Powered by <span className="font-semibold text-ink">ElevenLabs</span> <span aria-hidden="true">✨</span></p>
        </section>

        <section className="card flex max-h-[80vh] flex-col">
          <header className="px-5 pb-2 pt-5"><h2 className="text-base font-semibold text-ink">Conversation History</h2></header>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            {messages.length === 0 ? (
              <div className="space-y-2 py-6 text-sm text-muted">
                <p className="font-medium text-ink">Try saying:</p>
                {["What medicines did my doctor prescribe during my previous consultation?", "Can you remind me what my doctor told me during my last visit?", "Do I have an upcoming appointment?"].map((t) => (
                  <p key={t} className="flex gap-2 rounded-xl bg-canvas px-3 py-2"><Mic className="mt-0.5 h-4 w-4 shrink-0 text-brand" />“{t}”</p>))}
              </div>
            ) : messages.map((m) => <MessageBubble key={m.id} m={m} />)}
          </div>
          <div className="border-t border-line p-3"><AssistantDisclaimer /></div>
        </section>
      </div>
    </div>
  );
}
