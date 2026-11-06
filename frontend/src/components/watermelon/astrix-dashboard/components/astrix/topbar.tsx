import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  Search,
  Moon,
  Sun,
  LogOut,
  User,
  CheckCircle2,
  UserCheck,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/store/auth-context";
import { useAppStore } from "@/store/app";
import { useTheme } from "./theme-provider";
import { api, type NotificationItem } from "@/lib/api";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { type RoleType } from "@/lib/rules";

const ROLE_OPTIONS: { role: RoleType; label: string; desc: string }[] = [
  { role: "inspector", label: "Infrastructure Inspector", desc: "Plan visits, capture and upload images, track what is waiting for review" },
  { role: "engineer", label: "Civil Engineer", desc: "Review findings, verify geometry, confirm priorities, sign off reports" },
  { role: "manager", label: "Infrastructure Manager", desc: "Asset condition oversight, maintenance priorities, damage trends and hotspots" },
  { role: "maintenance", label: "Maintenance Engineer", desc: "Work order execution, repair scheduling, follow-up inspections" },
  { role: "admin", label: "Administrator", desc: "Users, models, audit logs and platform health" },
];

export function DashboardTopbar() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const { user, logout, switchRole } = useAuth();
  const { signOut } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleRoleSwitch = async (newRole: RoleType) => {
    switchRole(newRole);
    try {
      await api.updateProfile({ role: newRole });
    } catch {
      // offline/fallback
    }
    const roleMeta = ROLE_OPTIONS.find((r) => r.role === newRole);
    toast.success(`Active role updated: ${roleMeta?.label || newRole}`, {
      description: roleMeta?.desc,
    });
  };

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch notifications
  const loadNotifications = () => {
    api.getNotifications()
      .then((data) => setNotifications(Array.isArray(data) ? data : []))
      .catch(() => setNotifications([]));
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const unreadCount = safeNotifications.filter((n) => !n.read_at).length;

  const handleMarkRead = async (id: string) => {
    await api.markNotificationRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    loadNotifications();
  };

  const currentRole = user?.role || "engineer";
  const userName = user?.name || "User";

  return (
    <>
      <header className="h-16 px-4 md:px-6 border-b border-border bg-card flex items-center justify-between gap-4">
        {/* Left side: Sidebar trigger & Global Search Palette button */}
        <div className="flex items-center gap-3">
          <SidebarTrigger />

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center gap-2.5 h-10 px-3.5 rounded-lg border border-input bg-background/50 hover:bg-muted text-muted-foreground text-xs sm:text-sm transition-colors w-44 sm:w-64 justify-between"
          >
            <div className="flex items-center gap-2">
              <Search className="size-4 shrink-0" />
              <span className="truncate">Search assets, inspections...</span>
            </div>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right side: Role Switcher, Notification Bell, Theme toggle, Avatar */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Interactive Role Switcher for Pairing & Review Evaluation */}
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/60 text-primary font-semibold text-xs select-none hover:bg-secondary cursor-pointer transition-colors shadow-2xs"
              title="Click to switch role context"
            >
              <UserCheck className="size-3.5" />
              <span className="hidden sm:inline text-muted-foreground font-normal">Role:</span>
              <span className="font-bold">
                {ROLE_OPTIONS.find((r) => r.role === currentRole)?.label || currentRole}
              </span>
              <ChevronDown className="size-3 text-muted-foreground ml-0.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-1.5">
              <DropdownMenuLabel className="text-[11px] font-bold text-muted-foreground uppercase px-2 py-1">
                Active Specification Role
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ROLE_OPTIONS.map((opt) => {
                const isActive = opt.role === currentRole;
                return (
                  <DropdownMenuItem
                    key={opt.role}
                    onClick={() => handleRoleSwitch(opt.role)}
                    className={`flex flex-col items-start gap-0.5 p-2 rounded-lg cursor-pointer text-xs ${
                      isActive ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold">{opt.label}</span>
                      {isActive && <span className="text-[10px] font-mono font-bold text-primary">CURRENT</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground leading-snug line-clamp-1">
                      {opt.desc}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notification Bell Popover */}
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="relative p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Open notifications"
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground font-mono font-bold text-[10px] flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 sm:w-96 p-2">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
                <span className="font-bold text-xs text-foreground">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] text-brand-accent hover:underline font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border py-1">
                {safeNotifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    No new notifications.
                  </div>
                ) : (
                  safeNotifications.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      className={`p-2.5 text-xs space-y-1 transition-colors ${
                        !n.read_at ? "bg-secondary/40" : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-foreground text-[11px] leading-tight">
                          {n.title}
                        </span>
                        {!n.read_at && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(n.id)}
                            className="text-muted-foreground hover:text-primary shrink-0"
                            title="Mark as read"
                          >
                            <CheckCircle2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>
                      <span className="text-[10px] text-muted-foreground/70 font-mono">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  to="/app/notifications"
                  className="w-full text-center text-xs font-semibold text-primary block py-1.5"
                >
                  View all notifications
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Toggle color theme"
            aria-label="Toggle color theme"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          {/* Avatar Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="flex items-center rounded-lg ring-offset-background focus:outline-none"
              aria-label="User menu"
            >
              <Avatar className="size-8 rounded-lg border border-border">
                <AvatarImage
                  src={`https://api.dicebear.com/10.x/initials/svg?seed=${encodeURIComponent(userName)}`}
                  alt={userName}
                />
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                  {userName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2">
              <DropdownMenuLabel className="font-normal px-2 py-1.5">
                <div className="font-bold text-xs text-foreground">{userName}</div>
                <div className="text-[11px] text-muted-foreground capitalize">{currentRole}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/profile" className="flex items-center gap-2 cursor-pointer text-xs">
                  <User className="size-3.5" />
                  <span>Profile settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme} className="flex items-center gap-2 cursor-pointer text-xs">
                {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                <span>{theme === "dark" ? "Light mode (Default)" : "Dark mode"}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  signOut();
                  await logout();
                  navigate("/login", { replace: true });
                }}
                className="flex items-center gap-2 cursor-pointer text-xs text-destructive focus:text-destructive"
              >
                <LogOut className="size-3.5" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Global Command Palette (Cmd+K) */}
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </>
  );
}
