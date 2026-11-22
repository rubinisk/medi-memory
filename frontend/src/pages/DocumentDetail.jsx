import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Badge, Card, ConfirmDialog, ErrorBox, Field, Loading, StatusBadge, Spinner } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, DOC_TYPES, errorMessage, fmtDate, fmtDateTime } from "../services/api";
import { downloadDocument } from "./Records";

function Preview({ doc }) {
  const [url, setUrl] = useState(null);
  const [text, setText] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let revoke;
    api.get(`/api/documents/${doc.id}/file`, { responseType: "blob" })
      .then(async (r) => {
        if (doc.mime_type === "text/plain") setText(await r.data.text());
        else { revoke = URL.createObjectURL(r.data); setUrl(revoke); }
      })
      .catch((e) => setErr(errorMessage(e, "Preview unavailable.")));
    return () => revoke && URL.revokeObjectURL(revoke);
  }, [doc.id, doc.mime_type]);
  if (err) return <ErrorBox message={err} />;
  if (doc.mime_type === "text/plain") return text === null ? <Loading /> : <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-4 text-xs text-ink">{text}</pre>;
  if (!url) return <Loading label="Loading preview…" />;
  if (doc.mime_type === "application/pdf") return <iframe title={`Preview of ${doc.title}`} src={url} className="h-[70vh] w-full rounded-xl border border-line" />;
  return <img src={url} alt={`Uploaded document: ${doc.title}`} className="max-h-[70vh] w-full rounded-xl border border-line object-contain" />;
}

const emptyMed = { name: "", dosage: "", frequency: "", instructions: "", times: [] };
const emptyTest = { name: "", value: "", unit: "", reference_range: "" };

function ListEditor({ label, items, setItems, render, blank, addLabel }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between"><span className="label mb-0">{label}</span>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setItems([...items, structuredClone(blank)])}><Plus className="h-3.5 w-3.5" /> {addLabel}</button></div>
      {items.length === 0 ? <p className="rounded-xl bg-canvas px-3 py-2 text-xs text-muted">None found. Add manually if needed.</p> : (
        <div className="space-y-2">{items.map((it, i) => (
          <div key={i} className="flex items-start gap-2 rounded-xl border border-line p-2">
            <div className="flex-1">{render(it, (patch) => setItems(items.map((x, j) => (j === i ? (typeof patch === "string" ? patch : { ...x, ...patch }) : x))))}</div>
            <button type="button" aria-label="Remove" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          </div>))}
        </div>)}
    </div>
  );
}

