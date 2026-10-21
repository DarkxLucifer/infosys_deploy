/**
 * Inert SVG crack detection illustration (Part 0.2 Rule 9, Part 1.2, Part 2.2)
 * Purely decorative, aria-hidden="true", zero focusable elements or inputs.
 * Shows a concrete surface with a thin crack, a bounding box labelled "Longitudinal crack",
 * a translucent segmentation mask, and a chip "AI suggestion · awaiting engineer review".
 */
export function CrackDetectionIllustration({ className = "" }: { className?: string }) {
  return (
    <figure className={`flex flex-col items-center ${className}`}>
      <div
        aria-hidden="true"
        className="relative w-full aspect-4/3 rounded-xl overflow-hidden border border-border/80 bg-slate-900 shadow-md select-none pointer-events-none"
      >
        <svg
          viewBox="0 0 600 450"
          className="w-full h-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Concrete texture simulation */}
            <radialGradient id="concreteLight" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="60%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </radialGradient>
            <filter id="concreteNoise" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" result="noise" />
              <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.12 0" />
              <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
            </filter>
            {/* Crack mask gradient */}
            <linearGradient id="maskGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#433bff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#2f27ce" stopOpacity="0.65" />
            </linearGradient>
          </defs>

          {/* Background Concrete Surface */}
          <rect width="600" height="450" fill="url(#concreteLight)" filter="url(#concreteNoise)" />

          {/* Aggregate flecks */}
          <circle cx="120" cy="80" r="1.5" fill="#64748b" opacity="0.6" />
          <circle cx="480" cy="90" r="2" fill="#475569" opacity="0.5" />
          <circle cx="210" cy="380" r="1.5" fill="#64748b" opacity="0.6" />
          <circle cx="510" cy="340" r="2.5" fill="#475569" opacity="0.7" />
          <circle cx="90" cy="270" r="2" fill="#334155" opacity="0.8" />
          <circle cx="340" cy="70" r="1.2" fill="#64748b" opacity="0.5" />

          {/* Translucent AI Segmentation Mask Polygon */}
          <polygon
            points="180,110 230,150 250,220 235,310 290,380 270,390 215,320 230,230 210,160 165,115"
            fill="url(#maskGrad)"
          />

          {/* Thin Longitudinal Crack vector path */}
          <path
            d="M 172,112 Q 220,155 242,225 T 225,315 Q 260,355 280,385"
            fill="none"
            stroke="#050315"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Crack micro-fissure branch */}
          <path
            d="M 242,225 Q 265,245 282,252"
            fill="none"
            stroke="#050315"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M 225,315 Q 205,335 195,350"
            fill="none"
            stroke="#050315"
            strokeWidth="1.8"
            strokeLinecap="round"
          />

          {/* AI Bounding Box */}
          <rect
            x="145"
            y="95"
            width="170"
            height="310"
            fill="none"
            stroke="#433bff"
            strokeWidth="2"
            strokeDasharray="6 4"
            rx="4"
          />

          {/* Bounding box label header */}
          <g transform="translate(145, 72)">
            <rect x="0" y="0" width="138" height="23" rx="4" fill="#2f27ce" />
            <text x="8" y="15" fill="#fbfbfe" fontSize="11" fontFamily="Inter, sans-serif" fontWeight="600">
              Longitudinal crack
            </text>
            <text x="110" y="15" fill="#dedcff" fontSize="10" fontFamily="Inter, sans-serif">
              94%
            </text>
          </g>

          {/* AI Decision Support Chip */}
          <g transform="translate(20, 20)">
            <rect x="0" y="0" width="260" height="28" rx="14" fill="#050315" fillOpacity="0.82" />
            <circle cx="14" cy="14" r="4.5" fill="#dedcff" />
            <text x="26" y="18" fill="#fbfbfe" fontSize="11" fontFamily="Inter, sans-serif" fontWeight="500">
              AI suggestion · awaiting engineer review
            </text>
          </g>

          {/* Measurement metadata overlay */}
          <g transform="translate(390, 390)">
            <rect x="0" y="0" width="190" height="42" rx="8" fill="#050315" fillOpacity="0.85" stroke="#334155" strokeWidth="1" />
            <text x="12" y="17" fill="#dedcff" fontSize="10" fontFamily="Inter, sans-serif">Length: 412 px (uncalibrated)</text>
            <text x="12" y="32" fill="#dedcff" fontSize="10" fontFamily="Inter, sans-serif">Max Width: 18 px · Severity: Moderate</text>
          </g>
        </svg>
      </div>
      <figcaption className="text-xs text-muted-foreground mt-2 text-center select-none">
        Illustration
      </figcaption>
    </figure>
  );
}
