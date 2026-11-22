import { Link } from "react-router-dom";
import {
  ArrowRight, AudioLines, BellRing, Bot, FileSearch, FileText, HeartHandshake, Lock, Mic, ShieldCheck, Sparkles,
} from "lucide-react";
import { ClipboardShieldArt, RobotArt } from "../components/illustrations";
import { Logo } from "../components/ui";

const HIGHLIGHTS = [
  { icon: FileText, label: "Smart Document Processing" },
  { icon: Bot, label: "AI Health Assistant" },
  { icon: Mic, label: "Voice Interaction" },
  { icon: BellRing, label: "Medication Reminders" },
];

const FEATURES = [
  { icon: FileSearch, title: "Every record in one place", text: "Upload prescriptions, lab reports and notes. Details are extracted, and nothing is saved until you confirm it.", tone: "bg-brand-50 text-brand" },
  { icon: Sparkles, title: "Answers from your own records", text: "Ask in plain language. Every answer shows the record and date it came from, or says it couldn't find it.", tone: "bg-teal-50 text-teal" },
  { icon: AudioLines, title: "Talk to it, powered by ElevenLabs", text: "Ask with your voice and hear the answer read back in a natural voice.", tone: "bg-sky-50 text-sky-600" },
  { icon: BellRing, title: "Medicines and follow-ups", text: "Schedules exactly as prescribed, daily reminders and a clear list of upcoming appointments.", tone: "bg-orange-50 text-orange-500" },
  { icon: HeartHandshake, title: "Family, with your consent", text: "Give a caregiver view-only access to chosen sections. Revoke it any time and see when they looked.", tone: "bg-rose-50 text-rose-500" },
  { icon: ShieldCheck, title: "Safe by design", text: "No diagnosis. No dose changes. Clear labels for what's confirmed, what's pending and what's a general explanation.", tone: "bg-emerald-50 text-emerald-600" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-brand-50/70 via-white to-mint-50">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm font-medium text-ink md:flex">
            <a href="#top" className="hover:text-brand">Home</a>
            <a href="#features" className="hover:text-brand">Features</a>
            <a href="#about" className="hover:text-brand">About</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/register" className="btn-ghost hidden sm:inline-flex">Sign up</Link>
            <Link to="/login" className="btn-primary rounded-full px-6">Login</Link>
          </div>
        </header>

        <section id="top" className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-10 pt-6 lg:grid-cols-2 lg:pt-12">
          <div>
            <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-navy sm:text-5xl">
              Your Medical History, Remembered.<br /><span className="text-teal">Your Healthcare, Understood.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              An AI-powered personal medical memory assistant to store, understand and access your health information, anytime, anywhere.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary rounded-full px-6 py-3 text-base">Get Started <ArrowRight className="h-4 w-4" /></Link>
              <a href="#features" className="btn-outline rounded-full border-navy/20 px-6 py-3 text-base">Learn More</a>
              <Link to="/login?demo=1" className="btn-ghost rounded-full px-4 py-3 text-base">Try the demo patient</Link>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Lock className="h-3.5 w-3.5" /> Hackathon prototype. Demo data is fictional. MediMemory does not diagnose or replace your doctor.</p>
          </div>
          <div className="flex justify-center"><ClipboardShieldArt className="w-full max-w-lg animate-float" /></div>
        </section>

        <div className="mx-auto max-w-6xl px-5 pb-12">
          <div className="grid grid-cols-2 divide-line rounded-3xl bg-white/80 py-5 shadow-card ring-1 ring-line/70 backdrop-blur md:grid-cols-4 md:divide-x">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 px-4 py-3 text-center">
                <Icon className="h-7 w-7 text-brand" strokeWidth={1.8} />
                <span className="text-sm font-medium text-ink">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section id="features" className="py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-bold text-navy">Built for the moments after the doctor's visit</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-muted">Instructions get forgotten, papers get scattered and medical terms are hard to follow. MediMemory brings it together.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text, tone }) => (
              <div key={title} className="card p-6 transition hover:-translate-y-1">
                <span className={`icon-tile h-12 w-12 ${tone}`}><Icon className="h-6 w-6" /></span>
                <h3 className="mt-4 font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="pb-16">
        <div className="mx-auto grid max-w-6xl items-center gap-8 rounded-3xl bg-navy px-6 py-10 text-white sm:px-10 lg:grid-cols-[auto_1fr_auto]">
          <RobotArt className="mx-auto h-28 w-28" />
          <div>
            <h2 className="text-2xl font-bold">Ask: “What did my doctor tell me last time?”</h2>
            <p className="mt-2 max-w-2xl text-navy-100">MediMemory answers from your saved consultations, prescriptions and reports, with the source and date, by text or by voice. If it isn't in your records, it says so.</p>
          </div>
          <Link to="/login?demo=1" className="btn-primary rounded-full px-6 py-3">Try the demo <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-muted sm:flex-row sm:justify-between">
          <span>© MediMemory · Hackathon prototype</span>
          <span>Not a medical device. Always follow your doctor's advice.</span>
        </div>
      </footer>
    </div>
  );
}
