import { Link } from "react-router-dom";
import { Lock, ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function AccountLockedPage() {
  return (
    <AuthLayout title="Account Locked" subtitle="Automated rate-limiting security triggered">
      <div className="text-center py-4 space-y-4">
        <div className="mx-auto size-12 rounded-full bg-destructive/10 border border-destructive/40 flex items-center justify-center text-destructive">
          <Lock className="size-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Temporary 15-Minute Security Lockout</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Too many consecutive failed login attempts were recorded for this identifier. To protect civil infrastructure data from unauthorized access, your account has been temporarily locked for 15 minutes.
        </p>
        <div className="pt-2 space-y-3">
          <Link
            to="/forgot-password"
            className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground font-medium text-xs inline-flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            Reset Your Password
          </Link>
          <div>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" /> Return to Login
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
