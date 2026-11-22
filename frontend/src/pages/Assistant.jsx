import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Mic, MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { RobotArt } from "../components/illustrations";
import { AssistantDisclaimer, MessageBubble, ModeBanner, SUGGESTIONS } from "../components/Chat";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { useSpeech } from "../hooks/useSpeech";
import { api, errorMessage, fmtDate } from "../services/api";

export default function Assistant() {
  const sessions = useApi("/api/assistant/sessions", { initial: [] });
  const status = useApi("/api/assistant/status");
  const voice = useApi("/api/voice/status");
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const end = useRef(null);
  const speech = useSpeech((m) => toast.error(m));
  const canSpeak = voice.data?.configured && voice.data?.consent;

  useEffect(() => { end.current?.scrollIntoView?.({ behavior: "smooth" }); }, [messages, busy]);

  const open = async (id) => {
    setError("");
    try { const r = await api.get(`/api/assistant/sessions/${id}`); setSessionId(id); setMessages(r.data.messages); }
    catch (e) { setError(errorMessage(e)); }
  };
  const newChat = () => { setSessionId(null); setMessages([]); setError(""); };

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (question.length < 2) return;
    setQ(""); setBusy(true); setError("");
    setMessages((m) => [...m, { id: "tmp", role: "user", content: question }]);
    try {
      const r = await api.post("/api/assistant/ask", { question, session_id: sessionId, channel: "text" });
      setSessionId(r.data.session_id);
      setMessages((m) => [...m.filter((x) => x.id !== "tmp"), r.data.question, r.data.answer]);
      if (!sessionId) sessions.reload();
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== "tmp"));
      setQ(question);
      setError(errorMessage(e));
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await api.delete(`/api/assistant/sessions/${id}`); if (id === sessionId) newChat(); sessions.reload(); toast.success("Conversation deleted."); }
    catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div>
      <PageHeader title="AI Medical Assistant" subtitle="Ask questions about your medical history in natural language."
        actions={<button className="btn-outline" onClick={newChat}><MessageSquarePlus className="h-4 w-4" /> New conversation</button>} />
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="card hidden max-h-[70vh] overflow-y-auto p-2 lg:block" aria-label="Conversation history">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">History</p>
          {sessions.data.length === 0 && <p className="px-2 py-2 text-xs text-muted">No conversations yet.</p>}
          {sessions.data.map((s) => (
            <div key={s.id} className={`group flex items-center gap-1 rounded-xl ${s.id === sessionId ? "bg-brand-50" : "hover:bg-canvas"}`}>
              <button className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => open(s.id)}>
                <span className="block truncate text-sm text-navy">{s.title}</span>
                <span className="text-[11px] text-muted">{s.channel === "voice" ? "Voice · " : ""}{fmtDate(s.updated_at)}</span>
              </button>
              <button className="mr-1 rounded p-1 text-muted opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete conversation ${s.title}`} onClick={() => remove(s.id)}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </aside>
        <section className="card flex min-h-[68vh] flex-col overflow-hidden">
          <div className="flex items-center gap-4 bg-gradient-to-r from-brand-50 via-white to-mint-50 px-5 py-4">
            <RobotArt className="h-20 w-20 shrink-0 animate-float" />
            <div><h2 className="text-xl font-bold text-ink">MediMemory Assistant</h2>
              <p className="text-sm text-muted">Ask anything about your medical history. Answers come only from your saved records.</p></div>
          </div>
          {status.data?.mode !== "llm" && <div className="px-4 pt-3"><ModeBanner status={status.data} /></div>}
          <div className="flex-1 space-y-4 overflow-y-auto bg-canvas/40 p-5" aria-live="polite">
            {messages.length === 0 && !busy && (
              <EmptyState icon={Bot} title="Ask about your medical history" text="Try one of these questions:"
                action={<div className="flex max-w-2xl flex-wrap justify-center gap-2">{SUGGESTIONS.map((s) => (
                  <button key={s} className="chip bg-white px-3.5 py-2 text-left text-brand-700 ring-1 ring-brand-100 hover:bg-brand-50" onClick={() => ask(s)}>{s}</button>))}</div>} />
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} onSpeak={canSpeak && m.role === "assistant" ? (x) => speech.play(x.id, x.content) : null}
                speaking={speech.playingId === m.id} speakBusy={speech.busyId === m.id} />
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Searching your records…</div>}
            <div ref={end} />
          </div>
          <div className="space-y-2 p-4">
            <ErrorBox message={error} />
            <form className="flex items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-2 pr-1.5 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15" onSubmit={(e) => { e.preventDefault(); ask(); }}>
              <Link to="/app/voice" aria-label="Ask by voice instead" className="rounded-full p-2 text-muted hover:bg-brand-50 hover:text-brand"><Mic className="h-5 w-5" /></Link>
              <label htmlFor="ask" className="sr-only">Your question</label>
              <input id="ask" className="flex-1 bg-transparent px-1 py-2 text-sm text-ink outline-none placeholder:text-muted/70" placeholder="Ask a question…" value={q} maxLength={1000} onChange={(e) => setQ(e.target.value)} disabled={busy} />
              <button className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-md shadow-brand/30 transition hover:bg-brand-600 disabled:opacity-50" disabled={busy || q.trim().length < 2} aria-label="Send question"><Send className="h-4 w-4" /></button>
            </form>
            <AssistantDisclaimer />
          </div>
        </section>
      </div>
    </div>
  );
}
