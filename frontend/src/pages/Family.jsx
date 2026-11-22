import { useState } from "react";
import { Copy, Eye, HeartHandshake, History, Link2, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Badge, Card, ConfirmDialog, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Spinner, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, errorMessage, fmtDate, fmtDateTime } from "../services/api";

const SCOPES = [
  { key: "medications", label: "Medications & schedules" },
  { key: "appointments", label: "Appointments" },
  { key: "consultations", label: "Consultations & instructions" },
  { key: "documents", label: "Document list (titles and dates only)" },
];

function InviteForm({ onClose, onCreated }) {
  const [f, setF] = useState({ caregiver_email: "", caregiver_name: "", relationship_label: "", permissions: ["medications", "appointments"], consent_given: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (k) => setF({ ...f, permissions: f.permissions.includes(k) ? f.permissions.filter((x) => x !== k) : [...f.permissions, k] });
  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(f.caregiver_email)) return setError("Enter the caregiver's email address.");
    if (f.permissions.length === 0) return setError("Choose at least one section to share.");
    if (!f.consent_given) return setError("Please tick the consent box to share your records.");
    setBusy(true); setError("");
    try { const r = await api.post("/api/caregivers/invitations", { ...f, caregiver_name: f.caregiver_name || null, relationship_label: f.relationship_label || null }); onCreated(r.data); }
    catch (e2) { setError(errorMessage(e2)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Invite a caregiver"
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" form="invform" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Create invitation</button></>}>
      <form id="invform" onSubmit={submit} className="space-y-3" noValidate>
        <ErrorBox message={error} />
        <Field label="Caregiver's email" htmlFor="i_email" hint="They'll need a MediMemory account with this email"><input id="i_email" type="email" className="input" value={f.caregiver_email} onChange={(e) => setF({ ...f, caregiver_email: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="i_name"><input id="i_name" className="input" value={f.caregiver_name} onChange={(e) => setF({ ...f, caregiver_name: e.target.value })} /></Field>
          <Field label="Relationship" htmlFor="i_rel"><input id="i_rel" className="input" placeholder="e.g. Brother" value={f.relationship_label} onChange={(e) => setF({ ...f, relationship_label: e.target.value })} /></Field>
        </div>
        <fieldset><legend className="label">What can they see? (view-only)</legend>
          <div className="space-y-1.5">{SCOPES.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.permissions.includes(s.key)} onChange={() => toggle(s.key)} />{s.label}</label>))}</div>
        </fieldset>
        <label className="flex items-start gap-2 rounded-xl bg-mint-50 p-3 text-sm font-medium text-navy">
          <input type="checkbox" className="mt-1" checked={f.consent_given} onChange={(e) => setF({ ...f, consent_given: e.target.checked })} />
          I consent to sharing the selected sections of my medical records with this person. I can revoke access at any time.</label>
      </form>
    </Modal>
  );
}

function CaregiverView() {
  const patients = useApi("/api/caregiving/patients", { initial: [] });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [view, setView] = useState(null);
  const [rows, setRows] = useState(null);
  const toast = useToast();

  const accept = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { const r = await api.post("/api/caregiving/accept", { token: token.trim() }); toast.success(`You can now view ${r.data.patient_name}'s shared records.`); setToken(""); patients.reload(); }
    catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };
  const open = async (p, scope) => {
    setView({ p, scope }); setRows(null);
    try { setRows((await api.get(`/api/caregiving/patients/${p.patient_id}/${scope}`)).data); }
    catch (e) { setRows([]); toast.error(errorMessage(e)); }
  };

  return (
    <Card title="People who shared records with you" icon={Users}>
      <form onSubmit={accept} className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="token" className="sr-only">Invitation code</label>
        <input id="token" className="input" placeholder="Paste an invitation code" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className="btn-navy" disabled={busy || token.trim().length < 10}>{busy && <Spinner className="h-4 w-4" />} Accept invitation</button>
      </form>
      <ErrorBox message={err} />
      {patients.loading ? <Loading /> : patients.data.length === 0 ? <p className="text-sm text-muted">No one has shared records with you yet.</p> : (
        <ul className="space-y-3">{patients.data.map((p) => (
          <li key={p.patient_id} className="rounded-xl border border-line p-3">
            <p className="font-semibold text-navy">{p.name}</p>
            <div className="mt-2 flex flex-wrap gap-2">{p.scopes.map((s) => (
              <button key={s} className="btn-outline px-3 py-1 text-xs capitalize" onClick={() => open(p, s)}><Eye className="h-3.5 w-3.5" />{s}</button>))}</div>
          </li>))}</ul>)}
      {view && (
        <Modal open wide onClose={() => setView(null)} title={`${view.p.name}: ${view.scope} (view-only)`}>
          {!rows ? <Loading /> : rows.length === 0 ? <p className="text-sm text-muted">Nothing to show.</p> : (
            <ul className="divide-y divide-line text-sm">{rows.map((r) => (
              <li key={r.id} className="py-2.5">
                {view.scope === "medications" && <><b>{r.name}</b> {r.dosage} · {r.frequency}{r.instructions ? ` · ${r.instructions}` : ""} {r.times?.length > 0 && <span className="text-muted">({r.times.join(", ")})</span>} {!r.is_active && <Badge>stopped</Badge>}</>}
                {view.scope === "appointments" && <><b>{r.title}</b> · {fmtDateTime(r.scheduled_at)}{r.hospital ? ` · ${r.hospital}` : ""} <StatusBadge status={r.status} /></>}
                {view.scope === "consultations" && <><b>{r.doctor_name}</b> · {fmtDate(r.consultation_date)}{r.instructions.length > 0 && <ul className="mt-1 list-disc pl-5 text-muted">{r.instructions.map((i) => <li key={i}>{i}</li>)}</ul>}</>}
                {view.scope === "documents" && <><b>{r.title}</b> · {r.doc_type.replace("_", " ")} · {fmtDate(r.document_date)}</>}
              </li>))}</ul>)}
          <p className="mt-3 text-xs text-muted">Your access is logged and visible to {view.p.name}.</p>
        </Modal>
      )}
    </Card>
  );
}

export default function Family() {
  const invites = useApi("/api/caregivers/invitations", { initial: [] });
  const caregivers = useApi("/api/caregivers", { initial: [] });
  const log = useApi("/api/caregivers/access-log", { initial: [] });
  const [inviting, setInviting] = useState(false);
  const [created, setCreated] = useState(null);
  const [revoke, setRevoke] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const reloadAll = () => { invites.reload(); caregivers.reload(); log.reload(); };

  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.success("Copied."); } catch { toast.error("Couldn't copy. Select and copy the code manually."); } };
  const doRevoke = async () => {
    setBusy(true);
    try {
      if (revoke.type === "invite") await api.delete(`/api/caregivers/invitations/${revoke.id}`);
      else await api.delete(`/api/caregivers/${revoke.id}`);
      toast.success("Access revoked."); setRevoke(null); reloadAll();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const updateScopes = async (cg, scope) => {
    const next = cg.scopes.includes(scope) ? cg.scopes.filter((s) => s !== scope) : [...cg.scopes, scope];
    try { await api.put(`/api/caregivers/${cg.caregiver_id}/permissions`, { permissions: next }); toast.success("Permissions updated."); caregivers.reload(); }
    catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div>
      <PageHeader title="Family & caregiver access" subtitle="Share selected sections, view-only, with people you trust." icon={HeartHandshake}
        actions={<button className="btn-primary" onClick={() => setInviting(true)}><UserPlus className="h-4 w-4" /> Invite caregiver</button>} />
      <div className="mb-5 flex items-start gap-2 rounded-xl border border-line bg-white p-3 text-xs text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
        <span><b className="text-navy">Prototype limitation:</b> invitation emails aren't sent. Share the invitation code with your caregiver yourself; they log in to their own MediMemory account (with the invited email) and paste it under “People who shared records with you”. Access is view-only, limited to the sections you choose, logged, and revocable.</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Caregivers with access" icon={Users} bodyClass="p-0">
            {caregivers.loading ? <Loading /> : caregivers.data.length === 0 ? <EmptyState icon={Users} title="No caregivers yet" text="Invite a family member to help keep track of medicines and appointments." /> : (
              <ul className="divide-y divide-line">{caregivers.data.map((c) => (
                <li key={c.caregiver_id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-2"><div><p className="font-semibold text-navy">{c.name}</p><p className="text-xs text-muted">{c.email}</p></div>
                    <button className="btn-outline px-3 py-1 text-xs text-red-600" onClick={() => setRevoke({ type: "caregiver", id: c.caregiver_id, name: c.name })}><Trash2 className="h-3.5 w-3.5" /> Revoke all</button></div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{SCOPES.map((s) => (
                    <button key={s.key} aria-pressed={c.scopes.includes(s.key)} onClick={() => updateScopes(c, s.key)}
                      className={`chip px-2.5 py-1 ${c.scopes.includes(s.key) ? "bg-teal text-white" : "bg-canvas text-muted"}`}>{s.key}</button>))}</div>
                </li>))}</ul>)}
          </Card>
          <Card title="Invitations" icon={Link2} bodyClass="p-0">
            <ErrorBox message={invites.error} />
            {invites.data.length === 0 ? <EmptyState icon={Link2} title="No invitations" /> : (
              <ul className="divide-y divide-line">{invites.data.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-navy">{i.caregiver_name || i.caregiver_email}{i.relationship_label ? ` (${i.relationship_label})` : ""}</p>
                    <p className="text-xs text-muted">{i.permissions.join(", ")} · sent {fmtDate(i.created_at)}{i.status === "pending" ? ` · expires ${fmtDate(i.expires_at)}` : ""}</p></div>
                  <StatusBadge status={i.status} />
                  {i.status === "pending" && <><button className="btn-ghost px-2 py-1 text-xs" onClick={() => copy(i.token)}><Copy className="h-3.5 w-3.5" /> Code</button>
                    <button className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => setRevoke({ type: "invite", id: i.id, name: i.caregiver_email })}>Cancel</button></>}
                </li>))}</ul>)}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Access history" icon={History} bodyClass="p-0">
            {log.data.length === 0 ? <EmptyState icon={History} title="No access yet" text="Every time a caregiver views your records, it's listed here." /> : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">{log.data.map((l) => (
                <li key={l.id} className="flex justify-between px-5 py-2.5 text-sm"><span><b className="text-navy">{l.caregiver}</b> viewed {l.scope}</span><span className="text-xs text-muted">{fmtDateTime(l.created_at)}</span></li>))}</ul>)}
          </Card>
          <CaregiverView />
        </div>
      </div>
      {inviting && <InviteForm onClose={() => setInviting(false)} onCreated={(inv) => { setInviting(false); setCreated(inv); reloadAll(); }} />}
      {created && (
        <Modal open onClose={() => setCreated(null)} title="Invitation created" footer={<button className="btn-primary" onClick={() => setCreated(null)}>Done</button>}>
          <p className="text-sm text-muted">Share this code with <b>{created.caregiver_email}</b>. It expires on {fmtDate(created.expires_at)} and works only for that email.</p>
          <div className="mt-3 flex gap-2"><code className="flex-1 break-all rounded-xl bg-canvas p-3 text-sm">{created.token}</code>
            <button className="btn-outline" onClick={() => copy(created.token)} aria-label="Copy code"><Copy className="h-4 w-4" /></button></div>
        </Modal>
      )}
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} busy={busy} onConfirm={doRevoke} confirmLabel="Revoke"
        title="Revoke access?" text={`${revoke?.name} will immediately lose access to your shared records.`} />
    </div>
  );
}
