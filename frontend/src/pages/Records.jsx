import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Eye, FileImage, FileText, FileUp, Search, Trash2 } from "lucide-react";
import { ConfirmDialog, EmptyState, ErrorBox, Loading, PageHeader, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, DOC_TYPES, errorMessage, fmtDate } from "../services/api";

export async function downloadDocument(doc, toast) {
  try {
    const r = await api.get(`/api/documents/${doc.id}/file`, { params: { download: true }, responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url; a.download = doc.original_filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { toast.error(errorMessage(e, "Download failed.")); }
}

export default function Records() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const type = params.get("type") || "";
  const status = params.get("status") || "";
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const qs = new URLSearchParams({ ...(debounced && { q: debounced }), ...(type && { doc_type: type }), ...(status && { status }) }).toString();
  const { data: docs, loading, error, reload } = useApi(`/api/documents${qs ? "?" + qs : ""}`, { initial: [] });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const setFilter = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p); };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/api/documents/${del.id}`); toast.success("Document deleted."); setDel(null); reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Medical records" subtitle="Prescriptions, lab reports, certificates, notes and images." icon={FileText}
        actions={<Link to="/app/records/upload" className="btn-primary"><FileUp className="h-4 w-4" /> Upload document</Link>} />
      <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
          <input className="input pl-9" placeholder="Search titles and document text…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
        </div>
        <select className="input sm:w-48" value={type} onChange={(e) => setFilter("type", e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input sm:w-48" value={status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="pending_review">Awaiting review</option>
          <option value="confirmed">Confirmed</option>
          <option value="failed">Extraction failed</option>
        </select>
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading ? <Loading /> : docs.length === 0 ? (
        <div className="card"><EmptyState icon={FileText} title={debounced || type || status ? "No documents match your filters" : "No documents yet"}
          text="Upload a prescription, lab report or note to get started."
          action={<Link to="/app/records/upload" className="btn-primary">Upload document</Link>} /></div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {docs.map((d) => {
              const Icon = d.mime_type.startsWith("image/") ? FileImage : FileText;
              return (
                <li key={d.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                  <Link to={`/app/records/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="rounded-xl bg-teal-50 p-2.5 text-teal"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-navy">{d.title}</span>
                      <span className="block text-xs text-muted">{DOC_TYPES[d.doc_type]} · {fmtDate(d.document_date || d.created_at)} · {(d.size_bytes / 1024).toFixed(0)} KB</span>
                    </span>
                  </Link>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={d.status} />
                    <Link to={`/app/records/${d.id}`} className="btn-ghost px-2 py-1.5" aria-label={`Open ${d.title}`}><Eye className="h-4 w-4" /></Link>
                    <button className="btn-ghost px-2 py-1.5" aria-label={`Download ${d.title}`} onClick={() => downloadDocument(d, toast)}><Download className="h-4 w-4" /></button>
                    <button className="btn-ghost px-2 py-1.5 text-red-600" aria-label={`Delete ${d.title}`} onClick={() => setDel(d)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} busy={busy} onConfirm={remove} title="Delete document?"
        text={`“${del?.title}” and its stored file will be permanently deleted. Consultations and medicines you confirmed from it will stay.`} />
    </div>
  );
}
