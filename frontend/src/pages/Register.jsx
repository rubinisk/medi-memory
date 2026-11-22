import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { ErrorBox, Field, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../services/api";
import { AuthShell } from "./Login";

export const passwordChecks = (p) => [
  { ok: p.length >= 8, label: "At least 8 characters" },
  { ok: /[A-Z]/.test(p), label: "An uppercase letter" },
  { ok: /[a-z]/.test(p), label: "A lowercase letter" },
  { ok: /\d/.test(p), label: "A number" },
];

export default function Register() {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const checks = passwordChecks(form.password);

  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (form.full_name.trim().length < 2) v.full_name = "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) v.email = "Enter a valid email address.";
    if (!checks.every((c) => c.ok)) v.password = "Password doesn’t meet all the requirements.";
    if (form.password !== form.confirm) v.confirm = "Passwords don’t match.";
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError("");
    try {
      await register(form.full_name.trim(), form.email.trim(), form.password);
      navigate("/app");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start your personal medical memory."
      footer={<>Already have an account? <Link className="font-semibold text-teal" to="/login">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <Field label="Full name" htmlFor="full_name" error={errors.full_name}>
          <input id="full_name" className="input" autoComplete="name" value={form.full_name} onChange={set("full_name")} />
        </Field>
        <Field label="Email" htmlFor="reg_email" error={errors.email}>
          <input id="reg_email" type="email" className="input" autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Password" htmlFor="reg_password" error={errors.password}>
          <input id="reg_password" type="password" className="input" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        <ul className="grid grid-cols-2 gap-1 text-xs" aria-label="Password requirements">
          {checks.map((c) => (
            <li key={c.label} className={`flex items-center gap-1 ${c.ok ? "text-teal" : "text-muted"}`}>
              {c.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{c.label}
            </li>
          ))}
        </ul>
        <Field label="Confirm password" htmlFor="reg_confirm" error={errors.confirm}>
          <input id="reg_confirm" type="password" className="input" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
        </Field>
        <button className="btn-primary w-full" disabled={busy} type="submit">{busy && <Spinner className="h-4 w-4" />} Create account</button>
        <p className="text-xs text-muted">Please use fictional data while testing this prototype. AI and voice processing stay off until you turn them on in Settings.</p>
      </form>
    </AuthShell>
  );
}
