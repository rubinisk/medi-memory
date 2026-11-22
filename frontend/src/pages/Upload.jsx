import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CheckCircle2, Download, FileText, FlaskConical, Pill, ShieldCheck, Stethoscope, UploadCloud } from "lucide-react";
import { StatusBadge } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { downloadDocument } from "./Records";
import { ErrorBox, Field, PageHeader, Spinner } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { api, DOC_TYPES, errorMessage, fmtDate } from "../services/api";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.txt";
const MAX_MB = 10;

export function validateFile(f) {
  if (!f) return "Choose a file to upload.";
  const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
  if (!ACCEPT.split(",").includes(ext)) return "Unsupported file type. Use PDF, PNG, JPG, WEBP or TXT.";
  if (f.size > MAX_MB * 1024 * 1024) return `File is too large. Maximum size is ${MAX_MB} MB.`;
  if (f.size === 0) return "The file is empty.";
  return "";
}

export default function Upload() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();
  const recent = useApi("/api/documents", { initial: [] });

  const pick = (f) => {
    const err = validateFile(f);
    setError(err);
    setFile(err ? null : f);
    if (!err && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  };

  const submit = async (e) => {
    e.preventDefault();
    const err = validateFile(file);
    if (err) return setError(err);
    setBusy(true); setError("");
    const fd = new FormData();
    fd.append("file", file);
    if (title.trim()) fd.append("title", title.trim());
    if (docType) fd.append("doc_type", docType);
    try {
      const r = await api.post("/api/documents", fd);
      toast.success("Uploaded. Please review the extracted details.");
      navigate(`/app/records/${r.data.id}?review=1`);
    } catch (e2) { setError(errorMessage(e2, "Upload failed.")); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Upload Medical Document" subtitle="Upload prescriptions, lab reports or other medical documents. Nothing is added to your history until you confirm it." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <form onSubmit={submit} className="card space-y-5 p-5 sm:p-6">
            <ErrorBox message={error} />
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${drag ? "border-brand bg-brand-50" : "border-brand-100 bg-canvas/50"}`}>
              <span className="icon-tile h-16 w-16 rounded-full bg-white text-brand shadow-card"><UploadCloud className="h-8 w-8" /></span>
              {file ? (<><p className="mt-4 font-semibold text-ink">{file.name}</p><p className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB</p></>) : (
                <p className="mt-4 font-semibold text-ink">Drag &amp; drop your file here</p>)}
              <p className="my-2 text-xs text-muted">or</p>
              <button type="button" className="btn-brand rounded-full px-6" onClick={() => input.current?.click()}>{file ? "Choose another file" : "Browse Files"}</button>
              <p className="mt-4 text-xs text-muted">Supports PDF, JPG, PNG, WEBP, TXT · Max size: {MAX_MB} MB · scans are read with OCR</p>
              <input ref={input} data-testid="file-input" type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files[0])} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="doc_title"><input id="doc_title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Document type" htmlFor="doc_type" hint="Leave on auto-detect if unsure">
                <select id="doc_type" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="">Auto-detect</option>
                  {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> Stored privately; visible only to you and caregivers you allow.</p>
              <button type="submit" className="btn-primary shrink-0" disabled={busy || !file}>{busy ? <><Spinner className="h-4 w-4" /> Reading document…</> : <>Upload and extract</>}</button>
            </div>
          </form>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="section-title">Recent Uploads</h2><Link to="/app/records" className="link-more">View All <ArrowRight className="h-3.5 w-3.5" /></Link></div>
            {recent.data.length === 0 ? <p className="text-sm text-muted">No uploads yet.</p> : (
              <ul className="space-y-2">{recent.data.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-xl border border-line/70 px-3 py-2.5">
                  <span className="icon-tile h-10 w-10 rounded-xl bg-red-50 text-[10px] font-bold text-red-500">{d.mime_type === "application/pdf" ? "PDF" : d.mime_type === "text/plain" ? "TXT" : "IMG"}</span>
                  <Link to={`/app/records/${d.id}`} className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{d.original_filename}</span>
                    <span className="text-xs text-muted">{(d.size_bytes / 1024).toFixed(0)} KB · {fmtDate(d.created_at)}</span></Link>
                  <StatusBadge status={d.status} />
                  <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-brand" aria-label={`Download ${d.original_filename}`} onClick={() => downloadDocument(d, toast)}><Download className="h-4 w-4" /></button>
                </li>))}
              </ul>)}
          </section>
        </div>

        <aside className="h-fit rounded-3xl bg-gradient-to-b from-mint-50 to-white p-6 ring-1 ring-line">
          <h2 className="section-title">Extracted Information (Preview)</h2>
          <p className="mt-1 text-sm text-muted">After upload, MediMemory reads the document and shows what it found:</p>
          <ul className="mt-4 space-y-3 text-sm">
            {[[FileText, "Type", "prescription, lab report, note…"], [CalendarDays, "Date", "document and follow-up dates"], [Stethoscope, "Doctor", "name, specialty and clinic"],
              [Pill, "Medicines", "name, dose and frequency as written"], [FlaskConical, "Test results", "values and reference ranges"]].map(([Icon, k, v]) => (
              <li key={k} className="flex items-start gap-3"><span className="icon-tile h-8 w-8 rounded-lg bg-white text-brand ring-1 ring-line"><Icon className="h-4 w-4" /></span>
                <span><span className="font-semibold text-ink">{k}:</span> <span className="text-muted">{v}</span></span></li>))}
          </ul>
          <div className="mt-5 flex items-start gap-2 rounded-2xl bg-white p-3 text-sm text-ink ring-1 ring-line">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <span>You'll be asked to <b>confirm the information before saving</b>. Uncertain OCR text is never saved automatically.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
