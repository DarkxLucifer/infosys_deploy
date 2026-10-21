import { Link } from "react-router-dom";
import { SearchX, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-card shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-secondary text-primary mx-auto flex items-center justify-center mb-4">
          <SearchX className="h-6 w-6" />
        </div>
        <span className="text-xs font-semibold text-primary uppercase tracking-wider">Error 404</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1 mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The requested page does not exist or has been moved to a different civil engineering route.
        </p>
        <Link to="/" className="w-full inline-block">
          <Button className="w-full flex items-center justify-center gap-2">
            <Home className="h-4 w-4" />
            <span>Return to home</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
