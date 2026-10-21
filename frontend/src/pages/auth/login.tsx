import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { useAuth } from "@/store/auth-context";
import { api } from "@/lib/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [showResendBtn, setShowResendBtn] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      const from = (location.state as { from?: string })?.from || "/app/dashboard";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, location.state]);

  useEffect(() => {
    const reason = sessionStorage.getItem("infrascan_signout_reason");
    if (reason) {
      setSessionExpiredNotice(reason);
      sessionStorage.removeItem("infrascan_signout_reason");
    }

    // Fetch configured OAuth providers (Rule 10: only render configured ones)
    api.getAuthProviders()
      .then((data) => setProviders(data.providers || []))
      .catch(() => setProviders([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSessionExpiredNotice(null);
    setResendStatus(null);
    setShowResendBtn(false);

    if (!email.trim() || !password) {
      setErrorMessage("E-mail and password are required.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(email, password, rememberDevice);
      if (res.mfaRequired && res.mfaTicket) {
        navigate(`/two-factor?ticket=${res.mfaTicket}`);
        return;
      }

      if (res.success) {
        const from = (location.state as { from?: string })?.from || "/app/dashboard";
        navigate(from, { replace: true });
      } else {
        const err = res.error || "E-mail or password is incorrect.";
        setErrorMessage(err);
        if (err.includes("verify your e-mail")) {
          setShowResendBtn(true);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) return;
    try {
      await api.resendVerification(email);
      setResendStatus("A new verification link has been sent to your address.");
    } catch {
      setResendStatus("If an account exists, a verification link has been sent.");
    }
  };

  const handleGoogleLogin = () => {
    const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    const redirectUri = `${window.location.origin}/oauth/callback`;
    const clientId = "6013474376-9250160a179b5jmca4sf68lg9mc50eoh.apps.googleusercontent.com";
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      state: "google_infrascan",
    });
    window.location.href = `${rootUrl}?${params.toString()}`;
  };

  return (
    <AuthLayout
      title="Sign In to InfraScan"
      subtitle="AI-assisted infrastructure inspection & damage assessment"
    >
      {/* Session timeout alert */}
      {sessionExpiredNotice && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-amber-600" />
          <span>{sessionExpiredNotice}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-2"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div className="font-medium leading-snug">{errorMessage}</div>
          </div>
          {showResendBtn && (
            <button
              type="button"
              onClick={handleResendVerification}
              className="mt-1 text-xs font-semibold text-primary underline hover:opacity-80 block"
            >
              Resend verification e-mail
            </button>
          )}
        </div>
      )}

      {/* Resend success notice */}
      {resendStatus && (
        <div className="mb-4 p-3 rounded-lg bg-success-soft border border-success/30 text-success text-xs flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{resendStatus}</span>
        </div>
      )}

      {/* Form matching Part 2.2 & 2.3 */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email field */}
        <div>
          <label
            htmlFor="email-input"
            className="block text-xs font-medium text-foreground mb-1.5"
          >
            Work E-mail
          </label>
          <input
            id="email-input"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="inspector@agency.gov"
            className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
          />
        </div>

        {/* Password field */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password-input"
              className="block text-xs font-medium text-foreground"
            >
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs text-brand-accent hover:underline transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password-input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full h-11 px-3.5 pr-10 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
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

        {/* Remember device checkbox */}
        <div className="flex items-center gap-2 pt-1">
          <input
            id="remember-device"
            type="checkbox"
            checked={rememberDevice}
            onChange={(e) => setRememberDevice(e.target.checked)}
            className="size-4 rounded border-input bg-card text-primary focus:ring-ring"
          />
          <label htmlFor="remember-device" className="text-xs text-muted-foreground cursor-pointer select-none">
            Remember this device (subject to 12h policy)
          </label>
        </div>

        {/* Primary Action Button (Brand Primary) */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] disabled:opacity-50 text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Verifying credentials...</span>
            </>
          ) : (
            <span>Log in</span>
          )}
        </button>

        {/* Config-Gated OAuth Buttons (Rule 10: only render if providers exist) */}
        {providers.length > 0 && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <div className="space-y-2">
              {providers.includes("microsoft") && (
                <button
                  type="button"
                  onClick={() => navigate("/oauth/callback?provider=microsoft&code=sample_pkce_code&state=infrascan_state")}
                  className="w-full h-11 rounded-lg border border-input bg-card hover:bg-muted text-foreground font-medium text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
                  </svg>
                  <span>Continue with Microsoft Entra ID</span>
                </button>
              )}
              {providers.includes("google") && (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full h-11 rounded-lg border border-input bg-card hover:bg-muted text-foreground font-medium text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <svg className="size-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>
              )}
            </div>
          </>
        )}
      </form>

      {/* Register link */}
      <div className="mt-6 pt-5 border-t border-border text-center text-xs text-muted-foreground">
        Don&apos;t have an inspection account?{" "}
        <Link to="/register" className="text-brand-accent font-medium hover:underline">
          Create an account
        </Link>
      </div>
    </AuthLayout>
  );
}
