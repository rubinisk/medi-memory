import { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, Bell, CheckCircle2, Info, X } from "lucide-react";

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info, reminder: Bell };
const STYLES = {
  success: "border-teal-100 bg-white text-ink [&_svg.lead]:text-teal",
  error: "border-red-200 bg-white text-ink [&_svg.lead]:text-red-600",
  info: "border-line bg-white text-ink [&_svg.lead]:text-navy-700",
  reminder: "border-mint-300 bg-mint-50 text-ink [&_svg.lead]:text-teal",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((type, message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, type, message, ...opts }]);
    if (!opts.sticky) setTimeout(() => dismiss(id), opts.duration || 4500);
    return id;
  }, [dismiss]);

  const toast = {
    success: (m, o) => push("success", m, o),
    error: (m, o) => push("error", m, { duration: 7000, ...o }),
    info: (m, o) => push("info", m, o),
    reminder: (m, o) => push("reminder", m, { sticky: true, ...o }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-6" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div key={t.id} role={t.type === "error" ? "alert" : "status"}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-card ${STYLES[t.type]}`}>
              <Icon className="lead mt-0.5 h-5 w-5 shrink-0" />
              <div className="flex-1 text-sm">
                {t.title && <p className="font-semibold text-navy">{t.title}</p>}
                <p>{t.message}</p>
                {t.actions && <div className="mt-2 flex gap-2">{t.actions.map((a) => (
                  <button key={a.label} className="btn-outline px-3 py-1 text-xs" onClick={() => { a.onClick(); dismiss(t.id); }}>{a.label}</button>
                ))}</div>}
              </div>
              <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="text-muted hover:text-navy"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
