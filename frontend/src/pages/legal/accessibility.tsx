import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle, Eye, Keyboard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-primary hover:opacity-90">
          <ArrowLeft className="h-4 w-4" />
          <span>InfraScan</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link to="/register">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-primary text-xs font-medium mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            <span>WCAG 2.1 Level AA Standard</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Accessibility Statement</h1>
          <p className="text-muted-foreground text-sm">
            InfraScan is engineered to be accessible to all civil engineers, inspectors, and managers, regardless of physical or visual ability.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section className="p-5 rounded-xl border border-border bg-card">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-success" />
              1. Conformance Status
            </h2>
            <p>
              We adhere strictly to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA.
              Our UI tokens guarantee high contrast ratios (foreground text on background achieves 19.7:1; primary button text achieves 8.8:1; UI form input borders achieve 3.3:1).
            </p>
          </section>

          <section className="p-5 rounded-xl border border-border bg-card">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-2">
              <Keyboard className="h-4 w-4 text-primary" />
              2. Keyboard Navigation & Focus Indicators
            </h2>
            <p>
              Every interactive element (buttons, forms, modals, tables, and dropdowns) can be navigated using keyboard commands alone:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
              <li><kbd className="px-1.5 py-0.5 rounded bg-muted text-xs border border-border">Tab</kbd> and <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs border border-border">Shift+Tab</kbd> cycle cleanly through all interactive controls.</li>
              <li>Visible 3px focus rings (<code className="text-xs text-primary">--ring: #433bff</code>) clearly outline focused targets.</li>
              <li>Global search is accessible instantly via <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs border border-border">Cmd+K</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs border border-border">Ctrl+K</kbd>.</li>
              <li>Dialogs and popovers trap focus properly and close cleanly with <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs border border-border">Escape</kbd>.</li>
            </ul>
          </section>

          <section className="p-5 rounded-xl border border-border bg-card">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-2">
              <Eye className="h-4 w-4 text-primary" />
              3. Visual & Text Alternatives
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li><strong className="text-foreground">Never Color Alone:</strong> Severity levels are always communicated with explicit text labels alongside color tints.</li>
              <li><strong className="text-foreground">Chart Text Fallbacks:</strong> All interactive charts provide structured tabular representations or textual summaries for screen readers.</li>
              <li><strong className="text-foreground">Inert Illustrations:</strong> Decorative graphics and mockups are marked with <code className="text-xs">aria-hidden="true"</code> with zero focusable trap states.</li>
              <li><strong className="text-foreground">Live Announcements:</strong> Status updates and validation alerts use <code className="text-xs">aria-live="polite"</code> regions.</li>
            </ul>
          </section>

          <section className="p-5 rounded-xl border border-border bg-card">
            <h2 className="text-base font-semibold text-foreground mb-2">4. Feedback & Contact</h2>
            <p>
              If you encounter any accessibility barriers while using InfraScan, please submit feedback to your infrastructure team
              or reach out via our contact page.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-6 px-6 text-center text-xs text-muted-foreground">
        AI results in InfraScan are decision support. Engineer review is required.
      </footer>
    </div>
  );
}
