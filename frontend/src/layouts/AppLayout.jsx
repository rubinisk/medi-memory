import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, AudioLines, Bell, Bot, CalendarDays, FileText, HeartHandshake, House, LogOut, Menu, Pill, Search, Settings, Stethoscope, X,
} from "lucide-react";
import { HeartBadge } from "../components/illustrations";
import { Logo, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, errorMessage, fmtTime } from "../services/api";

export const NAV = [
  { to: "/app", label: "Overview", icon: House, end: true },
  { to: "/app/records", label: "Medical Records", icon: FileText },
  { to: "/app/timeline", label: "Health Timeline", icon: Activity },
  { to: "/app/consultations", label: "Consultations", icon: Stethoscope },
  { to: "/app/assistant", label: "AI Assistant", icon: Bot },
  { to: "/app/voice", label: "Voice Assistant", icon: AudioLines },
  { to: "/app/medications", label: "Medications", icon: Pill },
  { to: "/app/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/app/family", label: "Family Access", icon: HeartHandshake },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function Sidebar({ onNavigate }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col bg-navy text-white">
      <div className="px-5 pb-6 pt-6"><Logo light /></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main navigation">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${isActive ? "bg-teal text-white shadow-lg shadow-teal/25" : "text-navy-100 hover:bg-white/5 hover:text-white"}`}>
            <Icon className="h-[18px] w-[18px]" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 p-4">
        <div className="relative overflow-hidden rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <p className="text-sm font-semibold leading-snug">Your Health.<br />Our Priority <span className="text-sky-300">♥</span></p>
          <p className="mt-1 text-[11px] text-navy-100">Answers come only from your own records.</p>
          <HeartBadge className="absolute -bottom-2 -right-2 h-14 w-14 opacity-30" />
        </div>
        <button className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-navy-100 hover:bg-white/5 hover:text-white"
          onClick={async () => { await logout(); navigate("/login"); }}>
          <LogOut className="h-[18px] w-[18px]" /> Logout
        </button>
      </div>
    </div>
  );
}

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

function ReminderBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const box = useRef(null);
  const loc = useLocation();
  const load = () => api.get("/api/reminders/today").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, [loc.pathname]);
  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const pending = items.filter((r) => r.status === "pending");
  return (
    <div ref={box} className="relative">
      <button className="relative rounded-xl p-2 text-navy hover:bg-brand-50" aria-label={`Today's reminders (${pending.length} open)`} onClick={() => { setOpen(!open); if (!open) load(); }}>
        <Bell className="h-5 w-5" />
        {pending.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">{pending.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <p className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Today's reminders</p>
          {items.length === 0 ? <p className="px-4 py-4 text-sm text-muted">No reminders today.</p> : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">{items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-12 font-semibold text-brand">{fmtTime(r.due_at)}</span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className={`text-[11px] font-semibold ${r.status === "taken" ? "text-emerald-600" : r.status === "missed" ? "text-red-500" : "text-muted"}`}>{r.status === "pending" ? "open" : r.status}</span>
              </li>))}</ul>)}
          <Link to="/app/medications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs font-semibold text-brand">Open medication timeline</Link>
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();
  const box = useRef(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(async () => {
      setBusy(true); setErr("");
      try { setRes((await api.get("/api/search", { params: { q: q.trim() } })).data.results); }
      catch (e) { setErr(errorMessage(e)); }
      finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setRes(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const go = (r) => {
    const path = { document: `/app/records/${r.id}`, consultation: `/app/consultations?open=${r.id}`, medication: "/app/medications", appointment: "/app/appointments" }[r.type];
    setQ(""); setRes(null); navigate(path);
  };
  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
      <input className="input rounded-full border-transparent bg-canvas pl-9" placeholder="Search your medical records…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your records" />
      {busy && <Spinner className="absolute right-3 top-2.5 h-4 w-4 text-muted" />}
      {(res || err) && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-line bg-white shadow-card">
          {err && <p className="p-3 text-sm text-red-600">{err}</p>}
          {res && res.length === 0 && <p className="p-3 text-sm text-muted">No records match “{q}”.</p>}
          {res?.slice(0, 8).map((r) => (
            <button key={r.type + r.id} onClick={() => go(r)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-canvas">
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-navy">{r.title}</span>
                <span className="block truncate text-xs text-muted">{r.subtitle}</span></span>
              <span className="chip shrink-0 bg-canvas capitalize text-muted">{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Polls for due reminders and shows in-app (and, if allowed, browser) notifications. */
function ReminderPoller() {
  const toast = useToast();
  const shown = useRef(new Set());
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const due = (await api.get("/api/reminders/due")).data;
        for (const r of due) {
          if (shown.current.has(r.id) || stop) continue;
          shown.current.add(r.id);
          const act = (status) => api.patch(`/api/reminders/${r.id}`, { status }).then(() => toast.success(status === "taken" ? "Marked as taken." : "Reminder updated.")).catch((e) => toast.error(errorMessage(e)));
          toast.reminder(`${r.title}${r.detail ? " · " + r.detail : ""} (due ${fmtTime(r.due_at)})`, {
            title: r.kind === "medication" ? "Medication reminder" : "Appointment reminder",
            actions: r.kind === "medication" ? [{ label: "Mark taken", onClick: () => act("taken") }, { label: "Missed", onClick: () => act("missed") }]
              : [{ label: "Dismiss", onClick: () => act("dismissed") }],
          });
          if ("Notification" in window && Notification.permission === "granted") {
            try { new Notification("MediMemory reminder", { body: r.title }); } catch { /* ignore */ }
          }
        }
      } catch { /* offline or logged out: try again next tick */ }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => { stop = true; clearInterval(id); };
  }, []); // eslint-disable-line
  return null;
}

export default function AppLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const current = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]"><Sidebar onNavigate={() => setOpen(false)} />
            <button className="absolute right-3 top-5 rounded-lg p-1 text-white" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line/70 bg-white/85 px-4 py-3 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-navy hover:bg-canvas lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <span className="hidden text-sm font-semibold text-ink md:block lg:hidden">{current?.label}</span>
          <div className="flex flex-1 justify-end lg:justify-start"><GlobalSearch /></div>
          <ReminderBell />
          <Link to="/app/settings" aria-label="Profile and settings" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white ring-4 ring-brand-50">{initials(user?.full_name)}</Link>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet /></main>
      </div>
      <ReminderPoller />
    </div>
  );
}
