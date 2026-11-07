import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Bell, CheckCircle2, AlertTriangle, ShieldAlert,
  Info, Check, Clock, Filter, ArrowRight
} from "lucide-react";
import { apiService, type NotificationItem } from "@/lib/api";
import { useAuth } from "@/store/auth-context";

export function NotificationsCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const loadNotifications = async () => {
    try {
      const data = await apiService.getNotifications(
        undefined,
        undefined,
        unreadOnly,
        user?.role
      );
      const list = Array.isArray(data) ? data : [];
      setNotifications(list);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [user?.role, unreadOnly]);

  const handleMarkRead = async (id: string) => {
    await apiService.markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
  };

  const handleMarkAllRead = async () => {
    await apiService.markAllNotificationsRead();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: new Date().toISOString() }))
    );
  };

  const displayedList = notifications.filter((item) => {
    if (levelFilter !== "all" && item.level !== levelFilter) return false;
    if (unreadOnly && item.read_at !== null) return false;
    return true;
  });

  const unreadCount = notifications.filter((n) => n.read_at === null).length;

  const getAlertBadge = (level: NotificationItem["level"]) => {
    switch (level) {
      case "critical":
        return {
          icon: <ShieldAlert className="size-4 text-red-400 shrink-0" />,
          label: "Critical / Review Required",
          className: "bg-red-950/70 border-red-700/80 text-red-200",
        };
      case "high":
        return {
          icon: <AlertTriangle className="size-4 text-red-400 shrink-0" />,
          label: "High Priority",
          className: "bg-red-500/15 border-red-500/40 text-red-300",
        };
      case "medium":
        return {
          icon: <Clock className="size-4 text-amber-400 shrink-0" />,
          label: "Medium Priority",
          className: "bg-amber-500/15 border-amber-500/40 text-amber-300",
        };
      case "low":
        return {
          icon: <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />,
          label: "Low Priority",
          className: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
        };
      case "informational":
      default:
        return {
          icon: <Info className="size-4 text-blue-400 shrink-0" />,
          label: "Informational",
          className: "bg-blue-500/15 border-blue-500/40 text-blue-300",
        };
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">Notification & Alert Center</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Role-routed inspection alerts, critical defect notifications & maintenance milestones
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="h-8 px-3 rounded-lg border border-border bg-card hover:bg-accent text-xs font-medium text-foreground flex items-center gap-1.5 transition-colors"
            >
              <Check className="size-3.5" />
              Mark all as read ({unreadCount})
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground mr-1 flex items-center gap-1">
            <Filter className="size-3" /> Level:
          </span>
          {["all", "critical", "high", "medium", "low", "informational"].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                levelFilter === lvl
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="size-4 rounded border-border"
          />
          <span>Show unread only</span>
        </label>
      </div>

      {/* Notification List */}
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted/60" />
            ))}
          </div>
        ) : displayedList.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-border bg-card/40 p-8 space-y-2">
            <CheckCircle2 className="mx-auto size-8 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">No active notifications matching criteria</h3>
            <p className="text-xs text-muted-foreground">All alerts for your role have been acknowledged.</p>
          </div>
        ) : (
          displayedList.map((notif) => {
            const badge = getAlertBadge(notif.level);
            const isUnread = notif.read_at === null;

            return (
              <div
                key={notif.id}
                className={`p-4 rounded-xl border transition-all text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isUnread
                    ? "bg-card border-border/90 shadow-sm"
                    : "bg-card/40 border-border/40 opacity-75"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{badge.icon}</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{notif.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${badge.className}`}>
                        {badge.label}
                      </span>
                      {isUnread && (
                        <span className="size-2 rounded-full bg-primary" title="Unread" />
                      )}
                    </div>
                    <p className="text-muted-foreground leading-relaxed">{notif.body}</p>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {new Date(notif.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(notif.id)}
                      className="h-7 px-2.5 rounded border border-border bg-card hover:bg-accent text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Mark read
                    </button>
                  )}
                  <Link
                    to={
                      notif.link ||
                      (notif.entity_type === "inspection"
                        ? `/dashboard/inspections/${notif.entity_id}`
                        : notif.entity_type === "work_order"
                        ? "/dashboard/maintenance"
                        : "/dashboard/reports")
                    }
                    className="h-7 px-2.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-medium flex items-center gap-1 transition-colors"
                  >
                    View
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
