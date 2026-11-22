import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, FileText, Info, Pause, SearchX, ShieldAlert, UserRound, Volume2 } from "lucide-react";
import { RobotArt } from "./illustrations";
import { Badge, Spinner } from "./ui";
import { fmtDate } from "../services/api";

const TYPE = {
  grounded: { color: "teal", label: "From your records", icon: FileText },
  not_found: { color: "gray", label: "Not in your records", icon: SearchX },
  explanation: { color: "navy", label: "General explanation (not from your records)", icon: BookOpen },
  safety: { color: "amber", label: "Safety notice", icon: ShieldAlert },
};

const SOURCE_LINK = {
  document: (s) => `/app/records/${s.source_id}`,
  consultation: (s) => `/app/consultations?open=${s.source_id}`,
  medication: () => "/app/medications",
  appointment: () => "/app/appointments",
};

export function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;
  return (
    <div className="mt-3 border-t border-line pt-2">
      <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand" onClick={() => setOpen(!open)} aria-expanded={open}>
        <FileText className="h-3.5 w-3.5" /> {open ? "Hide source" : "View source"}{sources.length > 1 ? `s (${sources.length})` : ""}
      </button>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {sources.map((s, i) => (
          <Link key={i} to={SOURCE_LINK[s.source_type]?.(s) || "#"} className="chip bg-canvas text-brand-700 ring-1 ring-line hover:ring-brand">
            {s.label}{s.date ? ` · ${fmtDate(s.date)}` : ""}
            {s.status !== "confirmed" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">awaiting confirmation</span>}
          </Link>
        ))}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <blockquote key={i} className="rounded-lg bg-white p-2.5 text-xs text-muted ring-1 ring-line">
              <p className="mb-1 font-semibold text-navy">{s.label}</p>{s.excerpt}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ m, onSpeak, speaking, speakBusy }) {
  if (m.role === "user") {
    return (
      <div className="flex items-end justify-end gap-2">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-50 px-4 py-3 text-sm text-ink ring-1 ring-brand-100">{m.content}</div>
        <span className="icon-tile h-9 w-9 rounded-full bg-brand-100 text-brand"><UserRound className="h-5 w-5" /></span>
      </div>
    );
  }
  const t = TYPE[m.answer_type] || TYPE.grounded;
  const Icon = t.icon;
  return (
    <div className="flex items-start gap-2">
      <span className="icon-tile h-9 w-9 rounded-full bg-gradient-to-br from-brand-50 to-mint-50 ring-1 ring-brand-100"><RobotArt className="h-8 w-8" /></span>
      <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm text-ink shadow-card ring-1 ring-line/70">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge color={t.color}><Icon className="h-3 w-3" /> {t.label}</Badge>
          {m.generator === "extractive" && <Badge color="gray" className="font-normal">Quoted from records</Badge>}
          {m.generator === "llm" && <Badge color="gray" className="font-normal">AI-worded answer</Badge>}
          {onSpeak && (
            <button className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand disabled:opacity-50" onClick={() => onSpeak(m)} disabled={speakBusy}
              aria-label={speaking ? "Pause reading" : "Read this answer aloud"}>
              {speakBusy ? <Spinner className="h-3.5 w-3.5" /> : speaking ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {speaking ? "Pause" : "Listen"}
            </button>
          )}
        </div>
        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
        <Sources sources={m.sources} />
      </div>
    </div>
  );
}

export function AssistantDisclaimer() {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-muted"><Info className="mt-0.5 h-3 w-3 shrink-0" />
      Answers come only from your saved records. MediMemory doesn't diagnose or change medicines. For medical decisions, talk to your doctor.</p>
  );
}

export function ModeBanner({ status }) {
  if (!status) return null;
  if (status.mode === "llm") return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs text-muted">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      {status.llm_configured
        ? <span>AI wording is off because AI processing isn't enabled in <Link to="/app/settings" className="font-semibold text-teal">Settings</Link>. Answers quote your records directly.</span>
        : <span>No LLM provider is configured on the server (LLM_API_KEY). Answers quote the most relevant parts of your records directly, with sources.</span>}
    </div>
  );
}

export const SUGGESTIONS = [
  "What medicines did my doctor prescribe during my previous consultation?",
  "When was my previous consultation?",
  "What did my previous blood report mention?",
  "What instructions did my doctor give me?",
  "Do I have an upcoming appointment?",
  "Summarize my last consultation.",
  "Explain HbA1c in simple English.",
];
