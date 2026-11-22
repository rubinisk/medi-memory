import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlarmClock, ArrowRight, AudioLines, Bell, Bot, CalendarDays, CalendarPlus, Check, ClipboardList, Download, FileText, FileUp, FolderOpen,
  Pill, Stethoscope, UserRound, X,
} from "lucide-react";
import { CalendarPillsArt, HeartPulseArt } from "../components/illustrations";
import { Card, EmptyState, ErrorBox, Loading, StatCard, StatusBadge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { downloadDocument } from "./Records";
import { api, DOC_TYPES, errorMessage, fmtDate, fmtDateTime, fmtTime } from "../services/api";

const TIMELINE_ICON = { consultation: Stethoscope, document: FileText, appointment: CalendarDays };
const TIMELINE_LINK = { consultation: (id) => `/app/consultations?open=${id}`, document: (id) => `/app/records/${id}`, appointment: () => "/app/appointments" };

const ACTIVITY = {
  "document.upload": ["Document uploaded", FileUp, "bg-brand-50 text-brand"],
  "document.confirm": ["Document reviewed and confirmed", Check, "bg-emerald-50 text-emerald-600"],
  "consultation.create": ["Consultation added", Stethoscope, "bg-orange-50 text-orange-500"],
  "consultation.update": ["Consultation updated", Stethoscope, "bg-orange-50 text-orange-500"],
  "medication.create": ["Medication added", Pill, "bg-red-50 text-red-500"],
  "medication.update": ["Medication updated", Pill, "bg-red-50 text-red-500"],
  "reminder.taken": ["Dose marked as taken", Check, "bg-emerald-50 text-emerald-600"],
  "reminder.missed": ["Dose marked as missed", X, "bg-red-50 text-red-500"],
  "appointment.create": ["Appointment added", CalendarDays, "bg-brand-50 text-brand"],
  "appointment.update": ["Appointment updated", CalendarDays, "bg-brand-50 text-brand"],
  "assistant.ask": ["Asked the AI assistant", Bot, "bg-brand-50 text-brand"],
  "voice.transcribe": ["Asked by voice", AudioLines, "bg-teal-50 text-teal"],
  "caregiver.invite": ["Caregiver invited", UserRound, "bg-brand-50 text-brand"],
  "auth.login": ["Signed in", UserRound, "bg-canvas text-muted"],
};

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${s >= 7200 ? "s" : ""} ago`;
  const d = Math.floor(s / 86400);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi("/api/dashboard");
  const history = useApi("/api/reminders/history?days=7", { initial: [] });
  const activity = useApi("/api/audit-logs?limit=40", { initial: [] });
  const [busyId, setBusyId] = useState(null);

  const mark = async (r, status) => {
    setBusyId(r.id);
    try {
      await api.patch(`/api/reminders/${r.id}`, { status });
      toast.success(status === "taken" ? `${r.title} marked as taken.` : "Reminder updated.");
      reload(); history.reload(); activity.reload();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusyId(null); }
  };

  if (loading && !data) return <Loading label="Loading your overview…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const d = data;
  const first = user.full_name.split(" ")[0];
  const chart = history.data.map((x) => ({ ...x, day: fmtDate(x.date, { weekday: "short" }) }));
  const empty = d.counts.documents + d.counts.consultations + d.counts.active_medications === 0;
  const next = d.upcoming_appointments[0];
  const acts = activity.data.filter((a) => ACTIVITY[a.action]).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-3xl bg-hero-soft px-6 py-6 sm:px-8">
        <div className="relative z-10 max-w-2xl">
          <p className="text-sm font-medium text-teal-700">{greeting()}</p>
          <h1 className="mt-0.5 text-2xl font-bold text-ink sm:text-3xl">Welcome back, {first}! <span aria-hidden="true">👋</span></h1>
          <p className="mt-1 text-muted">Your health. Our priority.</p>
          <p className="mt-3 text-sm text-muted">
            {d.patient.age ? `${d.patient.age} years` : <Link to="/app/settings" className="font-semibold text-brand">Add your date of birth</Link>}
            {d.patient.blood_group ? ` · Blood group ${d.patient.blood_group}` : ""}
            {d.patient.emergency_contact ? ` · Emergency contact: ${d.patient.emergency_contact}` : ""}
          </p>
        </div>
        <HeartPulseArt className="absolute -right-2 top-1/2 hidden h-36 w-48 -translate-y-1/2 sm:block" />
      </section>

      {d.counts.pending_review > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span><b>{d.counts.pending_review}</b> uploaded document{d.counts.pending_review > 1 ? "s are" : " is"} awaiting your review. Extracted details aren't part of your history until you confirm them.</span>
          <Link to="/app/records?status=pending_review" className="font-semibold underline">Review now</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={FolderOpen} label="Total Records" value={d.counts.documents} tone="blue" to="/app/records" />
        <StatCard icon={Pill} label="Medications" value={d.counts.active_medications} tone="orange" to="/app/medications" />
        <StatCard icon={CalendarDays} label="Upcoming Appointments" value={d.counts.upcoming_appointments} tone="green" to="/app/appointments" />
        <StatCard icon={Stethoscope} label="Consultations" value={d.counts.consultations} tone="blue" to="/app/consultations" />
      </div>

      {empty && (
        <Card><EmptyState icon={ClipboardList} title="Your medical memory is empty" text="Start by uploading a prescription or report, or add a consultation manually."
          action={<div className="flex gap-2"><Link to="/app/records/upload" className="btn-primary">Upload a document</Link><Link to="/app/consultations?new=1" className="btn-outline">Add consultation</Link></div>} /></Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stay on track */}
        <section className="relative flex min-h-[200px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-white to-mint-50 p-6 ring-1 ring-line">
          <div className="relative z-10 max-w-[60%]">
            <h2 className="text-lg font-bold text-ink">Stay on track!</h2>
            <p className="mt-1 text-sm text-muted">Take your medicine on time and keep your health in check.</p>
            <p className="mt-3 text-sm font-semibold text-ink">{d.todays_reminders.filter((r) => r.kind === "medication" && r.status === "taken").length} of {d.todays_reminders.filter((r) => r.kind === "medication").length} doses taken today</p>
          </div>
          <Link to="/app/medications" className="btn-brand relative z-10 mt-4 w-fit">View Medications <ArrowRight className="h-4 w-4" /></Link>
          <CalendarPillsArt className="absolute -right-3 bottom-2 h-32 w-36 animate-float" />
        </section>

        {/* Upcoming appointment */}
        <Card title="Upcoming Appointment" icon={CalendarDays} action={<Link to="/app/appointments?new=1" className="link-more"><CalendarPlus className="h-3.5 w-3.5" /> Add</Link>}>
          {!next ? <EmptyState icon={CalendarDays} title="Nothing scheduled" /> : (
            <div>
              <div className="flex items-center gap-4">
                <span className="icon-tile h-14 w-14 rounded-full bg-brand-50 text-brand"><UserRound className="h-7 w-7" /></span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{next.doctor_name || next.title}</p>
                  <p className="truncate text-xs text-muted">{next.doctor_name ? next.title : next.hospital}</p>
                  <p className="mt-1 text-sm font-medium text-brand">{fmtDateTime(next.scheduled_at)}</p>
                </div>
              </div>
              {next.hospital && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs text-muted">{next.hospital}{next.is_follow_up ? " · Follow-up visit" : ""}</p>}
              {d.upcoming_appointments.length > 1 && <p className="mt-2 text-xs text-muted">+{d.upcoming_appointments.length - 1} more upcoming</p>}
              <Link to="/app/appointments" className="link-more mt-3">View Calendar <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          )}
        </Card>

        {/* Today's reminders */}
        <Card title="Today's Reminders" icon={AlarmClock} bodyClass="p-0" action={<Link to="/app/medications" className="link-more">View All <ArrowRight className="h-3.5 w-3.5" /></Link>}>
          {d.todays_reminders.length === 0 ? (
            <EmptyState icon={Bell} title="No reminders today" text="Reminders appear for active medicines with scheduled times." />
          ) : (
            <ul className="max-h-64 divide-y divide-line overflow-y-auto px-2 pb-2">
              {d.todays_reminders.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className={`icon-tile h-9 w-9 rounded-xl ${r.status === "taken" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-500"}`}>
                    {r.status === "taken" ? <Check className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{fmtTime(r.due_at)}{r.detail ? ` · ${r.detail}` : ""}</span>
                  </span>
                  {r.kind === "medication" && r.status === "pending" ? (
                    <span className="flex gap-1">
                      <button className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" aria-label={`Mark ${r.title} taken`} disabled={busyId === r.id} onClick={() => mark(r, "taken")}><Check className="h-4 w-4" /></button>
                      <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" aria-label={`Mark ${r.title} missed`} disabled={busyId === r.id} onClick={() => mark(r, "missed")}><X className="h-4 w-4" /></button>
                    </span>
                  ) : <StatusBadge status={r.status} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Health Timeline" icon={ClipboardList} className="lg:col-span-2" action={<Link to="/app/timeline" className="link-more">Full timeline <ArrowRight className="h-3.5 w-3.5" /></Link>}>
          {d.timeline.length === 0 ? <EmptyState icon={ClipboardList} title="No activity yet" /> : (
            <ol className="relative space-y-4 border-l-2 border-brand-100 pl-6">
              {d.timeline.slice(0, 6).map((t) => {
                const Icon = TIMELINE_ICON[t.type];
                return (
                  <li key={t.type + t.id} className="relative">
                    <span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 ring-4 ring-white"><Icon className="h-3.5 w-3.5 text-brand" /></span>
                    <Link to={TIMELINE_LINK[t.type](t.id)} className="group block">
                      <p className="text-xs font-medium text-brand">{fmtDate(t.date)}</p>
                      <p className="text-sm font-semibold text-ink group-hover:text-brand">{t.title}</p>
                      {t.subtitle && <p className="text-xs text-muted">{t.subtitle}</p>}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Quick Actions">
            <div className="space-y-2">
              {[["/app/records/upload", "Upload Document", FileUp, "bg-brand-50 text-brand"], ["/app/assistant", "Ask AI Assistant", Bot, "bg-teal-50 text-teal"],
                ["/app/voice", "Ask by Voice", AudioLines, "bg-sky-50 text-sky-600"], ["/app/medications", "View Medications", Pill, "bg-orange-50 text-orange-500"]].map(([to, label, Icon, tone]) => (
                <Link key={to} to={to} className="flex items-center gap-3 rounded-xl border border-line/70 px-3 py-2.5 text-sm font-medium text-ink transition hover:border-brand/40 hover:bg-brand-50/40">
                  <span className={`icon-tile h-8 w-8 rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>{label}<ArrowRight className="ml-auto h-4 w-4 text-muted" />
                </Link>
              ))}
            </div>
          </Card>
          <Card title="Recent Activity">
            {acts.length === 0 ? <p className="text-sm text-muted">No recent activity.</p> : (
              <ul className="space-y-3">{acts.map((a) => {
                const [label, Icon, tone] = ACTIVITY[a.action];
                return (
                  <li key={a.id} className="flex items-center gap-3">
                    <span className={`icon-tile h-9 w-9 rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
                    <span><span className="block text-sm font-medium text-ink">{label}</span><span className="text-xs text-muted">{timeAgo(a.created_at)}</span></span>
                  </li>
                );
              })}</ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Medication log, last 7 days" icon={Pill} className="lg:col-span-2">
          {history.loading ? <Loading /> : chart.every((x) => x.scheduled === 0) ? (
            <EmptyState icon={Pill} title="No scheduled doses yet" text="This chart shows doses you mark as taken or missed." />
          ) : (
            <div className="h-56" role="img" aria-label="Bar chart of doses taken, missed and not recorded over the last 7 days">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#E2EAF3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip cursor={{ fill: "#F3F8FC" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="taken" name="Taken" stackId="a" fill="#12A39F" />
                  <Bar dataKey="missed" name="Missed" stackId="a" fill="#F97366" />
                  <Bar dataKey="not_recorded" name="Not recorded" stackId="a" fill="#C9D8EA" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">Based only on what you've marked. This is a personal log, not a medical assessment.</p>
        </Card>
        <Card title="Recent Documents" icon={FileText} bodyClass="px-2 pb-2" action={<Link to="/app/records" className="link-more">View All <ArrowRight className="h-3.5 w-3.5" /></Link>}>
          {d.recent_documents.length === 0 ? <EmptyState icon={FileText} title="No documents yet" /> : (
            <ul>{d.recent_documents.map((x) => (
              <li key={x.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas">
                <span className="icon-tile h-9 w-9 rounded-xl bg-red-50 text-[10px] font-bold text-red-500">{x.mime_type === "application/pdf" ? "PDF" : x.mime_type === "text/plain" ? "TXT" : "IMG"}</span>
                <Link to={`/app/records/${x.id}`} className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{x.title}</span>
                  <span className="text-xs text-muted">{DOC_TYPES[x.doc_type]} · {fmtDate(x.created_at)}</span></Link>
                <button className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-brand" aria-label={`Download ${x.title}`}
                  onClick={() => downloadDocument(x, toast)}><Download className="h-4 w-4" /></button>
              </li>))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
