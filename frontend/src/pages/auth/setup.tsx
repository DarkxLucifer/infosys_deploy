import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2, KeyRound } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function SetupPage() {
  const navigate = useNavigate();

  const [setupToken, setSetupToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/auth/setup/status")
      .then((res) => res.json())
      .then((data) => {
        setSetupRequired(Boolean(data.setupRequired));
        setStatusMessage(data.message || "");
      })
      .catch(() => {
        setSetupRequired(false);
        setStatusMessage("Unable to connect to setup service.");
      })
      .finally(() => {
        setIsCheckingStatus(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!setupToken.trim() || !fullName.trim() || !email.trim() || !password) {
      setErrorMessage("All fields are required.");
      return;
    }

    if (password.length < 12) {
      setErrorMessage("Password must be at least 12 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupToken: setupToken.trim(),
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data?.detail?.message || "Setup failed. Check your setup token.");
        return;
      }

      setSuccessMessage("Administrator account initialized successfully! Redirecting to login...");
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2000);
    } catch {
      setErrorMessage("Network error while communicating with the server.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingStatus) {
    return (
      <AuthLayout title="Platform Setup" subtitle="Checking setup status...">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </AuthLayout>
    );
  }

  if (!setupRequired) {
    return (
      <AuthLayout title="Platform Setup" subtitle="One-time system initialization">
        <div className="p-4 rounded-xl border border-border bg-card text-foreground space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Setup is Complete</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {statusMessage || "The primary administrator account has already been initialized. The one-time setup wizard is permanently disabled for security."}
              </p>
            </div>
          </div>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center justify-center w-full h-10 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition-opacity"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Platform Setup"
      subtitle="Initialize your organization's primary administrator"
    >
      <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary flex items-start gap-2">
        <KeyRound className="size-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold block">One-Time Setup Mode Active</span>
          <span className="text-[11px] opacity-90 block leading-relaxed">
            Enter the setup token printed in your API server logs on first startup. This page permanently disables itself after creating the initial administrator.
          </span>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="setup-token" className="block text-xs font-medium text-foreground mb-1.5">
            Setup Token (from API startup log) <span className="text-destructive">*</span>
          </label>
          <input
            id="setup-token"
            type="password"
            autoComplete="off"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            placeholder="Paste SETUP_TOKEN here..."
            className="w-full h-10 px-3 rounded-lg border border-input bg-card text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>

        <div>
          <label htmlFor="full-name" className="block text-xs font-medium text-foreground mb-1.5">
            Full Name <span className="text-destructive">*</span>
          </label>
          <input
            id="full-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Chief Infrastructure Officer"
            className="w-full h-10 px-3 rounded-lg border border-input bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>

        <div>
          <label htmlFor="admin-email" className="block text-xs font-medium text-foreground mb-1.5">
            Administrator E-mail <span className="text-destructive">*</span>
          </label>
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@authority.gov"
            className="w-full h-10 px-3 rounded-lg border border-input bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>

        <div>
          <label htmlFor="admin-pass" className="block text-xs font-medium text-foreground mb-1.5">
            Master Password <span className="text-destructive">*</span>
          </label>
          <input
            id="admin-pass"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 12 characters..."
            className="w-full h-10 px-3 rounded-lg border border-input bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Must be 12-128 characters, hashed with Argon2id. Cannot contain your name or email.
          </p>
        </div>

        <div>
          <label htmlFor="confirm-pass" className="block text-xs font-medium text-foreground mb-1.5">
            Confirm Password <span className="text-destructive">*</span>
          </label>
          <input
            id="confirm-pass"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat password..."
            className="w-full h-10 px-3 rounded-lg border border-input bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || Boolean(successMessage)}
          className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] disabled:opacity-50 text-primary-foreground font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Initializing Administrator Account...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="size-4" />
              <span>Complete Setup & Initialize Platform</span>
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
