/* Original inline SVG illustrations for MediMemory (no external assets). */

export function LogoMark({ className = "h-9 w-9" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mmLogo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2BC6C0" />
          <stop offset="1" stopColor="#2F7BEA" />
        </linearGradient>
      </defs>
      <path d="M24 42S5 30.5 5 17.5C5 11.2 9.8 6.5 15.8 6.5c3.6 0 6.6 1.8 8.2 4.6 1.6-2.8 4.6-4.6 8.2-4.6C38.2 6.5 43 11.2 43 17.5 43 30.5 24 42 24 42Z" fill="url(#mmLogo)" />
      <path d="M10 22h8l2.5-5 4 10 3-7 2 2H38" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HeartPulseArt({ className = "h-24 w-32" }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hpa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3FD3C6" /><stop offset="1" stopColor="#12A39F" /></linearGradient>
      </defs>
      <circle cx="120" cy="22" r="5" fill="#BFEDE7" /><circle cx="22" cy="92" r="4" fill="#CFE3FB" />
      <path d="M80 108S30 78 30 44c0-15 11-26 25-26 10 0 18 5 25 13 7-8 15-13 25-13 14 0 25 11 25 26 0 34-50 64-50 64Z" fill="url(#hpa)" opacity=".95" />
      <path d="M8 62h44l8-16 12 30 10-22 6 8h64" fill="none" stroke="#0E8C89" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
      <path d="M44 62h8l8-16 12 30 10-22 6 8h24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClipboardShieldArt({ className = "w-full max-w-md" }) {
  return (
    <svg viewBox="0 0 420 340" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="csB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2F7BEA" /><stop offset="1" stopColor="#1A52A8" /></linearGradient>
        <linearGradient id="csT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3FD3C6" /><stop offset="1" stopColor="#0E8C89" /></linearGradient>
      </defs>
      <path d="M70 250c-40-30-30-110 40-140 50-22 70-70 140-70 80 0 140 60 130 140-8 70-70 110-150 110-60 0-120-10-160-40Z" fill="#DDF6F1" />
      <circle cx="356" cy="70" r="7" fill="#BFEDE7" /><circle cx="60" cy="96" r="5" fill="#CFE3FB" /><circle cx="330" cy="268" r="5" fill="#CFE3FB" />
      <rect x="120" y="58" width="170" height="226" rx="18" fill="url(#csB)" />
      <rect x="134" y="80" width="142" height="190" rx="10" fill="#fff" />
      <rect x="168" y="40" width="74" height="38" rx="10" fill="#1A52A8" /><circle cx="205" cy="52" r="7" fill="#fff" />
      <path d="M196 104h18v18h18v18h-18v18h-18v-18h-18v-18h18z" fill="#2F7BEA" />
      <rect x="156" y="182" width="96" height="9" rx="4.5" fill="#D3E4FB" /><rect x="156" y="202" width="80" height="9" rx="4.5" fill="#D3E4FB" />
      <rect x="156" y="222" width="90" height="9" rx="4.5" fill="#D3E4FB" /><rect x="156" y="242" width="60" height="9" rx="4.5" fill="#D3E4FB" />
      <path d="M40 220h70l14-28 18 52 14-36 10 12h40" fill="none" stroke="#12A39F" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M300 150l52 20v40c0 36-24 60-52 72-28-12-52-36-52-72v-40Z" fill="url(#csT)" />
      <path d="M278 210l16 16 30-34" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RobotArt({ className = "h-28 w-28" }) {
  return (
    <svg viewBox="0 0 140 140" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#DCE8F8" /></linearGradient>
      </defs>
      <path d="M22 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#7FB4F5" /><path d="M120 92l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#7FDCD4" />
      <circle cx="116" cy="34" r="3" fill="#7FB4F5" />
      <rect x="66" y="10" width="8" height="16" rx="4" fill="#2F7BEA" /><circle cx="70" cy="10" r="6" fill="#2F7BEA" />
      <rect x="30" y="24" width="80" height="62" rx="28" fill="url(#rb)" stroke="#C6D8F2" strokeWidth="2" />
      <rect x="40" y="36" width="60" height="38" rx="19" fill="#0E2D5A" />
      <ellipse cx="57" cy="55" rx="7" ry="8" fill="#5AD7F0" /><ellipse cx="83" cy="55" rx="7" ry="8" fill="#5AD7F0" />
      <rect x="22" y="46" width="10" height="20" rx="5" fill="#2F7BEA" /><rect x="108" y="46" width="10" height="20" rx="5" fill="#2F7BEA" />
      <path d="M46 92c0-6 10-8 24-8s24 2 24 8v14c0 12-10 22-24 22s-24-10-24-22Z" fill="url(#rb)" stroke="#C6D8F2" strokeWidth="2" />
      <circle cx="70" cy="104" r="7" fill="#2F7BEA" />
      <rect x="32" y="96" width="12" height="22" rx="6" fill="#DCE8F8" stroke="#C6D8F2" strokeWidth="2" />
      <rect x="96" y="96" width="12" height="22" rx="6" fill="#DCE8F8" stroke="#C6D8F2" strokeWidth="2" />
    </svg>
  );
}

export function CalendarPillsArt({ className = "h-28 w-32" }) {
  return (
    <svg viewBox="0 0 150 120" className={className} aria-hidden="true">
      <rect x="40" y="18" width="92" height="84" rx="12" fill="#fff" stroke="#BCD5F6" strokeWidth="2" />
      <rect x="40" y="18" width="92" height="22" rx="12" fill="#2F7BEA" /><rect x="40" y="30" width="92" height="10" fill="#2F7BEA" />
      <rect x="58" y="8" width="7" height="18" rx="3.5" fill="#1A52A8" /><rect x="107" y="8" width="7" height="18" rx="3.5" fill="#1A52A8" />
      {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => (
        <rect key={`${r}${c}`} x={50 + c * 19} y={48 + r * 13} width="12" height="8" rx="2" fill={r === 1 && c === 2 ? "#12A39F" : "#D3E4FB"} />
      )))}
      <g transform="rotate(-28 34 92)"><rect x="12" y="84" width="44" height="18" rx="9" fill="#fff" stroke="#C6D8F2" strokeWidth="2" /><path d="M34 84h13a9 9 0 0 1 0 18H34Z" fill="#2F7BEA" /></g>
      <circle cx="30" cy="62" r="9" fill="#fff" stroke="#C6D8F2" strokeWidth="2" /><path d="M24 62h12" stroke="#C6D8F2" strokeWidth="2" />
    </svg>
  );
}

export function HeartBadge({ className = "h-12 w-12" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#EAF2FD" />
      <path d="M24 36s-11-6.6-11-14.2c0-3.6 2.7-6.3 6.1-6.3 2.1 0 3.8 1 4.9 2.6 1.1-1.6 2.8-2.6 4.9-2.6 3.4 0 6.1 2.7 6.1 6.3C35 29.4 24 36 24 36Z" fill="#2BA3F0" />
    </svg>
  );
}