function ReviewForm({ doc, onDone }) {
  const s = doc.extraction?.structured || {};
  const [f, setF] = useState({
    title: doc.title, doc_type: doc.doc_type, document_date: doc.document_date || s.document_date || "",
    doctor_name: s.doctor_name || "", specialty: s.specialty || "", clinic: s.clinic || "", summary: s.summary || "",
    follow_up_date: s.follow_up_date || "", create_consultation: true, create_medications: true, reviewed_against_original: false,
  });
  const [instructions, setInstructions] = useState(s.instructions || []);
  const [meds, setMeds] = useState((s.medications || []).map((m) => ({ ...emptyMed, ...m, instructions: m.instructions || "", times: m.times || [] })));
  const [tests, setTests] = useState((s.tests || []).map((t) => ({ ...emptyTest, ...t, value: t.value || "", unit: t.unit || "", reference_range: t.reference_range || "" })));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.reviewed_against_original) return setError("Please tick the box to confirm you've checked these details against the original document.");
    if (f.create_consultation && (meds.length || instructions.length) && !f.doctor_name.trim()) return setError("Add the doctor's name, or untick “Create a consultation record”.");
    const badTime = meds.flatMap((m) => m.times).find((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    if (badTime) return setError(`Reminder time “${badTime}” must be HH:MM (24-hour).`);
    setBusy(true); setError("");
    try {
      const body = {
        ...f, document_date: f.document_date || null, follow_up_date: f.follow_up_date || null,
        doctor_name: f.doctor_name || null, specialty: f.specialty || null, clinic: f.clinic || null, summary: f.summary || null,
        instructions: instructions.filter((x) => x.trim()),
        medications: meds.filter((m) => m.name.trim()).map((m) => ({ ...m, instructions: m.instructions || null })),
        tests: tests.filter((t) => t.name.trim()).map((t) => ({ name: t.name, value: t.value || null, unit: t.unit || null, reference_range: t.reference_range || null })),
      };
      await api.post(`/api/documents/${doc.id}/confirm`, body);
      toast.success("Confirmed and added to your medical history.");
      onDone();
    } catch (e2) { setError(errorMessage(e2)); } finally { setBusy(false); }
  };

  const ex = doc.extraction;
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Review before saving</p>
        <p className="mt-1">These details were extracted automatically ({ex?.method?.replace("+", " + ")}, <b>{ex?.confidence} confidence</b>). Check every name, dose and date against the original.</p>
        {ex?.warnings?.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs">{ex.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </div>
      <ErrorBox message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="r_title"><input id="r_title" className="input" required minLength={2} value={f.title} onChange={set("title")} /></Field>
        <Field label="Type" htmlFor="r_type"><select id="r_type" className="input" value={f.doc_type} onChange={set("doc_type")}>
          {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Document date" htmlFor="r_date"><input id="r_date" type="date" className="input" value={f.document_date} onChange={set("document_date")} /></Field>
        <Field label="Follow-up date" htmlFor="r_fu" hint="Creates a follow-up appointment if in the future"><input id="r_fu" type="date" className="input" value={f.follow_up_date} onChange={set("follow_up_date")} /></Field>
        <Field label="Doctor" htmlFor="r_doc"><input id="r_doc" className="input" value={f.doctor_name} onChange={set("doctor_name")} /></Field>
        <Field label="Specialty" htmlFor="r_spec"><input id="r_spec" className="input" value={f.specialty} onChange={set("specialty")} /></Field>
        <div className="sm:col-span-2"><Field label="Hospital / clinic / lab" htmlFor="r_clinic"><input id="r_clinic" className="input" value={f.clinic} onChange={set("clinic")} /></Field></div>
        <div className="sm:col-span-2"><Field label="Notes / summary" htmlFor="r_sum"><textarea id="r_sum" rows={2} className="input" value={f.summary} onChange={set("summary")} /></Field></div>
      </div>

      <ListEditor label="Medications (as prescribed)" addLabel="Add medicine" blank={emptyMed} items={meds} setItems={setMeds}
        render={(m, up) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Name" aria-label="Medicine name" value={m.name} onChange={(e) => up({ name: e.target.value })} />
            <input className="input" placeholder="Dosage, e.g. 500 mg" aria-label="Dosage" value={m.dosage} onChange={(e) => up({ dosage: e.target.value })} />
            <input className="input" placeholder="Frequency, e.g. twice daily" aria-label="Frequency" value={m.frequency} onChange={(e) => up({ frequency: e.target.value })} />
            <input className="input" placeholder="Reminder times, e.g. 08:00, 20:00" aria-label="Reminder times" value={m.times.join(", ")}
              onChange={(e) => up({ times: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            <input className="input sm:col-span-2" placeholder="Doctor's instructions, e.g. after food" aria-label="Medicine instructions" value={m.instructions} onChange={(e) => up({ instructions: e.target.value })} />
          </div>)} />

      <ListEditor label="Doctor's instructions" addLabel="Add instruction" blank="" items={instructions} setItems={setInstructions}
        render={(t, up) => <input className="input" aria-label="Instruction" value={t} onChange={(e) => up(e.target.value)} />} />

      <ListEditor label="Test results" addLabel="Add result" blank={emptyTest} items={tests} setItems={setTests}
        render={(t, up) => (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input className="input col-span-2 sm:col-span-1" placeholder="Test" aria-label="Test name" value={t.name} onChange={(e) => up({ name: e.target.value })} />
            <input className="input" placeholder="Value" aria-label="Value" value={t.value} onChange={(e) => up({ value: e.target.value })} />
            <input className="input" placeholder="Unit" aria-label="Unit" value={t.unit} onChange={(e) => up({ unit: e.target.value })} />
            <input className="input col-span-2 sm:col-span-1" placeholder="Reference range" aria-label="Reference range" value={t.reference_range} onChange={(e) => up({ reference_range: e.target.value })} />
          </div>)} />

      <div className="space-y-2 rounded-xl bg-canvas p-3 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.create_consultation} onChange={set("create_consultation")} /> Create a consultation record from this document</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.create_medications} onChange={set("create_medications")} /> Add these medicines to my medication list with reminders</label>
        <label className="flex items-start gap-2 font-semibold text-navy"><input type="checkbox" className="mt-1" checked={f.reviewed_against_original} onChange={set("reviewed_against_original")} />
          I have checked these details against the original document and they are correct.</label>
      </div>
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} Confirm and save</button></div>
    </form>
  );
}

function ConfirmedView({ doc, onSaved }) {
  const c = doc.extraction?.confirmed_data || {};
  const [meta, setMeta] = useState({ title: doc.title, doc_type: doc.doc_type, document_date: doc.document_date || "", notes: doc.notes || "" });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async () => {
    setBusy(true);
    try { await api.patch(`/api/documents/${doc.id}`, { ...meta, document_date: meta.document_date || null }); toast.success("Saved."); onSaved(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="m_title"><input id="m_title" className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
        <Field label="Type" htmlFor="m_type"><select id="m_type" className="input" value={meta.doc_type} onChange={(e) => setMeta({ ...meta, doc_type: e.target.value })}>
          {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Date" htmlFor="m_date"><input id="m_date" type="date" className="input" value={meta.document_date} onChange={(e) => setMeta({ ...meta, document_date: e.target.value })} /></Field>
        <Field label="Personal notes" htmlFor="m_notes"><input id="m_notes" className="input" value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end"><button className="btn-outline" onClick={save} disabled={busy}><Save className="h-4 w-4" /> Save details</button></div>
      <div className="space-y-3 rounded-xl bg-canvas p-4 text-sm">
        <p className="font-semibold text-navy">Confirmed information {doc.extraction?.confirmed_at && <span className="font-normal text-muted">· {fmtDateTime(doc.extraction.confirmed_at)}</span>}</p>
        {c.doctor_name && <p><span className="text-muted">Doctor:</span> {c.doctor_name}{c.specialty ? `, ${c.specialty}` : ""}{c.clinic ? ` · ${c.clinic}` : ""}</p>}
        {c.medications?.length > 0 && <div><p className="text-muted">Medications</p><ul className="list-disc pl-5">{c.medications.map((m, i) => <li key={i}>{m.name} {m.dosage} · {m.frequency}{m.instructions ? ` · ${m.instructions}` : ""}</li>)}</ul></div>}
        {c.tests?.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted"><tr><th className="py-1">Test</th><th>Value</th><th>Reference range</th></tr></thead>
            <tbody>{c.tests.map((t, i) => <tr key={i} className="border-t border-line"><td className="py-1.5">{t.name}</td><td>{t.value} {t.unit}</td><td>{t.reference_range || "—"}</td></tr>)}</tbody></table>
            <p className="mt-1 text-[11px] text-muted">Values are shown as written in the report. Ask your doctor what they mean for you.</p></div>)}
        {c.instructions?.length > 0 && <div><p className="text-muted">Instructions</p><ul className="list-disc pl-5">{c.instructions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {doc.consultation_id && <Link className="font-semibold text-teal" to={`/app/consultations?open=${doc.consultation_id}`}>View linked consultation →</Link>}
      </div>
    </div>
  );
}

export default function DocumentDetail() {
  const { id } = useParams();
  const { data: doc, loading, error, reload } = useApi(`/api/documents/${id}`);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const reprocess = async () => {
    setBusy(true);
    try { await api.post(`/api/documents/${id}/reprocess`); toast.success("Text extracted again."); reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/api/documents/${id}`); toast.success("Document deleted."); navigate("/app/records"); }
    catch (e) { toast.error(errorMessage(e)); setBusy(false); }
  };

  if (loading && !doc) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <div>
      <Link to="/app/records" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-navy"><ArrowLeft className="h-4 w-4" /> All records</Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">{doc.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge color="navy">{DOC_TYPES[doc.doc_type]}</Badge><StatusBadge status={doc.status} />
            <span>{fmtDate(doc.document_date || doc.created_at)}</span><span>· {doc.original_filename}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => downloadDocument(doc, toast)}><Download className="h-4 w-4" /> Download</button>
          {doc.status !== "confirmed" && <button className="btn-outline" disabled={busy} onClick={reprocess}><RefreshCw className="h-4 w-4" /> Re-extract</button>}
          <button className="btn-outline text-red-600" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /> Delete</button>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Original document"><Preview doc={doc} />
          {doc.extraction?.raw_text && (
            <div className="mt-3"><button className="text-xs font-semibold text-teal" onClick={() => setShowRaw(!showRaw)}>{showRaw ? "Hide" : "Show"} extracted text</button>
              {showRaw && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-3 text-xs">{doc.extraction.raw_text}</pre>}</div>)}
        </Card>
        <Card title={doc.status === "confirmed" ? "Saved details" : "Review extracted details"}>
          {doc.status === "confirmed" ? <ConfirmedView doc={doc} onSaved={reload} /> : <ReviewForm key={doc.extraction?.raw_text?.length} doc={doc} onDone={reload} />}
        </Card>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} busy={busy} onConfirm={remove} title="Delete document?" text="The file and its extracted text will be permanently deleted." />
    </div>
  );
}
