import { Clock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/store/auth-context";

export function SessionTimeoutModal() {
  const { showTimeoutWarning, timeoutCountdownSeconds, staySignedIn, logout } = useAuth();

  if (!showTimeoutWarning) return null;

  const minutes = Math.floor(timeoutCountdownSeconds / 60);
  const seconds = timeoutCountdownSeconds % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeout-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
    >
      <div className="w-full max-w-sm rounded-2xl bg-[#152136] border border-amber-500/50 p-6 shadow-2xl text-center space-y-4">
        <div className="mx-auto size-12 rounded-full bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400">
          <Clock className="size-6 animate-pulse" />
        </div>

        <h3 id="timeout-title" className="text-lg font-bold text-white">
          Session Inactivity Warning
        </h3>

        <div className="space-y-1">
          <p className="text-xs text-slate-300">
            You will be automatically signed out due to inactivity in:
          </p>
          <div className="font-mono text-3xl font-bold text-amber-400 tracking-wider">
            {timeFormatted}
          </div>
        </div>

        <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-left flex items-start gap-2">
          <ShieldAlert className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>Per civil security regulations, active engineering sessions expire after 30 minutes of idle time.</span>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => logout("Signed out manually during inactivity prompt.")}
            className="flex-1 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
          >
            Sign out now
          </button>
          <button
            type="button"
            onClick={staySignedIn}
            className="flex-1 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 transition-colors"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
