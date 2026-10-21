import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Camera, Cpu, UserCheck, Wrench,
  Layers, Database, ChevronDown, ChevronUp, ShieldCheck,
  CheckCircle2, Moon, Sun, Menu, X
} from "lucide-react";
import { useAuth } from "@/store/auth-context";
import { useTheme } from "@/components/watermelon/astrix-dashboard/components/astrix/theme-provider";
import { FEATURES } from "@/lib/features";

export default function LandingPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const fullWorkflowStages = [
    { num: 1, name: "Inspection Setup", desc: "Define asset segment, inspection protocol, environmental parameters, and camera calibration baseline." },
    { num: 2, name: "Image Capture & Validation", desc: "Ingest imagery with pre-analysis quality checks: blur detection, low lighting, resolution thresholds, completeness, and duplicate elimination." },
    { num: 3, name: "Preprocessing", desc: "Perspective correction, scale calibration mapping, noise reduction, and surface contrast enhancement." },
    { num: 4, name: "Defect Detection", desc: "AI models locate damage regions with high-confidence bounding boxes on concrete and pavement." },
    { num: 5, name: "Segmentation & Classification", desc: "Pixel-level crack outline masks and damage categorization (longitudinal, transverse, alligator, spalling)." },
    { num: 6, name: "Measurement & Severity", desc: "Crack length and max width calculated in pixels (or millimeters when calibrated), with severity category proposal." },
    { num: 7, name: "Engineer Review", desc: "Mandatory qualification gate: licensed civil engineer confirms, corrects geometry, or rejects findings with rationale." },
    { num: 8, name: "Reporting & Follow-up", desc: "Signed condition reports, maintenance work order creation, and temporal re-inspection scheduling." },
  ];

  const faqItems = [
    {
      q: "Does InfraScan replace a structural inspection?",
      a: "No. It supports inspection and maintenance planning; a qualified engineer must review findings. Visual damage alone is insufficient to determine structural integrity.",
    },
    {
      q: "How accurate is it?",
      a: "It depends on image quality, surface type and training data. Each finding shows a confidence score and model version. Models are evaluated side by side before deployment.",
    },
    {
      q: "Can it measure crack width in millimetres?",
      a: "Only when a photo has a reliable scale. Otherwise it reports pixels with an uncalibrated flag. Measurements never speculate mm without verified scale.",
    },
    {
      q: "What images can I use?",
      a: "Phone, camera and drone photos (JPG, PNG). Blur, low light, resolution, completeness and duplicates are checked before analysis.",
    },
    {
      q: "Who can see my data?",
      a: "Access depends on role and organisation. Sign-ins and changes are recorded in an audit log. Inspection datasets are strictly isolated by organization ID.",
    },
    {
      q: "Can I track a crack over time?",
      a: "Yes, for comparable viewpoints and a calibrated scale. Otherwise earlier and current values are shown side by side in pixels without speculation.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-brand-secondary selection:text-brand-text">
      {/* ================================================================== */}
      {/* 1. Sticky Navigation (Section 1.2)                                 */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <img
                src="/infrascan-logo.png"
                alt="InfraScan"
                className="h-10 sm:h-12 w-auto object-contain rounded-lg"
              />
            </Link>

            {/* In-page navigation anchors */}
            <nav className="hidden md:flex items-center space-x-8 text-sm font-medium">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
                How it works
              </a>
              <a href="#roles" className="text-muted-foreground hover:text-foreground transition-colors">
                Roles
              </a>
              <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">
                FAQ
              </a>
            </nav>

            {/* Right side controls */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Toggle theme"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>

              {user ? (
                <Link
                  to="/app/dashboard"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs sm:text-sm font-semibold transition-all shadow-sm"
                >
                  Go to dashboard
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/login"
                    className="text-xs sm:text-sm font-medium px-3 py-2 text-foreground hover:text-brand-accent transition-colors"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs sm:text-sm font-semibold transition-all shadow-sm"
                  >
                    Get started
                  </Link>
                </div>
              )}

              {/* Mobile hamburger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg border border-border text-foreground md:hidden"
                aria-label="Toggle mobile menu"
              >
                {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-card px-4 pt-3 pb-5 space-y-3">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-foreground py-1"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-foreground py-1"
            >
              How it works
            </a>
            <a
              href="#roles"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-foreground py-1"
            >
              Roles
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-foreground py-1"
            >
              FAQ
            </a>
            <div className="pt-2 border-t border-border">
              {user ? (
                <Link
                  to="/app/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Go to dashboard
                  <ArrowRight className="size-3.5" />
                </Link>
              ) : (
                <div className="flex gap-2">
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 py-2 text-center rounded-lg border border-input bg-card text-xs font-medium"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 py-2 text-center rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ================================================================== */}
      {/* 2. Hero Section (60-30-10 Composition + Inert SVG Illustration)    */}
      {/* ================================================================== */}
      <section className="relative py-16 sm:py-20 lg:py-24 border-b border-border overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left 60% Content */}
            <div className="lg:col-span-7 space-y-6">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.08]">
                Find cracks early. <br className="hidden sm:inline" />
                Decide with confidence.
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
                InfraScan helps inspection teams detect, outline and measure cracks and surface damage in photos of roads, bridges and concrete structures, then sends every finding to a qualified engineer for review.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                {user ? (
                  <Link
                    to="/app/dashboard"
                    className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground font-semibold text-sm transition-all shadow-sm"
                  >
                    Go to dashboard
                    <ArrowRight className="size-4 ml-2" />
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/register"
                      className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground font-semibold text-sm transition-all shadow-sm"
                    >
                      Create account
                      <ArrowRight className="size-4 ml-2" />
                    </Link>
                    <Link
                      to="/login"
                      className="inline-flex items-center justify-center px-5 py-3 rounded-lg border border-input bg-card hover:bg-muted text-foreground font-medium text-sm transition-colors"
                    >
                      Log in
                    </Link>
                  </>
                )}
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent hover:underline px-2 py-3"
                >
                  <span>See how it works</span>
                  <ChevronDown className="size-4" />
                </a>
              </div>

              {/* Mandatory Note */}
              <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
                AI results are decision support. Engineer review is always required.
              </p>
            </div>

            {/* Right 30-10 Visual Block with Real Field Inspection Image */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-lg overflow-hidden group">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
                    <span className="flex items-center gap-1.5">
                      <Layers className="size-3.5 text-primary" />
                      Live Structural Assessment View
                    </span>
                    <span className="px-2 py-0.5 rounded bg-secondary text-primary border border-border text-[11px] font-mono font-medium">
                      Viaduct Pier 4 · INF-001
                    </span>
                  </div>

                  {/* Real Civil Engineering Inspection Photograph */}
                  <div className="relative rounded-xl overflow-hidden border border-border bg-black/5 aspect-[16/9] shadow-inner">
                    <img
                      src="/hero-inspection.jpg"
                      alt="Civil infrastructure bridge inspection with computer vision crack detection overlay"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 pointer-events-none" />
                    
                    {/* Live Telemetry Chips */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white text-[11px] font-medium pointer-events-none">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/20">
                        <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
                        <span>AI suggestion · awaiting engineer review</span>
                      </div>
                      <div className="px-2 py-1 rounded-md bg-primary/90 backdrop-blur-md font-mono text-[10px] text-white">
                        Conf: 94.2%
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground text-center">
                    Field inspection photograph with computer vision crack segmentation and bounding overlay
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 3. Capability Strip (4 True Statements, No Invented Numbers)        */}
      {/* ================================================================== */}
      <section className="border-b border-border bg-card/60 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm font-medium text-foreground">
                Detection, outlining and classification in one workflow
              </span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm font-medium text-foreground">
                8-stage inspection workflow with an engineer review gate
              </span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm font-medium text-foreground">
                5 role-based workspaces
              </span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm font-medium text-foreground">
                Maps, history and reports for every asset
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 4. Why InfraScan (3 Cards)                                         */}
      {/* ================================================================== */}
      <section className="py-16 sm:py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Why Infrastructure Teams Choose InfraScan
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Built specifically to support civil inspectors and licensed engineers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl border border-border bg-card shadow-xs space-y-3">
              <div className="size-10 rounded-lg bg-secondary flex items-center justify-center text-primary font-bold">
                1
              </div>
              <h3 className="text-lg font-bold text-foreground">Save inspection time</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Automated bounding boxes and pixel segmentation process hundreds of high-resolution concrete photos in minutes, highlighting defects for rapid field verification.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card shadow-xs space-y-3">
              <div className="size-10 rounded-lg bg-secondary flex items-center justify-center text-primary font-bold">
                2
              </div>
              <h3 className="text-lg font-bold text-foreground">Stay consistent from visit to visit</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Repeat surveys utilize identical classification criteria and measurement rules, eliminating subjective variance between different inspectors.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card shadow-xs space-y-3">
              <div className="size-10 rounded-lg bg-secondary flex items-center justify-center text-primary font-bold">
                3
              </div>
              <h3 className="text-lg font-bold text-foreground">Keep engineers in charge</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Nothing reaches a report until a qualified engineer confirms, corrects or rejects it. AI acts solely as high-throughput decision support.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5. How It Works (id "how-it-works" + 8-Stage Disclosure)            */}
      {/* ================================================================== */}
      <section id="how-it-works" className="py-16 sm:py-20 border-b border-border bg-secondary/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              Systematic Process
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
              How an Inspection Works
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A structured lifecycle that connects field capture to engineering action.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="p-6 rounded-xl border border-border bg-card space-y-3">
              <div className="size-10 rounded-lg bg-secondary text-primary flex items-center justify-center">
                <Camera className="size-5" />
              </div>
              <div className="text-xs font-mono font-semibold text-primary uppercase">Step 1</div>
              <h3 className="text-base font-bold text-foreground">Capture</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Create an inspection for an asset and upload photos. InfraScan checks blur, lighting, resolution, completeness and duplicates first.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card space-y-3">
              <div className="size-10 rounded-lg bg-secondary text-primary flex items-center justify-center">
                <Cpu className="size-5" />
              </div>
              <div className="text-xs font-mono font-semibold text-primary uppercase">Step 2</div>
              <h3 className="text-base font-bold text-foreground">Analyse</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI locates defects, traces crack outlines and suggests crack type and severity with a confidence score and an explanation heat-map.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card space-y-3">
              <div className="size-10 rounded-lg bg-secondary text-primary flex items-center justify-center">
                <UserCheck className="size-5" />
              </div>
              <div className="text-xs font-mono font-semibold text-primary uppercase">Step 3</div>
              <h3 className="text-base font-bold text-foreground">Review</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                An engineer confirms, corrects or rejects each finding, with a reason, and signs off.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card space-y-3">
              <div className="size-10 rounded-lg bg-secondary text-primary flex items-center justify-center">
                <Wrench className="size-5" />
              </div>
              <div className="text-xs font-mono font-semibold text-primary uppercase">Step 4</div>
              <h3 className="text-base font-bold text-foreground">Act</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Reviewed findings become reports, maintenance work orders and follow-up inspections, compared with earlier visits.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center mb-6">
            Measurements are shown in pixels unless a photo has a calibrated scale.
          </p>

          {/* Expandable 8-Stage Table Disclosure */}
          <div className="max-w-4xl mx-auto">
            <button
              type="button"
              onClick={() => setStagesOpen(!stagesOpen)}
              className="w-full py-3 px-4 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground flex items-center justify-between transition-colors shadow-xs"
            >
              <span>{stagesOpen ? "Hide Workflow" : "Workflow"}</span>
              {stagesOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>

            {stagesOpen && (
              <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden shadow-sm animate-in fade-in duration-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-foreground border-b border-border">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold w-16">Stage</th>
                      <th className="py-2.5 px-4 font-semibold w-48">Workflow Stage</th>
                      <th className="py-2.5 px-4 font-semibold">Description & Engineering Significance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fullWorkflowStages.map((s) => (
                      <tr key={s.num} className="hover:bg-muted/40 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-semibold text-primary">{s.num}</td>
                        <td className="py-2.5 px-4 font-medium text-foreground">{s.name}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{s.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 6. Features (id "features", 6 Cards)                               */}
      {/* ================================================================== */}
      <section id="features" className="py-16 sm:py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              Comprehensive Capabilities
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
              Inspection Intelligence Built for Civil Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border border-border bg-card space-y-2.5">
              <h3 className="text-base font-bold text-foreground">Crack detection & segmentation</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Dual-stage localization combining fast bounding-box region proposals with sub-pixel polygon masks tracing fine fissures.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card space-y-2.5">
              <h3 className="text-base font-bold text-foreground">Crack type classification</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Categorization of longitudinal, transverse, alligator pattern, block cracks, and spalling based on structural orientation.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card space-y-2.5">
              <h3 className="text-base font-bold text-foreground">Explainable AI overlays</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Grad-CAM activation heatmaps reveal the exact surface regions driving model defect classifications and confidence values.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card space-y-2.5">
              <h3 className="text-base font-bold text-foreground">Asset & inspection history</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Permanent chronological condition logs for bridges, roadways, and structures with immutable engineer sign-off audit records.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card space-y-2.5">
              <h3 className="text-base font-bold text-foreground">Damage map by location & severity</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Geographic hotspot visualization with severity markers helping asset managers prioritize urgent field review allocations.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card space-y-2.5">
              <h3 className="text-base font-bold text-foreground">Reports & alerts</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Exportable audit-ready condition summaries in CSV and PDF formats, with automated alerts triggering when critical review is required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 7. Infrastructure Scope                                            */}
      {/* ================================================================== */}
      <section className="py-14 border-b border-border bg-secondary/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Infrastructure Scope & Material Focus
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
                <div className="font-semibold text-primary">Available First:</div>
                <div className="text-muted-foreground">Road pavements, concrete surfaces, bridge decks, walls.</div>
              </div>
              <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
                <div className="font-semibold text-muted-foreground">Planned Next:</div>
                <div className="text-muted-foreground">Tunnels, dams, retaining walls, industrial structures, buildings.</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed italic">
              Models are trained and evaluated per material; results from one surface type are not assumed to carry over to another.
            </p>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 8. Roles (id "roles", 5 Cards)                                     */}
      {/* ================================================================== */}
      <section id="roles" className="py-16 sm:py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              Role-Based Access
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
              Five Dedicated Workspaces
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tailored interfaces strictly aligned with professional authority and legal responsibilities.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl border border-border bg-card space-y-2">
              <div className="font-bold text-foreground text-sm flex items-center justify-between">
                <span>Infrastructure Inspector</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-primary">Field</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Plan visits, capture and upload images, track what is waiting for review
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2">
              <div className="font-bold text-foreground text-sm flex items-center justify-between">
                <span>Civil Engineer</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary text-primary-foreground">Review Gate</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Review findings, verify geometry, confirm priorities, sign off reports
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2">
              <div className="font-bold text-foreground text-sm flex items-center justify-between">
                <span>Maintenance Engineer</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-primary">Operations</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Work order execution, repair scheduling, follow-up inspections
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2">
              <div className="font-bold text-foreground text-sm flex items-center justify-between">
                <span>Infrastructure Manager</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-primary">Portfolio</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Asset condition oversight, maintenance priorities, damage trends and hotspots
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card space-y-2">
              <div className="font-bold text-foreground text-sm flex items-center justify-between">
                <span>Administrator</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-primary">Governance</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Users, models, audit logs and platform health
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 9. Trust Section                                                   */}
      {/* ================================================================== */}
      <section className="py-16 sm:py-20 border-b border-border bg-secondary/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 rounded-2xl border border-border bg-card shadow-xs space-y-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-secondary flex items-center justify-center text-primary">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  AI that assists, never decides alone.
                </h2>
                <p className="text-xs text-muted-foreground">Engineering Governance Guarantees</p>
              </div>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-foreground/90 leading-relaxed">
              <div className="flex items-start gap-3">
                <div className="size-2 rounded-full bg-primary shrink-0 mt-2" />
                <p>
                  <strong>Decision Support Only:</strong> Every AI prediction is clearly marked as an "AI suggestion" and has no legal or engineering validity until signed off by a qualified civil engineer.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="size-2 rounded-full bg-primary shrink-0 mt-2" />
                <p>
                  <strong>No Speculative Safety Verdicts:</strong> The system never declares a structure "unsafe", "failing", or "dangerous". The highest alert level reads <em>"Requires urgent engineering review"</em>.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="size-2 rounded-full bg-primary shrink-0 mt-2" />
                <p>
                  <strong>Absence of Detections:</strong> The absence of AI crack detections does not prove a structure is defect-free. Hidden fatigue and internal stress require physical engineering evaluations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 10. Data & Models (Transparency)                                   */}
      {/* ================================================================== */}
      <section className="py-16 sm:py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
              <Database className="size-4" />
              Research Transparency
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Built on Public Research Datasets
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              InfraScan leverages established academic computer vision benchmarks for model training and continuous offline evaluation:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg border border-border bg-card">SDNET2018</div>
              <div className="p-3 rounded-lg border border-border bg-card">CCIC (Concrete Crack)</div>
              <div className="p-3 rounded-lg border border-border bg-card">RDD2022 (Road Damage)</div>
              <div className="p-3 rounded-lg border border-border bg-card">CrackForest</div>
              <div className="p-3 rounded-lg border border-border bg-card">Crack500</div>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed pt-2">
              <p>
                Each dataset supports a different task (classification, detection or segmentation). Some licences limit commercial use.
              </p>
              <p>
                Detection, segmentation and classification models are evaluated side by side before one is deployed. Model registration tracks Dice, IoU, and mAP metrics internally for audit compliance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 11. FAQ (Accessible Accordion, 6 Items)                             */}
      {/* ================================================================== */}
      <section id="faq" className="py-16 sm:py-20 border-b border-border bg-secondary/15">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              Questions & Answers
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {faqItems.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border bg-card overflow-hidden shadow-xs transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-4 sm:p-5 text-left text-sm font-semibold text-foreground flex items-center justify-between gap-4"
                  aria-expanded={openFaq === idx}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform duration-200 shrink-0 ${
                      openFaq === idx ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === idx && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 12. Final Call to Action                                           */}
      {/* ================================================================== */}
      <section className="py-16 sm:py-20 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Ready to inspect smarter?
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Standardize crack detection, improve condition visibility, and keep licensed engineers in control of every finding.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {user ? (
              <Link
                to="/app/dashboard"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground font-semibold text-sm transition-all shadow-sm"
              >
                Go to dashboard
                <ArrowRight className="size-4 ml-2" />
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground font-semibold text-sm transition-all shadow-sm"
                >
                  Create account
                  <ArrowRight className="size-4 ml-2" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center px-5 py-3 rounded-lg border border-input bg-card hover:bg-muted text-foreground font-medium text-sm transition-colors"
                >
                  Log in
                </Link>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {user ? "Signed in with enterprise access" : "New accounts are approved by an administrator."}
          </p>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 13. Footer (Section 1.2)                                           */}
      {/* ================================================================== */}
      <footer className="bg-card text-foreground border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
            {/* Brand column */}
            <div className="col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <img
                  src="/infrascan-logo.png"
                  alt="InfraScan"
                  className="h-9 w-auto object-contain rounded-md"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                AI-assisted crack and surface damage assessment platform for civil infrastructure inspection teams.
              </p>
            </div>

            {/* Product Links */}
            <div className="space-y-2.5 text-xs">
              <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Product</div>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-foreground">How it works</a></li>
                <li><a href="#roles" className="hover:text-foreground">Roles</a></li>
              </ul>
            </div>

            {/* Account Links */}
            <div className="space-y-2.5 text-xs">
              <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Account</div>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link to="/login" className="hover:text-foreground">Log in</Link></li>
                <li><Link to="/register" className="hover:text-foreground">Create account</Link></li>
                <li><Link to="/forgot-password" className="hover:text-foreground">Forgot password</Link></li>
              </ul>
            </div>

            {/* Legal & Support Links */}
            <div className="space-y-2.5 text-xs">
              <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Legal & Support</div>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link to="/privacy" className="hover:text-foreground">Privacy notice</Link></li>
                <li><Link to="/terms" className="hover:text-foreground">Terms of use</Link></li>
                <li><Link to="/accessibility" className="hover:text-foreground">Accessibility</Link></li>
                {FEATURES.supportEmailSet && (
                  <li><Link to="/contact" className="hover:text-foreground">Contact</Link></li>
                )}
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>
              AI results are decision support and do not replace qualified engineering inspection.
            </p>
            <p>
              &copy; {new Date().getFullYear()} InfraScan Civil Intelligence.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
