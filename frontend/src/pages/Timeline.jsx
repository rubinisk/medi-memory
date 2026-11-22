import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, ClipboardList, FileText, FlaskConical, Stethoscope } from "lucide-react";
import { HeartBadge } from "../components/illustrations";
import { EmptyState, ErrorBox, Loading, PageHeader, StatusBadge } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { fmtDate } from "../services/api";

const STYLE = {
  appointment: { icon: CalendarDays, tone: "bg-brand-50 text-brand", link: () => "/app/appointments" },
  consultation: { icon: Stethoscope, tone: "bg-orange-50 text-orange-500", link: (e) => `/app/consultations?open=${e.id}` },
  document: { icon: FileText, tone: "bg-emerald-50 text-emerald-600", link: (e) => `/app/records/${e.id}` },
};
const FILTERS = [["all", "All"], ["consultation", "Consultations"], ["document", "Documents"], ["appointment", "Appointments"]];

export default function Timeline() {
  const { data, loading, error, reload } = useApi("/api/timeline");
  const [filter, setFilter] = useState("all");
  if (loading && !data) return <Loading label="Building your timeline…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const events = data.events.filter((e) => filter === "all" || e.type === filter);
  const i = data.insights;
  const insights = [
    [`${i.consultations} consultation${i.consultations === 1 ? "" : "s"}`, "/app/consultations"],
    [`${i.active_medications} active medication${i.active_medications === 1 ? "" : "s"}`, "/app/medications"],
    [`${i.upcoming_appointments} upcoming appointment${i.upcoming_appointments === 1 ? "" : "s"}`, "/app/appointments"],
    [`${i.documents} document${i.documents === 1 ? "" : "s"} saved`, "/app/records"],
  ];

  return (
    <div>
      <PageHeader title="Your Medical Timeline" subtitle="A complete view of your health journey, built from your own records." />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter timeline">
            {FILTERS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${filter === k ? "bg-brand text-white shadow-sm shadow-brand/30" : "bg-canvas text-muted hover:text-ink"}`}>{l}</button>
            ))}
          </div>
          {events.length === 0 ? <EmptyState icon={ClipboardList} title="Nothing here yet" text="Upload documents or add consultations to build your timeline." /> : (
            <ol className="relative ml-5 space-y-6 border-l-2 border-brand-100 pl-8">
              {events.map((e) => {
                const st = STYLE[e.type];
                const Icon = e.type === "document" && /lab/i.test(e.title) ? FlaskConical : st.icon;
                return (
                  <li key={e.type + e.id} className="relative">
                    <span className={`absolute -left-[54px] top-0 flex h-10 w-10 items-center justify-center rounded-full ring-4 ring-white ${st.tone}`}><Icon className="h-5 w-5" /></span>
                    <Link to={st.link(e)} className="group block rounded-2xl p-1 transition hover:bg-canvas/60">
                      <p className="text-sm font-semibold text-ink">{fmtDate(e.date)}{e.time ? ` · ${e.time}` : ""}</p>
                      <p className="font-semibold text-ink group-hover:text-brand">{e.title}</p>
                      {e.subtitle && <p className="text-sm text-muted">{e.subtitle}</p>}
                      {e.detail && <p className="mt-0.5 text-sm text-brand">{e.detail}</p>}
                      {e.extra && <p className="text-xs text-muted">{e.extra}</p>}
                      {(e.status === "pending_review" || e.status === "upcoming") && <div className="mt-1"><StatusBadge status={e.status === "upcoming" ? "scheduled" : e.status} /></div>}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <aside className="space-y-6">
          <section className="rounded-3xl bg-gradient-to-b from-brand-50 to-white p-5 ring-1 ring-line">
            <h2 className="text-lg font-bold text-ink">Key Insights</h2>
            <ul className="mt-3 space-y-2.5">{insights.map(([t, to]) => (
              <li key={t}><Link to={to} className="flex items-center gap-2 text-sm text-ink hover:text-brand"><CheckCircle2 className="h-5 w-5 text-emerald-500" />{t}</Link></li>))}
            </ul>
            {i.pending_review > 0 && <Link to="/app/records?status=pending_review" className="mt-4 block rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{i.pending_review} document{i.pending_review > 1 ? "s" : ""} awaiting your review →</Link>}
            <p className="mt-4 text-[11px] text-muted">Counts of your saved records. Not a medical assessment.</p>
          </section>
          <section className="flex flex-col items-center rounded-3xl bg-gradient-to-b from-mint-50 to-white p-6 text-center ring-1 ring-line">
            <HeartBadge className="h-16 w-16" />
            <p className="mt-2 text-lg font-bold text-ink">Take care!</p>
            <p className="text-sm text-muted">Your health matters <span className="text-sky-500">♥</span></p>
          </section>
        </aside>
      </div>
    </div>
  );
}
