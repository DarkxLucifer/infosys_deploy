import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ShieldCheck, Moon, Sun } from "lucide-react";
import { CrackDetectionIllustration } from "@/components/ui/crack-detection-illustration";
import { useTheme } from "@/components/watermelon/astrix-dashboard/components/astrix/theme-provider";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
}

export function AuthLayout({
  children,
  title,
  subtitle = "AI-assisted infrastructure inspection",
  maxWidthClass = "max-w-[420px]",
}: AuthLayoutProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Top navigation bar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-border/50 lg:border-none">
        <Link to="/" className="inline-flex items-center gap-2 group">
          <img src="/infrascan-logo.png" alt="InfraScan" className="h-9 w-auto object-contain rounded-md" />
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Toggle color theme"
            aria-label="Toggle color theme"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ArrowLeft className="size-3.5" />
            <span>Home</span>
          </Link>
        </div>
      </header>

      {/* Main split-screen container (Desktop 1024px+ split, Mobile single column) */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid lg:grid-cols-12 gap-8 items-center">
        {/* Left column: Form card on --background */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center">
          <div className={`w-full ${maxWidthClass} space-y-6`}>
            {/* Header copy */}
            <div className="text-center sm:text-left space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>

            {/* Decision support note */}
            <div className="rounded-lg bg-secondary/70 border border-border px-3.5 py-2.5 text-xs text-foreground/80 leading-snug">
              <strong className="text-primary font-semibold">Engineering Notice:</strong> AI results in InfraScan are decision support. Engineer review is required.
            </div>

            {/* Form card */}
            <div className="bg-card border border-border rounded-xl p-6 sm:p-8 shadow-sm">
              {children}
            </div>

            {/* Sub-card audit notice & Legal links */}
            <div className="text-center space-y-3 pt-1">
              <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" />
                <span>Session timeout and audit logging apply.</span>
              </div>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <Link to="/privacy" className="hover:text-brand-accent hover:underline">Privacy notice</Link>
                <span>·</span>
                <Link to="/terms" className="hover:text-brand-accent hover:underline">Terms of use</Link>
                <span>·</span>
                <Link to="/accessibility" className="hover:text-brand-accent hover:underline">Accessibility</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Right column (Desktop 1024px+): Brand panel in --primary with --primary-foreground */}
        <div className="hidden lg:flex lg:col-span-6 h-full items-center justify-center">
          <div className="w-full max-w-lg rounded-2xl bg-primary text-primary-foreground p-8 xl:p-10 shadow-lg flex flex-col justify-between space-y-8">
            <div className="space-y-3">
              <span className="inline-block px-3 py-1 rounded-full bg-primary-foreground/15 text-xs font-semibold tracking-wide uppercase">
                Enterprise Infrastructure
              </span>
              <h2 className="text-2xl xl:text-3xl font-bold tracking-tight text-primary-foreground leading-tight">
                AI-powered crack & damage assessment for civil engineering.
              </h2>
            </div>

            {/* Inert SVG Crack detection illustration with caption "Illustration" */}
            <div className="bg-primary-foreground/10 rounded-xl p-3 border border-primary-foreground/20">
              <CrackDetectionIllustration className="w-full" />
            </div>

            {/* 3 True points from the project report */}
            <ul className="space-y-3 text-sm text-primary-foreground/90">
              <li className="flex items-start gap-3">
                <div className="size-5 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="size-3 text-primary-foreground stroke-3" />
                </div>
                <span>Detect, outline and measure visible cracks and surface damage</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="size-5 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="size-3 text-primary-foreground stroke-3" />
                </div>
                <span>An engineer reviews every AI finding before it is reported</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="size-5 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="size-3 text-primary-foreground stroke-3" />
                </div>
                <span>Inspection history, maps and work orders for every asset</span>
              </li>
            </ul>

            <p className="text-[11px] text-primary-foreground/70 border-t border-primary-foreground/20 pt-4">
              Visual damage alone is insufficient to determine structural integrity. Qualified engineering inspection required.
            </p>
          </div>
        </div>
      </main>

      <footer className="w-full py-4 text-center text-xs text-muted-foreground border-t border-border/40">
        InfraScan &copy; 2026 · AI-Assisted Infrastructure Inspection
      </footer>
    </div>
  );
}
