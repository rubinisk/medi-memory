import { useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, CalendarDays, Check, ChevronLeft, ChevronRight, Moon, Pencil, Pill, Plus, Sun, Trash2, X } from "lucide-react";
import { Badge, ConfirmDialog, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Spinner, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, errorMessage, fmtDate, fmtTime, todayISO } from "../services/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const blank = { name: "", dosage: "", frequency: "", start_date: "", end_date: "", instructions: "", prescribed_by: "", is_active: true, schedules: [] };

export function validateMedication(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = "Enter the medicine name.";
  if (!f.dosage.trim()) e.dosage = "Enter the dosage exactly as prescribed.";
  if (!f.frequency.trim()) e.frequency = "Enter how often it was prescribed.";
  if (f.start_date && f.end_date && f.end_date < f.start_date) e.end_date = "End date can't be before the start date.";
  if (f.schedules.some((s) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time_of_day))) e.schedules = "Each reminder needs a valid time.";
  return e;
}

function MedicationForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ ...blank, ...initial, start_date: initial?.start_date || "", end_date: initial?.end_date || "",
    instructions: initial?.instructions || "", prescribed_by: initial?.prescribed_by || "",
    schedules: (initial?.schedules || []).map((s) => ({ time_of_day: s.time_of_day, label: s.label || "", days_of_week: s.days_of_week || "" })) }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const setSched = (i, patch) => setF({ ...f, schedules: f.schedules.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const save = async (e) => {
    e.preventDefault();
    const v = validateMedication(f);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError("");
    const body = { ...f, start_date: f.start_date || null, end_date: f.end_date || null, instructions: f.instructions || null, prescribed_by: f.prescribed_by || null,
      consultation_id: initial?.consultation_id ?? null,
      schedules: f.schedules.map((s) => ({ time_of_day: s.time_of_day, label: s.label || null, days_of_week: s.days_of_week || null })) };
    try {
      if (initial?.id) await api.put(`/api/medications/${initial.id}`, body); else await api.post("/api/medications", body);
      onSaved(initial?.id ? "Medication updated." : "Medication added.");
    } catch (e2) { setError(errorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={initial?.id ? "Edit medication" : "Add medication"} wide
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" form="medform" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Save</button></>}>
      <form id="medform" onSubmit={save} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <p className="rounded-xl bg-mint-50 p-3 text-xs text-teal-700">Enter the dose and frequency exactly as your doctor prescribed. MediMemory never suggests or changes doses.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Medicine name" htmlFor="m_name" error={errors.name}><input id="m_name" className="input" value={f.name} onChange={set("name")} /></Field>
          <Field label="Dosage (as prescribed)" htmlFor="m_dose" error={errors.dosage}><input id="m_dose" className="input" placeholder="e.g. 500 mg" value={f.dosage} onChange={set("dosage")} /></Field>
          <Field label="Frequency" htmlFor="m_freq" error={errors.frequency}><input id="m_freq" className="input" placeholder="e.g. Twice daily" value={f.frequency} onChange={set("frequency")} /></Field>
          <Field label="Prescribed by" htmlFor="m_by"><input id="m_by" className="input" value={f.prescribed_by} onChange={set("prescribed_by")} /></Field>
          <Field label="Start date" htmlFor="m_start"><input id="m_start" type="date" className="input" value={f.start_date} onChange={set("start_date")} /></Field>
          <Field label="End date" htmlFor="m_end" error={errors.end_date}><input id="m_end" type="date" className="input" value={f.end_date} onChange={set("end_date")} /></Field>
          <div className="sm:col-span-2"><Field label="Doctor's instructions" htmlFor="m_instr"><input id="m_instr" className="input" placeholder="e.g. After food" value={f.instructions} onChange={set("instructions")} /></Field></div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between"><span className="label mb-0">Reminder schedule</span>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setF({ ...f, schedules: [...f.schedules, { time_of_day: "08:00", label: "", days_of_week: "" }] })}><Plus className="h-3.5 w-3.5" /> Add time</button></div>
          {errors.schedules && <p className="mb-1 text-xs text-red-600">{errors.schedules}</p>}
          {f.schedules.length === 0 && <p className="rounded-xl bg-canvas px-3 py-2 text-xs text-muted">No reminder times. Add one to get daily reminders.</p>}
          <div className="space-y-2">{f.schedules.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2">
              <input type="time" aria-label="Reminder time" className="input w-32" value={s.time_of_day} onChange={(e) => setSched(i, { time_of_day: e.target.value })} />
              <input className="input min-w-[8rem] flex-1" aria-label="Reminder label" placeholder="Label, e.g. After breakfast" value={s.label} onChange={(e) => setSched(i, { label: e.target.value })} />
              <div className="flex gap-1" role="group" aria-label="Days (none selected = every day)">
                {DAYS.map((d, di) => {
                  const on = (s.days_of_week || "").split(",").includes(String(di));
                  return <button type="button" key={d} aria-pressed={on} className={`h-8 w-9 rounded-lg text-[11px] font-semibold ${on ? "bg-teal text-white" : "bg-canvas text-muted"}`}
                    onClick={() => { const cur = new Set((s.days_of_week || "").split(",").filter(Boolean)); on ? cur.delete(String(di)) : cur.add(String(di));
                      setSched(i, { days_of_week: [...cur].sort().join(",") }); }}>{d}</button>;
                })}
              </div>
              <button type="button" aria-label="Remove time" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" onClick={() => setF({ ...f, schedules: f.schedules.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
            </div>))}
          </div>
          <p className="mt-1 text-xs text-muted">No days selected means every day.</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Currently taking this medicine</label>
      </form>
    </Modal>
  );
}

export default function Medications() {
  const meds = useApi("/api/medications", { initial: [] });
  const [day, setDay] = useState(todayISO());
  const timeline = useApi(`/api/reminders/today?day=${day}`, { initial: [] });
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const shift = (n) => { const d = new Date(day + "T00:00:00"); d.setDate(d.getDate() + n); setDay(todayISO(d)); };
  const saved = (msg) => { setEditing(null); toast.success(msg); meds.reload(); timeline.reload(); };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/api/medications/${del.id}`); toast.success("Medication deleted."); setDel(null); meds.reload(); timeline.reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const mark = async (r, status) => {
    try { await api.patch(`/api/reminders/${r.id}`, { status }); timeline.reload(); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  const enableNotifications = async () => {
    if (!("Notification" in window)) return toast.error("This browser doesn't support notifications.");
    const p = await Notification.requestPermission();
    p === "granted" ? toast.success("Browser notifications enabled while MediMemory is open.") : toast.info("Notifications not enabled. In-app reminders will still appear.");
  };

  const active = meds.data.filter((m) => m.is_active);
  const inactive = meds.data.filter((m) => !m.is_active);
  const tones = ["bg-orange-50 text-orange-500", "bg-red-50 text-red-500", "bg-brand-50 text-brand", "bg-emerald-50 text-emerald-600"];
  const MedRow = (m, idx) => (
    <li key={m.id} className="flex flex-col gap-3 rounded-2xl border border-line/70 p-4 transition hover:border-brand/30 hover:shadow-card sm:flex-row sm:items-center">
      <span className={`icon-tile h-12 w-12 ${m.is_active ? tones[idx % tones.length] : "bg-canvas text-muted"}`}><Pill className="h-6 w-6" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{m.name} <span className="font-medium text-ink/80">{m.dosage}</span></p>
        <p className="text-sm text-muted">{m.frequency}{m.instructions ? ` · ${m.instructions}` : ""}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {m.schedules.map((s) => <Badge key={s.id} color="navy">{s.time_of_day}{s.days_of_week ? ` · ${s.days_of_week.split(",").map((d) => DAYS[d]).join("/")}` : ""}</Badge>)}
          {m.prescribed_by && <Badge color="gray">{m.prescribed_by}</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-4 sm:w-64 sm:justify-end">
        <span className={`chip ${m.is_active ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-muted"}`}>{m.is_active ? "Active" : "Completed"}</span>
        <span className="text-xs text-muted">Until: {m.end_date ? fmtDate(m.end_date) : "Ongoing"}</span>
        <span className="flex gap-1">
          <button className="rounded-lg border border-line p-2 text-brand hover:bg-brand-50" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></button>
          <button className="rounded-lg border border-line p-2 text-red-500 hover:bg-red-50" aria-label={`Delete ${m.name}`} onClick={() => setDel(m)}><Trash2 className="h-4 w-4" /></button>
        </span>
      </div>
    </li>
  );
  const hourIcon = (iso) => { const h = new Date(iso).getHours(); return h < 17 ? Sun : Moon; };

  return (
    <div>
      <PageHeader title="My Medications" subtitle="Track your medications exactly as prescribed and set reminders."
        actions={<><button className="btn-outline" onClick={enableNotifications}><BellRing className="h-4 w-4" /> Browser notifications</button>
          <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Add medication</button></>} />
      <MedTabs active="medications" />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <ErrorBox message={meds.error} onRetry={meds.reload} />
          <section className="card p-5">
            <h2 className="section-title mb-4">Active ({active.length})</h2>
            {meds.loading ? <Loading /> : active.length === 0 ? <EmptyState icon={Pill} title="No active medications" text="Add one manually or confirm a prescription you uploaded." action={<button className="btn-primary" onClick={() => setEditing({})}>Add medication</button>} />
              : <ul className="space-y-3">{active.map(MedRow)}</ul>}
          </section>
          {inactive.length > 0 && <section className="card p-5"><h2 className="section-title mb-4">Past medications ({inactive.length})</h2><ul className="space-y-3 opacity-90">{inactive.map(MedRow)}</ul></section>}
        </div>
        <section className="card h-fit p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Upcoming Reminders</h2>
            <div className="flex items-center gap-1">
              <button className="rounded-lg p-1 hover:bg-canvas" aria-label="Previous day" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></button>
              <input type="date" className="rounded-lg border border-line px-2 py-1 text-xs" aria-label="Choose day" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
              <button className="rounded-lg p-1 hover:bg-canvas" aria-label="Next day" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          {timeline.loading ? <Loading /> : timeline.data.length === 0 ? <EmptyState icon={BellRing} title="Nothing scheduled" text={`No reminders on ${fmtDate(day)}.`} /> : (
            <ul className="space-y-2.5">
              {timeline.data.map((r) => {
                const Icon = r.kind === "appointment" ? CalendarDays : hourIcon(r.due_at);
                return (
                  <li key={r.id} className="rounded-2xl border border-line/70 p-3">
                    <div className="flex items-center gap-3">
                      <span className={`icon-tile h-10 w-10 rounded-full ${r.kind === "appointment" ? "bg-brand-50 text-brand" : r.status === "taken" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-500"}`}><Icon className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{fmtTime(r.due_at)}</p><p className="truncate text-sm text-muted">{r.title}</p></div>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.kind === "medication" && day <= todayISO() && (
                      <div className="ml-[52px] mt-2 flex gap-1">
                        <button className="btn-outline px-2.5 py-1 text-xs" onClick={() => mark(r, "taken")} disabled={r.status === "taken"}><Check className="h-3 w-3" /> Taken</button>
                        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => mark(r, "missed")} disabled={r.status === "missed"}><X className="h-3 w-3" /> Missed</button>
                      </div>)}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">Reminders pop up inside MediMemory while it's open (checked every minute).</p>
        </section>
      </div>
      <div className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-50 px-5 py-4 text-sm text-ink ring-1 ring-brand-100">
        <span className="icon-tile h-10 w-10 rounded-full bg-amber-100 text-amber-500"><BellRing className="h-5 w-5" /></span>
        Stay consistent with your medication schedule! <span className="text-brand">♥</span>
      </div>
      {editing && <MedicationForm initial={editing} onClose={() => setEditing(null)} onSaved={saved} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} busy={busy} onConfirm={remove} title="Delete medication?" text={`${del?.name} and its reminders will be removed.`} />
    </div>
  );
}

export function MedTabs({ active }) {
  return (
    <div className="mb-6 flex gap-2 border-b border-line" role="tablist" aria-label="Medications and appointments">
      {[["medications", "/app/medications", "Medications", Pill], ["appointments", "/app/appointments", "Appointments", CalendarDays]].map(([k, to, label, Icon]) => (
        <Link key={k} to={to} role="tab" aria-selected={active === k}
          className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${active === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}>
          <Icon className="h-4 w-4" />{label}</Link>
      ))}
    </div>
  );
}
