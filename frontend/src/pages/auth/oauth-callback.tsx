import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader2, AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { useAuth } from "@/store/auth-context";

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithGoogle } = useAuth();

  const [status, setStatus] = useState<"processing" | "error" | "success">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    const code = searchParams.get("code");

    if (error) {
      setStatus("error");
      if (error === "access_denied") {
        setErrorMessage(
          "Access Denied: Your Google account is not added as an authorized Test User in the Google Cloud Console, or permissions were denied."
        );
      } else {
        setErrorMessage(errorDescription || `OAuth error: ${error}`);
      }
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMessage("No authorization code was returned by the identity provider.");
      return;
    }

    // Process real Google code exchange
    async function exchangeOAuthCode() {
      try {
        const redirectUri = `${window.location.origin}/oauth/callback`;
        const res = await loginWithGoogle(code as string, redirectUri);

        if (res.success) {
          setStatus("success");
          setTimeout(() => {
            navigate("/app/dashboard", { replace: true });
          }, 800);
        } else {
          setStatus("error");
          setErrorMessage(res.error || "Failed to verify Google credentials with the server.");
        }
      } catch (err: unknown) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Unexpected error during OAuth exchange.");
      }
    }

    exchangeOAuthCode();
  }, [searchParams, loginWithGoogle, navigate]);

  return (
    <AuthLayout
      title="Completing Sign-In"
      subtitle="Authenticating with your identity provider..."
    >
      <div className="py-6 flex flex-col items-center justify-center text-center">
        {status === "processing" && (
          <div className="space-y-4">
            <Loader2 className="size-10 animate-spin text-primary mx-auto" />
            <p className="text-sm font-medium text-foreground">
              Verifying your credentials with InfraScan...
            </p>
            <p className="text-xs text-muted-foreground">
              Please wait while we establish your secure session.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium text-foreground">
              Authentication successful!
            </p>
            <p className="text-xs text-muted-foreground">
              Redirecting you to the infrastructure dashboard...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 w-full">
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-2 text-left">
              <div className="flex items-start gap-2">
                <AlertCircle className="size-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-sm">Sign-In Failed</div>
                  <div className="leading-relaxed">{errorMessage}</div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
              >
                <ArrowLeft className="size-4" />
                Return to Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
