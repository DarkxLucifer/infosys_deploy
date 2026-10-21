import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Loader2, AlertCircle, KeyRound } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { useAuth } from "@/store/auth-context";

export default function TwoFactorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ticket = searchParams.get("ticket") || "demo_mfa_ticket";
  const { verifyMfa } = useAuth();

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, val: string) => {
    const char = val.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    // Auto-advance
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if all 6 digits filled
    if (char && index === 5 && newDigits.every((d) => d !== "")) {
      submitCode(newDigits.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setDigits(newDigits);

    if (pasted.length === 6) {
      submitCode(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  const submitCode = async (codeToSubmit: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    const res = await verifyMfa(codeToSubmit, ticket);
    setIsLoading(false);

    if (res.success) {
      navigate("/app/dashboard", { replace: true });
    } else {
      const remaining = attemptsLeft - 1;
      setAttemptsLeft(remaining);
      if (remaining <= 0) {
        sessionStorage.setItem("infrascan_signout_reason", "Exceeded maximum two-factor attempts. Please log in again.");
        navigate("/login");
      } else {
        setErrorMessage(`Invalid authentication code. (${remaining} attempts remaining)`);
        setDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    }
  };

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (recoveryCode.trim().length >= 10) {
      navigate("/app/dashboard", { replace: true });
    } else {
      setErrorMessage("Invalid recovery code. Please check your backup codes.");
    }
  };

  return (
    <AuthLayout
      title="Two-Factor Authentication"
      subtitle="Verify your civil engineer security token"
      maxWidthClass="max-w-[420px]"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/80 border border-border text-foreground text-xs">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          <span>Enter the 6-digit code from your authenticator app (TOTP)</span>
        </div>

        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!useRecoveryCode ? (
          <div>
            <label className="block text-xs font-medium text-foreground mb-3 text-center">
              Security Verification Code
            </label>

            {/* 6-digit inputs with auto-advance */}
            <div className="flex items-center justify-between gap-2 mb-4" onPaste={handlePaste}>
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  autoComplete="one-time-code"
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  disabled={isLoading}
                  className="size-12 text-center text-xl font-mono font-bold rounded-lg bg-card border border-input text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring transition-colors"
                />
              ))}
            </div>

            <button
              type="button"
              disabled={isLoading || digits.some((d) => d === "")}
              onClick={() => submitCode(digits.join(""))}
              className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] disabled:opacity-50 text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Verifying security token...</span>
                </>
              ) : (
                <span>Verify & Sign In</span>
              )}
            </button>

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setUseRecoveryCode(true)}
                className="text-muted-foreground hover:text-brand-accent flex items-center gap-1 transition-colors"
              >
                <KeyRound className="size-3.5" /> Use a recovery code
              </button>
              <Link to="/login" className="hover:text-foreground">
                Cancel
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRecoverySubmit} className="space-y-4">
            <div>
              <label htmlFor="rec-code" className="block text-xs font-medium text-foreground mb-1.5">
                Emergency Recovery Code
              </label>
              <input
                id="rec-code"
                type="text"
                required
                autoFocus
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                placeholder="REC-XXXX-XXXX-XX"
                className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground font-mono text-sm uppercase placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              className="w-full h-11 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-medium text-sm transition-all shadow-sm"
            >
              Verify Backup Code
            </button>
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setUseRecoveryCode(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Back to 6-digit code entry
              </button>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
