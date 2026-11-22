import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, List, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Card, ConfirmDialog, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Spinner, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, errorMessage, fmtDate, fmtDateTime, fmtTime, toLocalInput } from "../services/api";
import { MedTabs } from "./Medications";

const blank = { title: "", doctor_name: "", specialty: "", hospital: "", location: "", scheduled_at: "", notes: "", is_follow_up: false, status: "scheduled", reminder_minutes_before: 1440 };

export function validateAppointment(f) {
  const e = {};
  if (f.title.trim().length < 2) e.title = "Enter a title, e.g. “Follow-up with Dr. Rao”.";
  if (!f.scheduled_at) e.scheduled_at = "Choose a date and time.";
  return e;
}

function AppointmentForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState(() => {
    const base = { ...blank };
    Object.keys(blank).forEach((k) => { if (initial?.[k] !== undefined && initial?.[k] !== null) base[k] = initial[k]; });
    base.scheduled_at = initial?.scheduled_at ? toLocalInput(initial.scheduled_at) : "";
    return base;
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    const v = validateAppointment(f);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError("");
    const body = { ...f, reminder_minutes_before: Number(f.reminder_minutes_before), consultation_id: initial?.consultation_id ?? null };
    ["doctor_name", "specialty", "hospital", "location", "notes"].forEach((k) => { if (!body[k]) body[k] = null; });
    try {
      if (initial?.id) await api.put(`/api/appointments/${initial.id}`, body); else await api.post("/api/appointments", body);
      onSaved(initial?.id ? "Appointment updated." : "Appointment added.");
    } catch (e2) { setError(errorMessage(e2)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={initial?.id ? "Edit appointment" : "New appointment"}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" form="apptform" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Save</button></>}>
      <form id="apptform" onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><ErrorBox message={error} /></div>
        <div className="sm:col-span-2"><Field label="Title" htmlFor="a_title" error={errors.title}><input id="a_title" className="input" value={f.title} onChange={set("title")} /></Field></div>
        <Field label="Date and time" htmlFor="a_when" error={errors.scheduled_at}><input id="a_when" type="datetime-local" className="input" value={f.scheduled_at} onChange={set("scheduled_at")} /></Field>
        <Field label="Status" htmlFor="a_status"><select id="a_status" className="input" value={f.status} onChange={set("status")}>
          <option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field>
        <Field label="Doctor" htmlFor="a_doc"><input id="a_doc" className="input" value={f.doctor_name} onChange={set("doctor_name")} /></Field>
        <Field label="Specialty" htmlFor="a_spec"><input id="a_spec" className="input" value={f.specialty} onChange={set("specialty")} /></Field>
        <Field label="Hospital / clinic" htmlFor="a_hosp"><input id="a_hosp" className="input" value={f.hospital} onChange={set("hospital")} /></Field>
        <Field label="Address / location" htmlFor="a_loc"><input id="a_loc" className="input" value={f.location} onChange={set("location")} /></Field>
        <Field label="Remind me" htmlFor="a_rem"><select id="a_rem" className="input" value={f.reminder_minutes_before} onChange={set("reminder_minutes_before")}>
          <option value={60}>1 hour before</option><option value={180}>3 hours before</option><option value={720}>12 hours before</option><option value={1440}>1 day before</option><option value={2880}>2 days before</option></select></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.is_follow_up} onChange={set("is_follow_up")} /> Follow-up visit</label>
        <div className="sm:col-span-2"><Field label="Notes" htmlFor="a_notes"><textarea id="a_notes" rows={3} className="input" value={f.notes} onChange={set("notes")} /></Field></div>
      </form>
    </Modal>
  );
}

function Calendar({ items, onPick }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = useMemo(() => {
    const m = {};
    items.forEach((a) => { const k = new Date(a.scheduled_at).toDateString(); (m[k] ||= []).push(a); });
    return m;
  }, [items]);
  const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = new Date().toDateString();
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button className="rounded-lg p-1.5 hover:bg-canvas" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></button>
        <p className="font-semibold text-navy">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
        <button className="rounded-lg p-1.5 hover:bg-canvas" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const list = byDay[d.toDateString()] || [];
          const inMonth = d.getMonth() === month.getMonth();
          return (
            <div key={d.toISOString()} className={`min-h-[72px] rounded-lg border p-1 text-left ${inMonth ? "border-line bg-white" : "border-transparent bg-canvas/60 text-muted"} ${d.toDateString() === today ? "ring-2 ring-teal" : ""}`}>
              <span className="text-[11px] font-semibold">{d.getDate()}</span>
              {list.slice(0, 2).map((a) => (
                <button key={a.id} onClick={() => onPick(a)} className={`mt-0.5 block w-full truncate rounded px-1 text-left text-[10px] font-medium ${a.status === "cancelled" ? "bg-canvas text-muted line-through" : "bg-teal-50 text-teal-700"}`}>
                  {fmtTime(a.scheduled_at)} {a.title}</button>
              ))}
              {list.length > 2 && <span className="text-[10px] text-muted">+{list.length - 2} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Appointments() {
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useApi("/api/appointments", { initial: [] });
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { if (params.get("new")) { setEditing({}); params.delete("new"); setParams(params, { replace: true }); } }, []); // eslint-disable-line

  const now = new Date();
  const upcoming = data.filter((a) => new Date(a.scheduled_at) >= now);
  const past = data.filter((a) => new Date(a.scheduled_at) < now).reverse();
  const saved = (m) => { setEditing(null); toast.success(m); reload(); };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/api/appointments/${del.id}`); toast.success("Appointment deleted."); setDel(null); reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  const Row = (a) => (
    <li key={a.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex w-16 flex-col items-center rounded-2xl bg-brand-50 py-2 text-brand">
        <span className="text-[10px] font-semibold uppercase">{new Date(a.scheduled_at).toLocaleDateString("en-GB", { month: "short" })}</span>
        <span className="text-lg font-bold leading-none">{new Date(a.scheduled_at).getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy">{a.title}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtDateTime(a.scheduled_at)}</span>
          {a.hospital && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{a.hospital}</span>}
          {a.doctor_name && <span>{a.doctor_name}</span>}
        </p>
        {a.notes && <p className="mt-1 text-xs text-muted">{a.notes}</p>}
        <div className="mt-1 flex gap-1.5"><StatusBadge status={a.status} />{a.is_follow_up && <Badge color="mint">Follow-up</Badge>}</div>
      </div>
      <div className="flex gap-1">
        <button className="btn-ghost px-2 py-1.5" aria-label={`Edit ${a.title}`} onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></button>
        <button className="btn-ghost px-2 py-1.5 text-red-600" aria-label={`Delete ${a.title}`} onClick={() => setDel(a)}><Trash2 className="h-4 w-4" /></button>
      </div>
    </li>
  );

  return (
    <div>
      <PageHeader title="Appointments" subtitle="Upcoming visits, tests and follow-ups."
        actions={<>
          <div className="inline-flex rounded-xl border border-line bg-white p-0.5" role="tablist">
            <button role="tab" aria-selected={view === "list"} className={`rounded-lg px-3 py-1.5 text-sm ${view === "list" ? "bg-navy text-white" : "text-navy"}`} onClick={() => setView("list")}><List className="inline h-4 w-4" /> List</button>
            <button role="tab" aria-selected={view === "calendar"} className={`rounded-lg px-3 py-1.5 text-sm ${view === "calendar" ? "bg-navy text-white" : "text-navy"}`} onClick={() => setView("calendar")}><CalendarDays className="inline h-4 w-4" /> Calendar</button>
          </div>
          <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> New appointment</button></>} />
      <MedTabs active="appointments" />
      <ErrorBox message={error} onRetry={reload} />
      {loading ? <Loading /> : view === "calendar" ? <Card><Calendar items={data} onPick={setEditing} /></Card> : (
        <div className="space-y-6">
          <Card title={`Upcoming (${upcoming.length})`} bodyClass="p-0">
            {upcoming.length === 0 ? <EmptyState icon={CalendarDays} title="No upcoming appointments" action={<button className="btn-primary" onClick={() => setEditing({})}>Add appointment</button>} />
              : <ul className="divide-y divide-line">{upcoming.map(Row)}</ul>}
          </Card>
          <Card title={`Previous (${past.length})`} bodyClass="p-0">
            {past.length === 0 ? <EmptyState icon={CalendarDays} title="No previous appointments" /> : <ul className="divide-y divide-line">{past.map(Row)}</ul>}
          </Card>
        </div>
      )}
      {editing && <AppointmentForm initial={editing} onClose={() => setEditing(null)} onSaved={saved} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} busy={busy} onConfirm={remove} title="Delete appointment?" text={`“${del?.title}” on ${fmtDate(del?.scheduled_at)} will be removed.`} />
    </div>
  );
}
