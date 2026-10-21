import { useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { roleLabels, useAppStore } from "@/store/app";
import type { User } from "@/store/app";
import { CrackFrame } from "@/components/inspection/crack-frame";
import { InfraScanMark } from "@/components/watermelon/astrix-dashboard/components/astrix/logo";

const personaOrder: string[] = ["u-meera", "u-arjun", "u-sofia", "u-david", "u-priya"];

export default function SignInPage() {
  const { state, signIn } = useAppStore();
  const navigate = useNavigate();

  const ordered = personaOrder
    .map((id) => state.users.find((user) => user.id === id))
    .filter((user): user is User => Boolean(user));

  const choose = (user: User) => {
    signIn(user.id);
    toast.success(`Signed in as ${user.name}`, {
      description: `${roleLabels[user.role]} · demo register loaded with 6 assets and live inspections.`,
    });
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-svh flex-col lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#17293d] p-10 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 20% 10%, rgba(63,126,196,0.35), transparent 65%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <InfraScanMark className="size-9" />
          <div>
            <div className="text-sm font-bold tracking-wide">INFRASCAN</div>
            <div className="text-[11px] font-medium tracking-[0.22em] text-blue-200/70 uppercase">
              Infrastructure intelligence
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-balance">
            Every crack measured. Every decision signed.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-blue-100/80">
            The InfraScan console pairs AI crack detection with a hard engineering gate:
            segmentation proposes, qualified personnel dispose.
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/15 shadow-2xl">
            <CrackFrame seed={241} mode="annotated" />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-blue-200/70">
            <span className="font-mono">INSP-024 · Girder G3 midspan</span>
            <span className="rounded-md border border-white/15 px-2 py-0.5 font-semibold uppercase">
              Demo database
            </span>
          </div>
        </div>

        <p className="relative text-xs text-blue-200/60">
          Demo deployment · No pricing, no billing — a standalone functional showcase.
        </p>
      </div>

      {/* persona panel */}
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <InfraScanMark className="size-8" />
            <span className="text-sm font-bold">InfraScan</span>
          </div>

          <div className="mb-6">
            <div className="mb-1 text-[11px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              Demo access
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Choose your persona</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Five seeded personas, one shared demo database. Pick a role — the register,
              inspections and pipeline all live under it.
            </p>
          </div>

          <div className="space-y-2.5">
            {ordered.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => choose(user)}
                className="group flex w-full items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5 text-left transition-colors outline-none hover:border-primary/50 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
                  {user.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{user.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user.title}
                  </span>
                </span>
                <span className="hidden rounded-lg bg-secondary px-2 py-1 text-[10px] font-bold tracking-wide text-secondary-foreground uppercase sm:inline">
                  {roleLabels[user.role]}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-xl border bg-card px-3.5 py-3 text-xs text-muted-foreground">
            <LockKeyhole className="size-4 shrink-0 text-muted-foreground" />
            This is a functional demo — no passwords required. Demo state lives in your
            browser's localStorage and resets from Settings.
          </div>

          <a
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={(event) => {
              event.preventDefault();
              navigate("/");
            }}
          >
            <ScanSearch className="size-3.5" />
            Back to the landing page
          </a>
        </div>
      </div>
    </div>
  );
}
