import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Building2, ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { api } from "@/lib/api";

export default function AcceptInvitationPage() {
  const { token: pathToken } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const token = pathToken || searchParams.get("token") || "demo_invitation_token";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Read-only invitation metadata per Section 2.3
  const invitationOrg = "State Highway Infrastructure Authority";
  const assignedRole = "Civil Structural Engineer";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 12) {
      setErrorMessage("Password must be at least 12 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await api.acceptInvitation(token, name, password);
      setIsSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to accept invitation. Link may be expired.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (token === "expired" || token === "invalid") {
    return (
      <AuthLayout title="Invitation Expired" subtitle="Administrator invitation token">
        <div className="text-center py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            This invitation link has expired or has already been consumed. Contact your administrator to request a new invite.
          </p>
          <Link to="/login" className="text-xs text-brand-accent font-medium hover:underline">
            Return to Login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (isSuccess) {
    return (
      <AuthLayout title="Account Activated" subtitle="Welcome to InfraScan">
        <div className="text-center py-4 space-y-4">
          <div className="mx-auto size-12 rounded-full bg-success-soft border border-success/40 flex items-center justify-center text-success">
            <CheckCircle2 className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Your Account Is Activated</h2>
          <p className="text-xs text-muted-foreground">
            Your account is now fully active with assigned role <strong className="text-foreground">{assignedRole}</strong>.
          </p>
          <button
            onClick={() => navigate("/app/dashboard")}
            className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground text-xs font-medium transition-all shadow-sm"
          >
            Go to My Dashboard
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Accept Platform Invitation"
      subtitle="Complete your administrator-assigned account"
      maxWidthClass="max-w-[460px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Read-only org & role badges */}
        <div className="p-3.5 rounded-xl bg-muted/60 border border-border space-y-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="size-3.5 text-primary" />
            <span>Organization:</span>
            <span className="font-semibold text-foreground">{invitationOrg}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>Assigned Role:</span>
            <span className="font-semibold text-primary">{assignedRole}</span>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
            {errorMessage}
          </div>
        )}

        <div>
          <label htmlFor="inv-name" className="block text-xs font-medium text-foreground mb-1">
            Full Name
          </label>
          <input
            id="inv-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dr. Alex Rivera, PE"
            className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="inv-pass" className="block text-xs font-medium text-foreground mb-1">
            Create Password (minimum 12 characters)
          </label>
          <input
            id="inv-pass"
            type="password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="inv-confirm" className="block text-xs font-medium text-foreground mb-1">
            Confirm Password
          </label>
          <input
            id="inv-confirm"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-[11px] text-destructive mt-1">Passwords do not match.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || password.length < 12 || password !== confirmPassword}
          className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] disabled:opacity-50 text-primary-foreground text-xs font-medium transition-all shadow-sm flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Activating Account...</span>
            </>
          ) : (
            <span>Activate Account</span>
          )}
        </button>

        <div className="pt-2 text-center">
          <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground">
            Return to Login
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
