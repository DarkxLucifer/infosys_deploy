import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Database, EyeOff, Lock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPage() {
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
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>InfraScan Trust & Data Policy</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Notice</h1>
          <p className="text-muted-foreground text-sm">
            Effective Date: October 2026 · Transparent disclosures about data stored, audit trails, and zero-tracking policy.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section className="p-5 rounded-xl border border-border bg-card">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-2">
              <EyeOff className="h-4 w-4 text-primary" />
              1. Zero Tracking & No Advertising Cookies
            </h2>
            <p>
              InfraScan does not use third-party analytics, web beacons, advertising pixels, or cross-site tracking scripts.
              The only cookies set on your browser are strictly necessary for authenticated sessions (an encrypted, HttpOnly,
              Secure refresh-token cookie) and CSRF protection. Therefore, no intrusive tracking banner is required.
            </p>
          </section>

          <section className="p-5 rounded-xl border border-border bg-card">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-primary" />
              2. Data We Collect and Store
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li><strong className="text-foreground">Account Information:</strong> Name, work email address, organization membership, assigned role, and hashed passwords (Argon2id).</li>
              <li><strong className="text-foreground">Inspection Data:</strong> Uploaded infrastructure photographs, capture metadata, GPS coordinates where provided, and quality check records.</li>
              <li><strong className="text-foreground">AI & Engineering Annotations:</strong> Bounding boxes, segmentation masks, crack classification categories, confidence scores, pixel measurements, and qualified engineer review determinations.</li>
              <li><strong className="text-foreground">System Metrics:</strong> API endpoint latency and system health metrics for operational stability.</li>
            </ul>
          </section>

          <section className="p-5 rounded-xl border border-border bg-card">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-primary" />
              3. Tamper-Evident Audit Logging
            </h2>
            <p>
              To satisfy engineering compliance and enterprise security, InfraScan maintains an insert-only audit log.
              All authentication attempts, user approvals, role modifications, AI findings reviews, and export operations
              are recorded with actor ID, timestamp, and action description. Audit logs never store raw passwords, tokens, or encryption keys.
            </p>
          </section>

          <section className="p-5 rounded-xl border border-border bg-card">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-2">
              <UserCheck className="h-4 w-4 text-primary" />
              4. Access Control & Organization Isolation
            </h2>
            <p>
              All customer inspection data is strictly partitioned by Organization ID. Only authorized users with appropriate
              roles (Inspector, Civil Engineer, Maintenance Engineer, Infrastructure Manager, or Administrator) can access infrastructure records.
              Self-registered accounts remain in a pending state until vetted and approved by an authorized administrator.
            </p>
          </section>

          <section className="p-5 rounded-xl border border-border bg-card">
            <h2 className="text-base font-semibold text-foreground mb-2">5. Data Retention and Rights</h2>
            <p>
              Users may request access, corrections, or deactivation of their accounts by contacting their organization administrator
              or InfraScan support. Inspection archives are retained per the organization’s structural asset retention policies.
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
