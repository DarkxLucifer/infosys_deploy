import { Link } from "react-router-dom";
import { LogOut, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SignedOutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-card shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-secondary text-primary mx-auto flex items-center justify-center mb-4">
          <LogOut className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">You have been signed out.</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your authenticated session has ended safely. All browser tokens and session caches have been cleared.
        </p>
        <Link to="/login" className="w-full inline-block">
          <Button className="w-full flex items-center justify-center gap-2">
            <span>Log in again</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <div className="mt-4">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            Return to InfraScan home
          </Link>
        </div>
      </div>
    </div>
  );
}
