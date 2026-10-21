import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    // Simulate rate-limiting check (3 per hour per Section 2.3)
    const attempts = Number(sessionStorage.getItem("infrascan_forgot_count") || "0");
    if (attempts >= 3) {
      setRateLimited(true);
      return;
    }

    sessionStorage.setItem("infrascan_forgot_count", String(attempts + 1));
    setIsLoading(true);

    try {
      await api.forgotPassword(email);
    } catch {
      // Always show identical response to prevent user enumeration
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <AuthLayout
      title="Reset Your Password"
      subtitle="Enter your verified work email address"
      maxWidthClass="max-w-[420px]"
    >
      {rateLimited ? (
        <div className="text-center py-4 space-y-4">
          <div className="mx-auto size-12 rounded-full bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-500">
            <AlertCircle className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Rate Limit Exceeded</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Maximum password reset requests reached (3 per hour). Please wait or contact your infrastructure administrator for manual credential recovery.
          </p>
          <div className="pt-2">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-brand-accent font-medium hover:underline">
              <ArrowLeft className="size-3.5" /> Back to Login
            </Link>
          </div>
        </div>
      ) : submitted ? (
        <div className="text-center py-4 space-y-4">
          <div className="mx-auto size-12 rounded-full bg-success-soft border border-success/40 flex items-center justify-center text-success">
            <CheckCircle2 className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Reset Link Sent</h2>
          {/* Exact generic wording required by Section 2.3 */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            If an account exists for that address, a reset link has been sent. The link expires in 60 minutes.
          </p>
          <div className="pt-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs text-brand-accent font-medium hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Back to Log in
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Enter your email address and we will generate a secure, single-use password reset link.
          </p>
          <div>
            <label htmlFor="forgot-email" className="block text-xs font-medium text-foreground mb-1.5">
              Work E-mail
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="inspector@agency.gov"
              className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] disabled:opacity-50 text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Sending link...</span>
              </>
            ) : (
              <span>Send reset link</span>
            )}
          </button>

          <div className="pt-2 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" /> Back to Login
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
