import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Building, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
  const supportEmail = "support@infrascan.ai";

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

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-primary text-xs font-medium mb-3">
            <Mail className="h-3.5 w-3.5" />
            <span>Infrastructure Engineering Support</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Contact InfraScan</h1>
          <p className="text-muted-foreground text-sm">
            Reach out for enterprise onboarding, administrator assistance, or platform operations.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="p-6 rounded-xl border border-border bg-card">
            <Mail className="h-5 w-5 text-primary mb-3" />
            <h2 className="text-base font-semibold mb-1">Direct Engineering Support</h2>
            <p className="text-xs text-muted-foreground mb-4">
              For technical queries, model evaluation datasets, or account approval inquiries.
            </p>
            <a
              href={`mailto:${supportEmail}`}
              className="text-sm font-semibold text-brand-accent hover:underline break-all"
            >
              {supportEmail}
            </a>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card">
            <Clock className="h-5 w-5 text-primary mb-3" />
            <h2 className="text-base font-semibold mb-1">Operating Hours & Response</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Monitored Monday through Friday, 08:00 – 18:00 UTC.
            </p>
            <span className="inline-flex items-center text-xs font-medium text-success bg-success-soft px-2.5 py-1 rounded-full">
              Typical response under 4 business hours
            </span>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card">
            <Shield className="h-5 w-5 text-primary mb-3" />
            <h2 className="text-base font-semibold mb-1">Security Disclosures</h2>
            <p className="text-xs text-muted-foreground">
              Vulnerability disclosures and security reviews should be directed to security@infrascan.ai with encrypted communication details.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card">
            <Building className="h-5 w-5 text-primary mb-3" />
            <h2 className="text-base font-semibold mb-1">Civil Infrastructure Teams</h2>
            <p className="text-xs text-muted-foreground">
              To request on-premise private deployment or municipal database connector setups, contact your account administrator.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-6 px-6 text-center text-xs text-muted-foreground">
        AI results in InfraScan are decision support. Engineer review is required.
      </footer>
    </div>
  );
}
