import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Live crack-detection pipeline diagram for the overview page.
 * Capture → (quality gate / irradiance flatten) → UNet mask → measure →
 * (severity / export) → engineer review.
 */
export function CrackPipeline({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 1011 212"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-auto w-full max-h-55 min-w-220 max-w-[63.1875rem]", className)}
      {...props}
    >
      {/* ---------------- connectors ---------------- */}
      <g stroke="var(--border)" strokeWidth="1.25">
        <path d="M107 108H133.297C146.552 108 157.297 97.2548 157.297 84V45.5C157.297 32.2452 168.042 21.5 181.297 21.5H184.347" />
        <path d="M107 109H133.022C146.277 109 157.022 119.745 157.022 133V172C157.022 185.255 167.767 196 181.022 196H183.925" />
        <path d="M282.5 108H366" />
        <path d="M365.977 108H334.772C321.517 108 310.772 97.2548 310.772 84V45.5C310.772 32.2452 300.027 21.5 286.772 21.5H281.082" />
        <path d="M365.977 109H335.074C321.819 109 311.074 119.745 311.074 133V172C311.074 185.255 300.329 196 287.074 196H281.546" />
        <path d="M475.5 108.5H549" />
        <path d="M550 108H654.243" />
        <path d="M654.243 107H682.232C695.486 107 706.232 96.2548 706.232 83V44.5C706.232 31.2452 716.977 20.5 730.232 20.5H734.192" />
        <path d="M654.243 108H681.947C695.202 108 705.947 118.745 705.947 132V171C705.947 184.255 716.693 195 729.947 195H733.755" />
      </g>

      {/* ---------------- flow dots ---------------- */}
      <g fill="var(--primary)" stroke="var(--card)" strokeWidth="1.6">
        <circle cx="106.489" cy="108.489" r="4.6" />
        <circle cx="287" cy="20" r="4.2" />
        <circle cx="287" cy="191" r="4.2" />
        <circle cx="366" cy="108" r="4.2" />
        <circle cx="475.5" cy="108.5" r="4.6" />
        <circle cx="550" cy="108" r="4.2" />
        <circle cx="654" cy="107" r="4.2" />
        <circle cx="733.8" cy="20" r="4.2" />
        <circle cx="733.8" cy="194.8" r="4.2" />
        <circle cx="916" cy="104" r="4.2" />
        <circle cx="916.4" cy="105" r="4.2" className="animate-pulse" />
      </g>

      {/* ---------------- stage: capture ---------------- */}
      <g>
        <rect x="0.5" y="78.5" width="106" height="56" rx="7.5" fill="var(--card)" stroke="var(--border)" />
        <text x="16" y="101" fontSize="13" fontWeight="600" fill="var(--foreground)">Capture</text>
        <text x="16" y="120" fontSize="11" fill="var(--muted-foreground)">2.5 m standoff</text>
      </g>

      {/* ---------------- branches ---------------- */}
      <g>
        <rect x="183.5" y="0.5" width="99" height="56" rx="7.5" fill="var(--card)" stroke="var(--border)" />
        <text x="198" y="23" fontSize="13" fontWeight="600" fill="var(--foreground)">Quality</text>
        <text x="198" y="42" fontSize="11" fill="var(--muted-foreground)">blur gate</text>
      </g>
      <g>
        <rect x="183.5" y="155.5" width="99" height="56" rx="7.5" fill="var(--card)" stroke="var(--border)" />
        <text x="198" y="178" fontSize="13" fontWeight="600" fill="var(--foreground)">Flatten</text>
        <text x="198" y="197" fontSize="11" fill="var(--muted-foreground)">IR texture</text>
      </g>

      {/* ---------------- stage: segmentation ---------------- */}
      <g>
        <rect x="366.5" y="78.5" width="109" height="56" rx="7.5" fill="var(--accent)" stroke="var(--primary)" />
        <text x="382" y="101" fontSize="13" fontWeight="700" fill="var(--primary)">UNet mask</text>
        <text x="382" y="120" fontSize="11" fill="var(--accent-foreground)">CrackNet v3.2</text>
      </g>

      {/* ---------------- stage: measure ---------------- */}
      <g>
        <rect x="549.5" y="78.5" width="106" height="56" rx="7.5" fill="var(--card)" stroke="var(--border)" />
        <text x="565" y="101" fontSize="13" fontWeight="600" fill="var(--foreground)">Measure</text>
        <text x="565" y="120" fontSize="11" fill="var(--muted-foreground)">mm per px</text>
      </g>

      {/* ---------------- branches: severity / export ---------------- */}
      <g>
        <rect x="732.5" y="0.5" width="99" height="56" rx="7.5" fill="var(--card)" stroke="var(--border)" />
        <text x="747" y="23" fontSize="13" fontWeight="600" fill="var(--foreground)">Severity</text>
        <text x="747" y="42" fontSize="11" fill="var(--muted-foreground)">width class</text>
      </g>
      <g>
        <rect x="732.5" y="155.5" width="99" height="56" rx="7.5" fill="var(--card)" stroke="var(--border)" />
        <text x="747" y="178" fontSize="13" fontWeight="600" fill="var(--foreground)">Export</text>
        <text x="747" y="197" fontSize="11" fill="var(--muted-foreground)">JSON · PDF</text>
      </g>

      {/* ---------------- stage: review ---------------- */}
      <g>
        <rect x="915.5" y="78.5" width="95" height="56" rx="7.5" fill="var(--card)" stroke="var(--primary)" strokeDasharray="4 3" />
        <text x="930" y="101" fontSize="13" fontWeight="600" fill="var(--primary)">Review</text>
        <text x="930" y="120" fontSize="11" fill="var(--muted-foreground)">Engineer</text>
      </g>
    </svg>
  );
}
