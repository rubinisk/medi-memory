import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Accessibility, History, KeyRound, LogOut, Save, Settings as SettingsIcon, ShieldCheck, User, Volume2 } from "lucide-react";
import { Card, ErrorBox, Field, PageHeader, Spinner, Toggle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, blobErrorMessage, errorMessage, fmtDateTime } from "../services/api";
import { passwordChecks } from "./Register";

const LANGS = [["auto", "Detect automatically"], ["en", "English"], ["ta", "Tamil"], ["hi", "Hindi"], ["te", "Telugu"], ["kn", "Kannada"], ["ml", "Malayalam"],
  ["mr", "Marathi"], ["bn", "Bengali"], ["gu", "Gujarati"], ["pa", "Punjabi"], ["ur", "Urdu"]];

export default function SettingsPage() {
  const { user, updateProfile, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const p = user.profile || {};
  const [f, setF] = useState({
    full_name: user.full_name, date_of_birth: p.date_of_birth || "", gender: p.gender || "", phone: p.phone || "", address: p.address || "",
    blood_group: p.blood_group || "", emergency_contact_name: p.emergency_contact_name || "", emergency_contact_phone: p.emergency_contact_phone || "",
    emergency_contact_relation: p.emergency_contact_relation || "", preferred_language: p.preferred_language || "en",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const voiceStatus = useApi("/api/voice/status");
  const [voices, setVoices] = useState([]);
  const [testing, setTesting] = useState(false);
  const audit = useApi("/api/audit-logs?limit=25", { initial: [] });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    if (voiceStatus.data?.configured) api.get("/api/voice/voices").then((r) => setVoices(r.data)).catch(() => setVoices([]));
  }, [voiceStatus.data?.configured]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const saveProfile = async (e) => {
    e.preventDefault();
    if (f.full_name.trim().length < 2) return setError("Please enter your full name.");
    setBusy(true); setError("");
    const body = { ...f };
    Object.keys(body).forEach((k) => { if (body[k] === "" && k !== "full_name") body[k] = null; });
    try { await updateProfile(body); toast.success("Profile saved."); audit.reload(); }
    catch (e2) { setError(errorMessage(e2)); } finally { setBusy(false); }
  };
  const toggle = async (patch, msg) => {
    try { await updateProfile(patch); toast.success(msg || "Preference saved."); audit.reload(); voiceStatus.reload(); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  const testVoice = async () => {
    setTesting(true);
    try {
      const r = await api.post("/api/voice/speak", { text: `Hello ${user.full_name.split(" ")[0]}. This is how MediMemory will read your answers.`, voice_id: p.voice_id || null }, { responseType: "blob" });
      const a = new Audio(URL.createObjectURL(r.data)); await a.play();
    } catch (e) { toast.error(await blobErrorMessage(e, "Voice test failed.")); } finally { setTesting(false); }
  };
  const changePassword = async (e) => {
    e.preventDefault();
    if (!passwordChecks(pw.new_password).every((c) => c.ok)) return setPwError("New password needs 8+ characters with upper and lower case letters and a number.");
    if (pw.new_password !== pw.confirm) return setPwError("New passwords don't match.");
    setPwBusy(true); setPwError("");
    try { await api.post("/api/auth/change-password", { current_password: pw.current_password, new_password: pw.new_password }); toast.success("Password changed."); setPw({ current_password: "", new_password: "", confirm: "" }); }
    catch (e2) { setPwError(errorMessage(e2)); } finally { setPwBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Profile & settings" subtitle="Personal details, accessibility, voice and privacy." icon={SettingsIcon}
        actions={<button className="btn-outline" onClick={async () => { await logout(); navigate("/login"); }}><LogOut className="h-4 w-4" /> Log out</button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Personal details" icon={User}>
          <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2" noValidate>
            <div className="sm:col-span-2"><ErrorBox message={error} /></div>
            <Field label="Full name" htmlFor="s_name"><input id="s_name" className="input" value={f.full_name} onChange={set("full_name")} /></Field>
            <Field label="Email" htmlFor="s_email" hint="Email can't be changed in this prototype"><input id="s_email" className="input" value={user.email} disabled /></Field>
            <Field label="Date of birth" htmlFor="s_dob"><input id="s_dob" type="date" className="input" value={f.date_of_birth} onChange={set("date_of_birth")} /></Field>
            <Field label="Gender" htmlFor="s_gender"><input id="s_gender" className="input" value={f.gender} onChange={set("gender")} /></Field>
            <Field label="Phone" htmlFor="s_phone"><input id="s_phone" className="input" value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Blood group" htmlFor="s_bg"><select id="s_bg" className="input" value={f.blood_group} onChange={set("blood_group")}>
              <option value="">Not set</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => <option key={b}>{b}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="Address" htmlFor="s_addr"><input id="s_addr" className="input" value={f.address} onChange={set("address")} /></Field></div>
            <p className="pt-2 text-sm font-semibold text-navy sm:col-span-2">Emergency contact</p>
            <Field label="Name" htmlFor="s_ecn"><input id="s_ecn" className="input" value={f.emergency_contact_name} onChange={set("emergency_contact_name")} /></Field>
            <Field label="Phone" htmlFor="s_ecp"><input id="s_ecp" className="input" value={f.emergency_contact_phone} onChange={set("emergency_contact_phone")} /></Field>
            <Field label="Relationship" htmlFor="s_ecr"><input id="s_ecr" className="input" value={f.emergency_contact_relation} onChange={set("emergency_contact_relation")} /></Field>
            <Field label="Preferred language" htmlFor="s_lang" hint="Used for voice transcription"><select id="s_lang" className="input" value={f.preferred_language} onChange={set("preferred_language")}>
              {LANGS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <div className="flex justify-end sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save profile</button></div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Privacy" icon={ShieldCheck} bodyClass="divide-y divide-line px-5">
            <Toggle id="t_consent" checked={p.ai_data_consent} onChange={(v) => toggle({ ai_data_consent: v }, v ? "AI & voice processing enabled." : "AI & voice processing disabled.")}
              label="AI & voice processing"
              description="Allows sending relevant record excerpts to the configured AI provider and your voice recordings and answers to ElevenLabs. When off, the assistant only quotes your records and voice is disabled." />
            <Toggle id="t_rem" checked={p.reminders_enabled} onChange={(v) => toggle({ reminders_enabled: v })} label="In-app reminders" description="Show medication and appointment reminders while MediMemory is open." />
            <p className="py-3 text-xs text-muted">Your data is visible only to you and caregivers you explicitly allow. This prototype has not been assessed for HIPAA, GDPR or India's DPDP Act compliance. Please use fictional data.</p>
          </Card>
          <Card title="Accessibility" icon={Accessibility} bodyClass="divide-y divide-line px-5">
            <Toggle id="t_large" checked={p.large_text} onChange={(v) => toggle({ large_text: v })} label="Larger text" description="Increase text size across the app." />
            <Toggle id="t_contrast" checked={p.high_contrast} onChange={(v) => toggle({ high_contrast: v })} label="Higher contrast" description="Darker secondary text and borders." />
            <Toggle id="t_motion" checked={p.reduce_motion} onChange={(v) => toggle({ reduce_motion: v })} label="Reduce motion" description="Turn off animations." />
          </Card>
          <Card title="Voice" icon={Volume2} bodyClass="px-5 pb-4">
            {!voiceStatus.data?.configured && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">ElevenLabs isn't configured on the server, so voice options are unavailable.</p>}
            <Toggle id="t_auto" checked={p.voice_autoplay} onChange={(v) => toggle({ voice_autoplay: v })} label="Play answers automatically" description="In the voice assistant, read answers aloud as soon as they're ready." />
            <Field label="Voice" htmlFor="s_voice">
              <div className="flex gap-2">
                <select id="s_voice" className="input" value={p.voice_id || ""} disabled={!voices.length} onChange={(e) => toggle({ voice_id: e.target.value || null }, "Voice updated.")}>
                  <option value="">Default voice</option>{voices.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}{v.labels?.accent ? ` (${v.labels.accent})` : ""}</option>)}
                </select>
                <button className="btn-outline" disabled={!voiceStatus.data?.configured || !p.ai_data_consent || testing} onClick={testVoice}>{testing ? <Spinner className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} Test</button>
              </div>
            </Field>
          </Card>
          <Card title="Change password" icon={KeyRound}>
            <form onSubmit={changePassword} className="space-y-3" noValidate>
              <ErrorBox message={pwError} />
              <Field label="Current password" htmlFor="p_cur"><input id="p_cur" type="password" className="input" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="New password" htmlFor="p_new"><input id="p_new" type="password" className="input" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
                <Field label="Confirm" htmlFor="p_conf"><input id="p_conf" type="password" className="input" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
              </div>
              <div className="flex justify-end"><button className="btn-outline" disabled={pwBusy || !pw.current_password}>{pwBusy && <Spinner className="h-4 w-4" />} Update password</button></div>
            </form>
          </Card>
          <Card title="Recent account activity" icon={History} bodyClass="p-0">
            <ul className="max-h-64 divide-y divide-line overflow-y-auto">{audit.data.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 px-5 py-2 text-xs"><span className="font-medium text-navy">{a.action.replace(/[._]/g, " ")}</span><span className="text-muted">{fmtDateTime(a.created_at)}</span></li>))}</ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
