/** Undraw-style flat illustration: a rider next to a map with a route + pin. */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 640" className={className} role="img" aria-label="City map with a car on a route">
      <defs>
        <linearGradient id="rs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.97 0.02 240)" />
          <stop offset="100%" stopColor="oklch(0.93 0.03 240)" />
        </linearGradient>
        <linearGradient id="rs-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f4f6fa" />
        </linearGradient>
      </defs>

      {/* backdrop blob */}
      <path
        d="M60 340c0-140 110-260 260-260s260 120 260 260-110 260-260 260S60 480 60 340z"
        fill="url(#rs-sky)"
      />

      {/* map card */}
      <g transform="translate(90 120)">
        <rect width="460" height="330" rx="24" fill="url(#rs-card)" stroke="oklch(0.9 0 0)" />
        {/* grid streets */}
        <g stroke="oklch(0.88 0.02 240)" strokeWidth="2">
          <path d="M0 90 H460" />
          <path d="M0 170 H460" />
          <path d="M0 250 H460" />
          <path d="M110 0 V330" />
          <path d="M240 0 V330" />
          <path d="M360 0 V330" />
        </g>
        {/* park */}
        <rect x="20" y="20" width="80" height="60" rx="10" fill="oklch(0.9 0.09 155)" />
        <circle cx="45" cy="50" r="10" fill="oklch(0.75 0.14 155)" />
        <circle cx="75" cy="55" r="8" fill="oklch(0.75 0.14 155)" />
        {/* buildings */}
        <rect x="260" y="30" width="80" height="50" rx="6" fill="oklch(0.88 0.03 250)" />
        <rect x="380" y="20" width="60" height="60" rx="6" fill="oklch(0.85 0.05 250)" />
        <rect x="20" y="180" width="70" height="60" rx="6" fill="oklch(0.88 0.03 250)" />

        {/* animated route */}
        <path
          d="M40 300 Q 120 260 160 220 T 300 160 T 420 60"
          fill="none"
          stroke="oklch(0.55 0.2 260)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="10 8"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-36" dur="1.6s" repeatCount="indefinite" />
        </path>

        {/* pin at destination */}
        <g transform="translate(420 60)">
          <circle r="22" fill="oklch(0.55 0.2 260 / 0.18)">
            <animate attributeName="r" from="8" to="26" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.6" to="0" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <path d="M0 -18 c 10 0 14 8 14 15 c 0 10 -14 22 -14 22 s -14 -12 -14 -22 c 0 -7 4 -15 14 -15z" fill="oklch(0.55 0.2 260)" />
          <circle r="4" fill="#fff" cy="-3" />
        </g>

        {/* car on route */}
        <g>
          <animateMotion dur="6s" repeatCount="indefinite" rotate="auto"
            path="M40 300 Q 120 260 160 220 T 300 160 T 420 60" />
          <g transform="translate(-16 -8)">
            <rect x="0" y="0" width="32" height="14" rx="4" fill="oklch(0.2 0 0)" />
            <rect x="6" y="-6" width="20" height="8" rx="3" fill="oklch(0.35 0 0)" />
            <circle cx="8" cy="14" r="3.2" fill="#fff" stroke="oklch(0.2 0 0)" strokeWidth="1.5" />
            <circle cx="24" cy="14" r="3.2" fill="#fff" stroke="oklch(0.2 0 0)" strokeWidth="1.5" />
          </g>
        </g>
      </g>

      {/* rider standing */}
      <g transform="translate(430 340)">
        <circle cx="50" cy="30" r="20" fill="oklch(0.85 0.06 60)" />
        <path d="M30 60 h40 v70 a12 12 0 0 1-12 12 h-16 a12 12 0 0 1-12-12z" fill="oklch(0.55 0.2 260)" />
        <rect x="34" y="142" width="10" height="46" rx="4" fill="oklch(0.25 0.05 260)" />
        <rect x="56" y="142" width="10" height="46" rx="4" fill="oklch(0.25 0.05 260)" />
        <rect x="60" y="70" width="26" height="10" rx="4" fill="oklch(0.85 0.06 60)" />
        <rect x="80" y="60" width="14" height="24" rx="4" fill="oklch(0.2 0 0)" />
      </g>

      {/* floating badge */}
      <g transform="translate(70 470)">
        <rect width="200" height="60" rx="14" fill="#fff" stroke="oklch(0.9 0 0)" />
        <circle cx="30" cy="30" r="12" fill="oklch(0.9 0.14 155)" />
        <path d="M25 30 l4 4 l7-8" stroke="oklch(0.35 0.15 155)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="52" y="28" fontFamily="Inter, sans-serif" fontSize="13" fill="oklch(0.2 0 0)" fontWeight="600">Verified host</text>
        <text x="52" y="46" fontFamily="Inter, sans-serif" fontSize="11" fill="oklch(0.5 0 0)">ID & documents checked</text>
      </g>
    </svg>
  );
}
