import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Info } from "lucide-react";
import { ClipboardShieldArt } from "../components/illustrations";
import { ErrorBox, Field, Logo, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../services/api";

export const DEMO = { email: "demo@medimemory.app", password: "Demo@1234" };
export const DEMO_CAREGIVER = { email: "caregiver.demo@medimemory.app", password: "Care@1234" };

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[46%] flex-col justify-between bg-gradient-to-br from-brand-50 via-white to-mint-50 p-10 lg:flex">
        <Link to="/"><Logo /></Link>
        <div>
          <ClipboardShieldArt className="mb-6 w-full max-w-sm" />
          <p className="text-3xl font-bold leading-snug text-navy">Your Medical History, Remembered.<br /><span className="text-teal">Your Healthcare, Understood.</span></p>
          <p className="mt-4 max-w-md text-muted">Answers come only from your saved records, with sources. No diagnosis, no dose changes.</p>
        </div>
        <p className="text-xs text-muted">Hackathon prototype · fictional demo data</p>
      </div>
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <Link to="/" className="lg:hidden"><Logo /></Link>
          <h1 className="mt-6 text-2xl font-bold text-navy lg:mt-0">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 text-sm text-muted">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("demo") ? DEMO.email : "");
  const [password, setPassword] = useState(params.get("demo") ? DEMO.password : "");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e, creds) => {
    e?.preventDefault();
    const em = creds?.email ?? email;
    const pw = creds?.password ?? password;
    const v = {};
    if (!/^\S+@\S+\.\S+$/.test(em)) v.email = "Enter a valid email address.";
    if (!pw) v.password = "Enter your password.";
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError("");
    try {
      await login(em, pw);
      navigate("/app");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your MediMemory account."
      footer={<>New here? <Link className="font-semibold text-teal" to="/register">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <Field label="Email" htmlFor="email" error={errors.email}>
          <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn-primary w-full" disabled={busy} type="submit">{busy && <Spinner className="h-4 w-4" />} Log in</button>
      </form>
      <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-navy"><Info className="h-4 w-4 text-teal" /> Demo accounts (fictional data)</p>
        <p className="mt-1 text-muted">Patient: <code>{DEMO.email}</code> / <code>{DEMO.password}</code></p>
        <p className="text-muted">Caregiver: <code>{DEMO_CAREGIVER.email}</code> / <code>{DEMO_CAREGIVER.password}</code></p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-navy px-3 py-1.5 text-xs" disabled={busy} onClick={() => submit(null, DEMO)}>Log in as demo patient</button>
          <button type="button" className="btn-outline px-3 py-1.5 text-xs" disabled={busy} onClick={() => submit(null, DEMO_CAREGIVER)}>Log in as demo caregiver</button>
        </div>
      </div>
    </AuthShell>
  );
}
