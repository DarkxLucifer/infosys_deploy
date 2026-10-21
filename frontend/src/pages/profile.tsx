import { useState } from "react";
import { User, ShieldCheck, Lock, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/store/auth-context";
import { useTheme } from "@/components/watermelon/astrix-dashboard/components/astrix/theme-provider";

export default function ProfilePage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  const handlePasswordUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 12) {
      setPasswordStatus("New password must be at least 12 characters long.");
      return;
    }
    setPasswordStatus("Password updated successfully.");
    setCurrentPassword("");
    setNewPassword("");
  };

  const displayRoleLabel =
    user?.role === "engineer"
      ? "Civil Engineer"
      : user?.role === "inspector"
      ? "Infrastructure Inspector"
      : user?.role === "manager"
      ? "Infrastructure Manager"
      : user?.role === "maintenance"
      ? "Maintenance Engineer"
      : "Administrator";

  const displayRoleDescription =
    user?.role === "inspector"
      ? "Plan visits, capture and upload images, track what is waiting for review"
      : user?.role === "engineer"
      ? "Review findings, verify geometry, confirm priorities, sign off reports"
      : user?.role === "maintenance"
      ? "Work order execution, repair scheduling, follow-up inspections"
      : user?.role === "manager"
      ? "Asset condition oversight, maintenance priorities, damage trends and hotspots"
      : "Users, models, audit logs and platform health";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">User Profile & Security</h1>
        <p className="text-sm text-muted-foreground">
          Manage your civil inspection credentials, session preferences, and authentication keys.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="p-6 rounded-2xl border border-border bg-card shadow-xs space-y-4">
          <div className="size-16 rounded-2xl bg-secondary text-primary flex items-center justify-center font-bold text-xl">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "IS"}
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{user?.name || "Civil Inspector"}</h2>
            <p className="text-xs text-muted-foreground">{user?.email || "inspector@demo.infrascan"}</p>
          </div>
          <div className="pt-2 border-t border-border space-y-2 text-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Assigned Role:</span>
                <span className="font-semibold text-primary">{displayRoleLabel}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{displayRoleDescription}</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Organization:</span>
              <span className="font-semibold text-foreground">State Highway Authority</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Account Status:</span>
              <span className="inline-flex items-center gap-1 text-success font-semibold">
                <CheckCircle2 className="size-3" /> Active & Verified
              </span>
            </div>
          </div>
        </div>

        {/* Security & Appearance Form */}
        <div className="md:col-span-2 space-y-6">
          {/* Appearance Preference */}
          <div className="p-6 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <User className="size-4 text-primary" />
              Interface Theme
            </h2>
            <p className="text-xs text-muted-foreground">
              Select your color preference. Light (White) is the default engineering standard.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  theme === "light"
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-card border-border text-foreground hover:bg-muted"
                }`}
              >
                Light Theme (Default)
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  theme === "dark"
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-card border-border text-foreground hover:bg-muted"
                }`}
              >
                Dark Theme
              </button>
            </div>
          </div>

          {/* Password Update */}
          <div className="p-6 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Lock className="size-4 text-primary" />
              Change Password
            </h2>
            {passwordStatus && (
              <div className="p-3 rounded-lg bg-secondary text-primary text-xs font-medium">
                {passwordStatus}
              </div>
            )}
            <form onSubmit={handlePasswordUpdate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-10 px-3 rounded-lg bg-card border border-input text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  New Password (minimum 12 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-10 px-3 rounded-lg bg-card border border-input text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-semibold transition-all shadow-xs"
              >
                Update Password
              </button>
            </form>
          </div>

          {/* Session Policy Notice */}
          <div className="p-4 rounded-xl bg-muted/60 border border-border text-xs text-muted-foreground flex items-center gap-3">
            <ShieldCheck className="size-4 text-primary shrink-0" />
            <span>
              Session inactivity timeout is enforced after 30 minutes (idle warning at 28 minutes). Maximum session duration is 12 hours.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
