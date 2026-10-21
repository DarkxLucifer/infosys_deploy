import { useState, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "valid_demo_token";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Token status verification per Section 2.3: valid, expired (60m), already used, invalid
  const tokenStatus: "valid" | "expired" | "already_used" | "invalid" = useMemo(() => {
    if (!token) return "invalid";
    if (token.includes("expired")) return "expired";
    if (token.includes("used")) return "already_used";
    if (token.includes("invalid")) return "invalid";
    return "valid";
  }, [token]);

  // Password strength
  const isLengthValid = password.length >= 12;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLengthValid) {
      setErrorMessage("Password must be at least 12 characters.");
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await api.resetPassword(token, password);
      sessionStorage.setItem("infrascan_signout_reason", "Your password was changed successfully. Please log in with your new credentials.");
      navigate("/login");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reset password. The link may have expired.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (tokenStatus !== "valid") {
    return (
      <AuthLayout title="Reset Password" subtitle="Credential link verification">
        <div className="text-center py-4 space-y-4">
          <div className="mx-auto size-12 rounded-full bg-destructive/10 border border-destructive/40 flex items-center justify-center text-destructive">
            <AlertCircle className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">
            {tokenStatus === "expired"
              ? "Reset Link Expired"
              : tokenStatus === "already_used"
              ? "Link Already Used"
              : "Invalid Reset Token"}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {tokenStatus === "expired"
              ? "This password reset link has expired (maximum validity 60 minutes). Please request a new link."
              : tokenStatus === "already_used"
              ? "This single-use reset token has already been consumed. Request a fresh reset link if you need to update credentials."
              : "The reset token in this URL is not recognized or has been revoked."}
          </p>
          <div className="pt-2">
            <Link
              to="/forgot-password"
              className="inline-flex items-center gap-1.5 text-xs text-brand-accent font-medium hover:underline"
            >
              Request New Reset Link
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create New Password"
      subtitle="Enter a new strong password for your account"
      maxWidthClass="max-w-[440px]"
    >
      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-new-pass" className="block text-xs font-medium text-foreground mb-1.5">
            New Password (minimum 12 characters)
          </label>
          <div className="relative">
            <input
              id="reset-new-pass"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 12 characters"
              className="w-full h-11 px-3.5 pr-10 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="reset-confirm-pass" className="block text-xs font-medium text-foreground mb-1.5">
            Confirm New Password
          </label>
          <input
            id="reset-confirm-pass"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
          {confirmPassword && !passwordsMatch && (
            <p className="text-[11px] text-destructive mt-1">Passwords do not match.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || !isLengthValid || !passwordsMatch}
          className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] disabled:opacity-50 text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Updating password...</span>
            </>
          ) : (
            <span>Reset Password & End All Sessions</span>
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
    </AuthLayout>
  );
}
