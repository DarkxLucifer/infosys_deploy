import { Link } from "react-router-dom";
import { ShieldX, ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { useAuth } from "@/store/auth-context";

export default function AccessDeniedPage() {
  const { user } = useAuth();
  const returnPath = user ? "/app/dashboard" : "/login";

  return (
    <AuthLayout title="Access Denied (403)" subtitle="Role-based permission restriction">
      <div className="text-center py-4 space-y-4">
        <div className="mx-auto size-12 rounded-full bg-destructive/10 border border-destructive/40 flex items-center justify-center text-destructive">
          <ShieldX className="size-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">You don&apos;t have access to this page</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your current authenticated role <strong className="text-primary">({user?.role || "guest"})</strong> does not hold the necessary security permissions to view this module.
        </p>
        <div className="pt-2">
          <Link
            to={returnPath}
            className="w-full h-11 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground font-medium text-xs inline-flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <ArrowLeft className="size-3.5" /> Return to My Dashboard
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
