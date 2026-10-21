import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { api } from "@/lib/api";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [status, setStatus] = useState<"verifying" | "verified" | "expired" | "invalid">("verifying");
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendEmail, setResendEmail] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    api.verifyEmail(token)
      .then(() => setStatus("verified"))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("expired")) {
          setStatus("expired");
        } else {
          setStatus("invalid");
        }
      });
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    try {
      await api.resendVerification(resendEmail);
      setResendSuccess(true);
    } catch {
      setResendSuccess(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout title="E-mail Verification" subtitle="Account credential confirmation">
      <div className="text-center py-4 space-y-4">
        {status === "verifying" && (
          <div className="space-y-3">
            <Loader2 className="mx-auto size-10 animate-spin text-primary" />
            <h2 className="text-base font-semibold text-foreground">Validating verification token...</h2>
            <p className="text-xs text-muted-foreground">Verifying single-use cryptographic token.</p>
          </div>
        )}

        {status === "verified" && (
          <div className="space-y-4">
            <div className="mx-auto size-12 rounded-full bg-success-soft border border-success/40 flex items-center justify-center text-success">
              <CheckCircle2 className="size-6" />
            </div>
            <h2 className="text-lg font-bold text-foreground">E-mail Verified Successfully</h2>
            <div className="p-3.5 rounded-xl bg-muted/60 border border-border text-left text-xs text-foreground space-y-1.5">
              <div className="font-semibold text-primary">Next Step: Administrator Authorization</div>
              <p className="text-muted-foreground leading-relaxed">
                Your email address is verified. Your account remains in <strong>pending_approval</strong> until an administrator reviews and approves your requested role.
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/login"
                className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground font-medium text-xs inline-flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <span>Continue to Log in</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        )}

        {status === "expired" && (
          <div className="space-y-4">
            <div className="mx-auto size-12 rounded-full bg-warning-soft border border-warning/40 flex items-center justify-center text-warning">
              <AlertCircle className="size-6" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Verification Link Expired</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This verification link has expired (maximum lifetime 24 hours). Enter your work email below to receive a new verification message.
            </p>
            {resendSuccess ? (
              <div className="p-3 rounded-lg bg-success-soft border border-success/30 text-xs text-success">
                If an account exists, a new verification email has been sent. Check your inbox.
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="Enter your work email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                />
                <button
                  type="submit"
                  disabled={resending}
                  className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground text-xs font-medium transition-all shadow-sm"
                >
                  {resending ? "Sending..." : "Resend Verification E-mail"}
                </button>
              </form>
            )}
          </div>
        )}

        {status === "invalid" && (
          <div className="space-y-4">
            <div className="mx-auto size-12 rounded-full bg-destructive/10 border border-destructive/40 flex items-center justify-center text-destructive">
              <AlertCircle className="size-6" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Invalid Verification Token</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This verification token is malformed, unrecognized, or has already been consumed.
            </p>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs text-brand-accent font-medium hover:underline"
              >
                Return to Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
