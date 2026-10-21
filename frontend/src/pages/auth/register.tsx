import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldAlert, ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { type RoleType } from "@/lib/rules";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth-context";

// Roles allowed for self-registration: strictly EXCLUDES "admin" per Section 0.6 & 2.3
const ALLOWED_REQUESTED_ROLES: { value: RoleType; label: string; desc: string }[] = [
  { value: "inspector", label: "Infrastructure Inspector", desc: "Plan visits, capture and upload images, track what is waiting for review" },
  { value: "engineer", label: "Civil Engineer", desc: "Review findings, verify geometry, confirm priorities, sign off reports" },
  { value: "maintenance", label: "Maintenance Engineer", desc: "Work order execution, repair scheduling, follow-up inspections" },
  { value: "manager", label: "Infrastructure Manager", desc: "Asset condition oversight, maintenance priorities, damage trends and hotspots" },
];

const COMMON_PASSWORDS = [
  "password1234", "123456789012", "admin1234567", "infrascan1234", "civilengineer", "infrastructure"
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [orgOption, setOrgOption] = useState<"select" | "code">("select");
  const [publicOrgs, setPublicOrgs] = useState<{ id: string; name: string }[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [orgInviteCode, setOrgInviteCode] = useState("");
  const [requestedRole, setRequestedRole] = useState<RoleType>("engineer");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate("/app/dashboard", { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    api.getPublicOrganizations()
      .then((orgs) => {
        setPublicOrgs(orgs);
        if (orgs.length > 0) setSelectedOrg(orgs[0].id);
      })
      .catch(() => {
        setPublicOrgs([{ id: "org-1", name: "State Highway Authority" }]);
        setSelectedOrg("org-1");
      });
  }, []);

  // Password strength meter logic (12 to 128 characters)
  const passwordEvaluation = useMemo(() => {
    if (!password) return { score: 0, label: "Not entered", color: "bg-muted", notes: [] };

    const notes: string[] = [];
    let score = 0;

    if (password.length >= 12) {
      score += 35;
    } else {
      notes.push("Must be at least 12 characters long");
    }

    if (password.length >= 16) score += 15;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 20;
    if (/[0-9]/.test(password)) score += 15;
    if (/[^A-Za-z0-9]/.test(password)) score += 15;

    const lower = password.toLowerCase();
    if (COMMON_PASSWORDS.some((c) => lower.includes(c))) {
      score = Math.min(score, 20);
      notes.push("Contains common easily-guessed words");
    }

    if (fullName && fullName.length > 3 && lower.includes(fullName.toLowerCase().split(" ")[0])) {
      score = Math.min(score, 20);
      notes.push("Cannot contain your personal name");
    }

    let label = "Weak";
    let color = "bg-destructive";

    if (score >= 80) {
      label = "Very Strong";
      color = "bg-success";
    } else if (score >= 60) {
      label = "Good";
      color = "bg-primary";
    } else if (score >= 40) {
      label = "Moderate";
      color = "bg-warning";
    }

    return { score, label, color, notes };
  }, [password, fullName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 12) {
      setErrorMessage("Password must be at least 12 characters long.");
      return;
    }

    if (password.length > 128) {
      setErrorMessage("Password cannot exceed 128 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (!agreedTerms) {
      setErrorMessage("You must accept the terms of use and privacy notice.");
      return;
    }

    setIsLoading(true);
    try {
      await api.register({
        fullName,
        email: workEmail,
        password,
        organizationId: orgOption === "select" ? selectedOrg : undefined,
        inviteCode: orgOption === "code" ? orgInviteCode : undefined,
        requestedRole,
      });
      setIsSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please check your inputs.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthLayout
        title="Verification Sent"
        subtitle="AI-assisted infrastructure inspection"
        maxWidthClass="max-w-[480px]"
      >
        <div className="text-center py-4 space-y-4">
          <div className="mx-auto size-14 rounded-full bg-success-soft border border-success/40 flex items-center justify-center text-success">
            <CheckCircle2 className="size-8" />
          </div>

          <h2 className="text-xl font-bold text-foreground">Check your e-mail</h2>
          
          <p className="text-sm text-muted-foreground leading-relaxed">
            Check your e-mail to verify your address (<span className="text-foreground font-mono font-medium">{workEmail}</span>).
            An administrator will then review your access request.
          </p>

          <div className="p-4 rounded-xl bg-muted/60 border border-border text-left text-xs space-y-2 text-foreground">
            <div className="flex items-center gap-2 font-medium text-warning">
              <ShieldAlert className="size-4 shrink-0" />
              <span>Administrative Approval Required</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Your account has been registered in <strong className="text-foreground">pending_approval</strong> state for requested role <strong className="text-primary">{ALLOWED_REQUESTED_ROLES.find(r => r.value === requestedRole)?.label}</strong>. An authorized platform administrator must confirm your access before you can log in.
            </p>
          </div>

          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-brand-accent hover:underline font-medium"
            >
              <ArrowLeft className="size-4" />
              Return to Login
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create Inspection Account"
      subtitle="Register for Civil Infrastructure Defect Assessment"
      maxWidthClass="max-w-[520px]"
    >
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2.5"
        >
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div className="font-medium leading-snug">{errorMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div>
          <label htmlFor="reg-name" className="block text-xs font-medium text-foreground mb-1">
            Full Name (2 to 80 characters)
          </label>
          <input
            id="reg-name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Dr. Jane Doe, PE"
            className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
          />
        </div>

        {/* Work Email */}
        <div>
          <label htmlFor="reg-email" className="block text-xs font-medium text-foreground mb-1">
            Work E-mail
          </label>
          <input
            id="reg-email"
            type="email"
            required
            value={workEmail}
            onChange={(e) => setWorkEmail(e.target.value)}
            placeholder="jane.doe@highways.state.gov"
            className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
          />
        </div>

        {/* Organization Mode */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-foreground">
              Civil Organization / Authority
            </label>
            <div className="flex gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setOrgOption("select")}
                className={`transition-colors ${orgOption === "select" ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}`}
              >
                Select Org
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={() => setOrgOption("code")}
                className={`transition-colors ${orgOption === "code" ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}`}
              >
                Invite Code
              </button>
            </div>
          </div>

          {orgOption === "select" ? (
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="w-full h-11 px-3 rounded-lg bg-card border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            >
              {publicOrgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              required={orgOption === "code"}
              value={orgInviteCode}
              onChange={(e) => setOrgInviteCode(e.target.value.toUpperCase())}
              placeholder="e.g. ORG-SHA-8921"
              className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          )}
        </div>

        {/* Requested Role (Strictly excludes admin) */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Requested Functional Role
          </label>
          <div className="space-y-2">
            {ALLOWED_REQUESTED_ROLES.map((r) => (
              <label
                key={r.value}
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                  requestedRole === r.value
                    ? "bg-secondary/60 border-primary text-foreground shadow-xs"
                    : "bg-card border-input hover:border-foreground/30 text-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="requestedRole"
                  value={r.value}
                  checked={requestedRole === r.value}
                  onChange={() => setRequestedRole(r.value)}
                  className="mt-0.5 size-4 text-primary border-input focus:ring-ring"
                />
                <div>
                  <div className="font-semibold text-foreground text-sm">{r.label}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{r.desc}</div>
                </div>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            An administrator confirms your role before you get access.
          </p>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="reg-password" className="block text-xs font-medium text-foreground mb-1">
            Password (12 to 128 characters)
          </label>
          <div className="relative">
            <input
              id="reg-password"
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

          {/* Strength Meter */}
          {password && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Strength:</span>
                <span className="font-semibold text-foreground">{passwordEvaluation.label}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${passwordEvaluation.color}`}
                  style={{ width: `${passwordEvaluation.score}%` }}
                />
              </div>
              {passwordEvaluation.notes.length > 0 && (
                <div className="text-[11px] text-destructive">
                  {passwordEvaluation.notes[0]}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="reg-confirm-password" className="block text-xs font-medium text-foreground mb-1">
            Confirm Password
          </label>
          <input
            id="reg-confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="w-full h-11 px-3.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-[11px] text-destructive mt-1">Passwords do not match.</p>
          )}
        </div>

        {/* Terms and Privacy Checkbox (Real pages linked!) */}
        <div className="flex items-start gap-2.5 pt-1">
          <input
            id="agree-terms"
            type="checkbox"
            required
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-0.5 size-4 rounded border-input bg-card text-primary focus:ring-ring"
          />
          <label htmlFor="agree-terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer select-none">
            I agree to the{" "}
            <Link to="/terms" className="text-brand-accent underline hover:opacity-80">
              Terms of use
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-brand-accent underline hover:opacity-80">
              Privacy notice
            </Link>
            . I understand AI assessments are decision support requiring qualified engineer review.
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !agreedTerms || (password.length > 0 && password !== confirmPassword)}
          className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] disabled:opacity-50 text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Submitting registration...</span>
            </>
          ) : (
            <span>Create account</span>
          )}
        </button>
      </form>

      {/* Return to Signin */}
      <div className="mt-6 pt-5 border-t border-border text-center text-xs text-muted-foreground">
        Already have an active account?{" "}
        <Link to="/login" className="text-brand-accent font-medium hover:underline">
          Log in
        </Link>
      </div>
    </AuthLayout>
  );
}
