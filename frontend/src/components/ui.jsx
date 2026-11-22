import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { LogoMark } from "./illustrations";
import { Loader2, X } from "lucide-react";

export const Spinner = ({ className = "h-5 w-5" }) => <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.7rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = "", bodyClass = "p-5", icon: Icon }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 px-5 pb-1 pt-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">{Icon && <Icon className="h-4 w-4 text-brand" />}{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div>
      {label && <label className="label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p>}
    </div>
  );
}

const BADGE = {
  teal: "bg-emerald-50 text-emerald-700", navy: "bg-brand-50 text-brand-700", mint: "bg-mint text-teal-700",
  amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", gray: "bg-canvas text-muted",
};
export const Badge = ({ color = "gray", children, className = "" }) => <span className={`chip ${BADGE[color]} ${className}`}>{children}</span>;

export const StatusBadge = ({ status }) => {
  const map = {
    confirmed: ["teal", "Confirmed"], pending_review: ["amber", "Awaiting your review"], failed: ["red", "Extraction failed"],
    uploaded: ["gray", "Uploaded"], scheduled: ["navy", "Scheduled"], completed: ["teal", "Completed"], cancelled: ["gray", "Cancelled"],
    taken: ["teal", "Taken"], missed: ["red", "Missed"], pending: ["gray", "Not recorded"], dismissed: ["gray", "Dismissed"],
    accepted: ["teal", "Accepted"], revoked: ["gray", "Revoked"], expired: ["gray", "Expired"],
  };
  const [c, l] = map[status] || ["gray", status];
  return <Badge color={c}>{l}</Badge>;
};

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {Icon && <span className="mb-3 rounded-2xl bg-brand-50 p-3 text-brand"><Icon className="h-6 w-6" /></span>}
      <p className="font-semibold text-navy">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted"><Spinner /> {label}</div>;
}

export function ErrorBox({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {message}{onRetry && <button className="ml-2 font-semibold underline" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector("input,select,textarea,button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-navy">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted hover:bg-canvas"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel = "Delete", onConfirm, onClose, busy }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-danger" disabled={busy} onClick={onConfirm}>{busy && <Spinner className="h-4 w-4" />}{confirmLabel}</button></>}>
      <p className="text-sm text-muted">{text}</p>
    </Modal>
  );
}

const TONES = {
  teal: "bg-brand-50 text-brand", blue: "bg-brand-50 text-brand", navy: "bg-brand-50 text-brand",
  orange: "bg-orange-50 text-orange-500", green: "bg-emerald-50 text-emerald-600", mint: "bg-orange-50 text-orange-500", amber: "bg-emerald-50 text-emerald-600",
};
export function StatCard({ icon: Icon, label, value, tone = "blue", to }) {
  const Inner = (
    <div className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      <span className={`icon-tile h-12 w-12 ${TONES[tone]}`}><Icon className="h-6 w-6" /></span>
      <div><p className="text-xs font-medium text-muted">{label}</p><p className="text-2xl font-bold leading-tight text-ink">{value}</p></div>
    </div>
  );
  return to ? <Link to={to} className="block">{Inner}</Link> : Inner;
}

export function Toggle({ checked, onChange, label, description, id }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span><span className="block text-sm font-medium text-navy">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}</span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-line transition peer-checked:bg-teal peer-focus-visible:ring-2 peer-focus-visible:ring-teal/40" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export const Logo = ({ light, className = "" }) => (
  <span className={`flex items-center gap-2 ${className}`}>
    <LogoMark className="h-9 w-9" />
    <span className={`text-xl font-bold tracking-tight ${light ? "text-white" : "text-navy"}`}>Medi<span className={light ? "text-white" : "text-brand"}>Memory</span></span>
  </span>
);
