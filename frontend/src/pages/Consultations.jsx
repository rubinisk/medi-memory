import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, FileText, Pencil, Pill, Plus, Search, Stethoscope, Trash2 } from "lucide-react";
import { Badge, Card, ConfirmDialog, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Spinner, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, errorMessage, fmtDate, todayISO } from "../services/api";

export function validateConsultation(f) {
  const e = {};
  if (f.doctor_name.trim().length < 2) e.doctor_name = "Enter the doctor's name.";
  if (!f.consultation_date) e.consultation_date = "Choose the consultation date.";
  else if (f.consultation_date > todayISO()) e.consultation_date = "Consultation date can't be in the future.";
  if (f.follow_up_date && f.consultation_date && f.follow_up_date < f.consultation_date) e.follow_up_date = "Follow-up must be after the consultation.";
  return e;
}

function ConsultationForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState({
    doctor_name: initial?.doctor_name || "", specialty: initial?.specialty || "", clinic: initial?.clinic || "",
    consultation_date: initial?.consultation_date || todayISO(), symptoms: initial?.symptoms || "", doctor_notes: initial?.doctor_notes || "",
    recommended_tests: initial?.recommended_tests || "", follow_up_date: initial?.follow_up_date || "",
    instructions: (initial?.instructions || []).map((i) => i.text),
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    const v = validateConsultation(f);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError("");
    const body = { ...f, follow_up_date: f.follow_up_date || null, instructions: f.instructions.filter((x) => x.trim()) };
    ["specialty", "clinic", "symptoms", "doctor_notes", "recommended_tests"].forEach((k) => { if (!body[k]) body[k] = null; });
    try {
      const r = initial?.id ? await api.put(`/api/consultations/${initial.id}`, body) : await api.post("/api/consultations", body);
      onSaved(r.data, initial?.id ? "Consultation updated." : "Consultation saved.");
    } catch (e2) { setError(errorMessage(e2)); } finally { setBusy(false); }
  };
  return (
    <Modal open wide onClose={onClose} title={initial?.id ? "Edit consultation" : "Record a consultation"}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" form="consform" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Save</button></>}>
      <form id="consform" onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><ErrorBox message={error} /></div>
        <Field label="Doctor's name" htmlFor="c_doc" error={errors.doctor_name}><input id="c_doc" className="input" value={f.doctor_name} onChange={set("doctor_name")} /></Field>
        <Field label="Specialty" htmlFor="c_spec"><input id="c_spec" className="input" value={f.specialty} onChange={set("specialty")} /></Field>
        <Field label="Hospital / clinic" htmlFor="c_clinic"><input id="c_clinic" className="input" value={f.clinic} onChange={set("clinic")} /></Field>
        <Field label="Consultation date" htmlFor="c_date" error={errors.consultation_date}><input id="c_date" type="date" className="input" value={f.consultation_date} onChange={set("consultation_date")} /></Field>
        <div className="sm:col-span-2"><Field label="Your symptoms or concerns" htmlFor="c_sym"><textarea id="c_sym" rows={2} className="input" value={f.symptoms} onChange={set("symptoms")} /></Field></div>
        <div className="sm:col-span-2"><Field label="Doctor's notes" htmlFor="c_notes"><textarea id="c_notes" rows={3} className="input" value={f.doctor_notes} onChange={set("doctor_notes")} /></Field></div>
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between"><span className="label mb-0">Doctor's instructions</span>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setF({ ...f, instructions: [...f.instructions, ""] })}><Plus className="h-3.5 w-3.5" /> Add</button></div>
          {f.instructions.length === 0 && <p className="rounded-xl bg-canvas px-3 py-2 text-xs text-muted">No instructions added.</p>}
          <div className="space-y-2">{f.instructions.map((t, i) => (
            <div key={i} className="flex gap-2"><input className="input" aria-label={`Instruction ${i + 1}`} value={t} onChange={(e) => setF({ ...f, instructions: f.instructions.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" aria-label="Remove instruction" className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setF({ ...f, instructions: f.instructions.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button></div>))}
          </div>
        </div>
        <Field label="Recommended tests" htmlFor="c_tests"><input id="c_tests" className="input" value={f.recommended_tests} onChange={set("recommended_tests")} /></Field>
        <Field label="Follow-up date" htmlFor="c_fu" error={errors.follow_up_date}><input id="c_fu" type="date" className="input" value={f.follow_up_date} onChange={set("follow_up_date")} /></Field>
      </form>
    </Modal>
  );
}

function Detail({ c, onEdit, onDelete }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-xl font-bold text-navy">{c.doctor_name}</h2>
          <p className="text-sm text-muted">{[c.specialty, c.clinic].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-sm text-muted">{fmtDate(c.consultation_date)}</p></div>
        <div className="flex gap-2"><StatusBadge status={c.status} />
          <button className="btn-outline px-3 py-1.5" onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</button>
          <button className="btn-outline px-3 py-1.5 text-red-600" onClick={onDelete} aria-label="Delete consultation"><Trash2 className="h-4 w-4" /></button></div>
      </div>
      {c.symptoms && <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Your concerns</h3><p className="mt-1 text-sm">{c.symptoms}</p></section>}
      {c.doctor_notes && <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Doctor's notes</h3><p className="mt-1 text-sm">{c.doctor_notes}</p></section>}
      <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Confirmed instructions</h3>
        {c.instructions.length === 0 ? <p className="mt-1 text-sm text-muted">None recorded.</p> :
          <ul className="mt-2 space-y-1.5">{c.instructions.map((i) => <li key={i.id} className="flex gap-2 rounded-xl bg-mint-50 px-3 py-2 text-sm"><span className="text-teal">✓</span>{i.text}</li>)}</ul>}</section>
      <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Prescribed medications</h3>
        {c.medications.length === 0 ? <p className="mt-1 text-sm text-muted">None linked.</p> :
          <div className="mt-2 flex flex-wrap gap-2">{c.medications.map((m) => <Link key={m.id} to="/app/medications" className="chip bg-teal-50 px-3 py-1 text-teal-700"><Pill className="h-3.5 w-3.5" />{m.name} {m.dosage} · {m.frequency}{!m.is_active && " (stopped)"}</Link>)}</div>}</section>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Recommended tests</p><p className="text-sm">{c.recommended_tests || "—"}</p></div>
        <div className="rounded-xl border border-line p-3"><p className="flex items-center gap-1 text-xs text-muted"><CalendarClock className="h-3.5 w-3.5" /> Follow-up</p><p className="text-sm">{c.follow_up_date ? fmtDate(c.follow_up_date) : "—"}</p></div>
      </div>
      <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Attached documents</h3>
        {c.documents.length === 0 ? <p className="mt-1 text-sm text-muted">No documents attached. <Link to="/app/records/upload" className="text-teal">Upload one</Link>.</p> :
          <ul className="mt-2 space-y-1">{c.documents.map((d) => <li key={d.id}><Link to={`/app/records/${d.id}`} className="inline-flex items-center gap-2 text-sm text-teal"><FileText className="h-4 w-4" />{d.title}</Link></li>)}</ul>}</section>
    </div>
  );
}

export default function Consultations() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useApi(`/api/consultations${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`, { initial: [] });
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const openId = Number(params.get("open")) || data[0]?.id;
  const selected = data.find((c) => c.id === openId) || data[0];
  useEffect(() => { if (params.get("new")) { setEditing({}); params.delete("new"); setParams(params, { replace: true }); } }, []); // eslint-disable-line

  const saved = (c, msg) => { setEditing(null); toast.success(msg); setParams({ open: c.id }); reload(); };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/api/consultations/${del.id}`); toast.success("Consultation deleted."); setDel(null); setParams({}); reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Consultations" subtitle="What your doctors told you, visit by visit." icon={Stethoscope}
        actions={<button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Record consultation</button>} />
      <ErrorBox message={error} onRetry={reload} />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="card p-2">
          <div className="relative p-1"><Search className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-muted" />
            <input className="input pl-9" placeholder="Search doctor, clinic, notes…" aria-label="Search consultations" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {loading ? <Loading /> : data.length === 0 ? <EmptyState icon={Stethoscope} title={debounced ? "No matches" : "No consultations yet"} text="Record one manually or confirm an uploaded prescription or note." /> : (
            <ul className="mt-1 space-y-1">{data.map((c) => (
              <li key={c.id}><button onClick={() => setParams({ open: c.id })} className={`w-full rounded-xl px-3 py-2.5 text-left ${selected?.id === c.id ? "bg-teal-50" : "hover:bg-canvas"}`}>
                <p className="text-sm font-semibold text-navy">{c.doctor_name}</p>
                <p className="text-xs text-muted">{fmtDate(c.consultation_date)}{c.specialty ? ` · ${c.specialty}` : ""}</p>
                <div className="mt-1 flex gap-1">{c.medications.length > 0 && <Badge color="mint">{c.medications.length} medicine{c.medications.length > 1 ? "s" : ""}</Badge>}
                  {c.instructions.length > 0 && <Badge color="navy">{c.instructions.length} instruction{c.instructions.length > 1 ? "s" : ""}</Badge>}</div>
              </button></li>))}
            </ul>)}
        </div>
        <Card>{selected ? <Detail c={selected} onEdit={() => setEditing(selected)} onDelete={() => setDel(selected)} /> :
          <EmptyState icon={Stethoscope} title="Select a consultation" action={<button className="btn-primary" onClick={() => setEditing({})}>Record consultation</button>} />}</Card>
      </div>
      {editing && <ConsultationForm initial={editing} onClose={() => setEditing(null)} onSaved={saved} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} busy={busy} onConfirm={remove} title="Delete consultation?"
        text="Its instructions will be deleted. Linked medicines and documents are kept." />
    </div>
  );
}
