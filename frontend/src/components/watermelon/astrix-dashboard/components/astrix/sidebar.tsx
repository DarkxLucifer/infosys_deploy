import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  CheckSquare,
  Building,
  Bell,
  LogOut,
  Moon,
  Sun,
  User,
  MapPin,
  Wrench,
  FileText,
  Users,
  Cpu,
  Activity,
  HeartPulse,
  BarChart3,
} from "lucide-react";
import { SidebarToggleIcon } from "./icons";
import { useTheme } from "./theme-provider";
import { useAppStore } from "@/store/app";
import { useAuth } from "@/store/auth-context";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";

interface NavEntry {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export function DashboardSidebar() {
  const { toggleSidebar } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const { state } = useAppStore();
  const { user: authUser, logout } = useAuth();
  const location = useLocation();

  const currentRole = authUser?.role || (state.session?.role === "maintenance-engineer" ? "maintenance" : state.session?.role === "civil-engineer" ? "engineer" : state.session?.role) || "engineer";

  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const fetchUnread = () => {
      api.getNotifications(undefined, undefined, undefined, currentRole)
        .then((items) => {
          if (mounted && Array.isArray(items)) {
            const count = items.filter((n) => !n.read_at).length;
            setUnreadCount(count);
          }
        })
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [currentRole]);

  const notifBadge = unreadCount > 0 ? String(unreadCount) : undefined;

  // Build role-specific sidebar items complying with Section 3.3
  const navItems: NavEntry[] = [
    { name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  ];

  if (currentRole === "inspector") {
    navItems.push(
      { name: "Inspections", href: "/app/inspections", icon: ClipboardList },
      { name: "Assets", href: "/app/assets", icon: Building },
      { name: "Damage Analytics", href: "/app/analytics", icon: BarChart3 },
      ...(FEATURES.damageMap ? [{ name: "Damage Map", href: "/app/map", icon: MapPin }] : []),
      { name: "Notifications", href: "/app/notifications", icon: Bell, badge: notifBadge },
    );
  } else if (currentRole === "engineer") {
    navItems.push(
      { name: "Review Queue", href: "/app/review", icon: CheckSquare },
      { name: "Damage Analytics", href: "/app/analytics", icon: BarChart3 },
      { name: "Inspections", href: "/app/inspections", icon: ClipboardList },
      { name: "Assets", href: "/app/assets", icon: Building },
      ...(FEATURES.damageMap ? [{ name: "Damage Map", href: "/app/map", icon: MapPin }] : []),
      ...(FEATURES.reportsRoute ? [{ name: "Reports", href: "/app/reports", icon: FileText }] : []),
      { name: "Notifications", href: "/app/notifications", icon: Bell, badge: notifBadge },
    );
  } else if (currentRole === "maintenance") {
    navItems.push(
      ...(FEATURES.maintenanceRoute ? [{ name: "Maintenance", href: "/app/maintenance", icon: Wrench }] : []),
      { name: "Damage Analytics", href: "/app/analytics", icon: BarChart3 },
      { name: "Assets", href: "/app/assets", icon: Building },
      ...(FEATURES.damageMap ? [{ name: "Damage Map", href: "/app/map", icon: MapPin }] : []),
      { name: "Notifications", href: "/app/notifications", icon: Bell, badge: notifBadge },
    );
  } else if (currentRole === "manager") {
    navItems.push(
      { name: "Damage Analytics", href: "/app/analytics", icon: BarChart3 },
      { name: "Assets", href: "/app/assets", icon: Building },
      { name: "Inspections", href: "/app/inspections", icon: ClipboardList },
      ...(FEATURES.damageMap ? [{ name: "Damage Map", href: "/app/map", icon: MapPin }] : []),
      ...(FEATURES.maintenanceRoute ? [{ name: "Maintenance", href: "/app/maintenance", icon: Wrench }] : []),
      ...(FEATURES.reportsRoute ? [{ name: "Reports", href: "/app/reports", icon: FileText }] : []),
      { name: "Notifications", href: "/app/notifications", icon: Bell, badge: notifBadge },
    );
  } else if (currentRole === "admin") {
    navItems.push(
      ...(FEATURES.adminUsersRoute ? [{ name: "Users", href: "/app/admin/users", icon: Users }] : []),
      ...(FEATURES.adminModelsRoute ? [{ name: "Models", href: "/app/admin/models", icon: Cpu }] : []),
      { name: "Damage Analytics", href: "/app/analytics", icon: BarChart3 },
      ...(FEATURES.adminAuditRoute ? [{ name: "Audit log", href: "/app/admin/audit", icon: Activity }] : []),
      ...(FEATURES.adminHealthRoute ? [{ name: "Platform health", href: "/app/admin/health", icon: HeartPulse }] : []),
      { name: "Assets", href: "/app/assets", icon: Building },
      ...(FEATURES.damageMap ? [{ name: "Damage Map", href: "/app/map", icon: MapPin }] : []),
      { name: "Notifications", href: "/app/notifications", icon: Bell, badge: notifBadge },
    );
  }

  const userName = authUser?.name || state.session?.name || "Civil Inspector";
  const userOrg = "State Highway Authority";
  const displayRoleLabel =
    currentRole === "engineer"
      ? "Civil Engineer"
      : currentRole === "inspector"
      ? "Infrastructure Inspector"
      : currentRole === "manager"
      ? "Infrastructure Manager"
      : currentRole === "maintenance"
      ? "Maintenance Engineer"
      : "Administrator";

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
      <SidebarHeader className="h-16 flex-row items-center justify-between px-3 group-data-[collapsible=icon]:px-3">
        <Link
          to="/app/dashboard"
          className="flex min-w-0 items-center gap-2.5 overflow-hidden group-data-[collapsible=icon]:hidden"
        >
          <img
            src="/infrascan-logo.png"
            alt="InfraScan"
            className="h-8 w-auto object-contain rounded shrink-0"
          />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-base font-bold tracking-tight text-sidebar-foreground">
              InfraScan
            </span>
            <span className="truncate text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Civil Intelligence
            </span>
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={toggleSidebar}
          className="ml-auto text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:size-10"
        >
          <SidebarToggleIcon className="size-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden px-3 py-4 group-data-[collapsible=icon]:px-2">
        <SidebarMenu className="gap-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.name}
                  className="h-10 rounded-xl"
                >
                  <Link
                    to={item.href}
                    className={cn(
                      "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate group-data-[collapsible=icon]:hidden">
                      {item.name}
                    </span>
                    {item.badge && (
                      <span className="ml-auto rounded-full bg-primary/10 text-primary px-1.5 py-0.2 text-[10px] font-mono group-data-[collapsible=icon]:hidden">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer: User Name, Role and Organisation */}
      <SidebarFooter className="p-3 border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                className="w-full flex items-center gap-2.5 rounded-xl p-1.5 text-left text-xs hover:bg-sidebar-accent transition-colors"
                aria-label="Account menu"
              >
                <Avatar className="size-9 rounded-lg">
                  <AvatarImage
                    src={`https://api.dicebear.com/10.x/initials/svg?seed=${encodeURIComponent(userName)}`}
                    alt={userName}
                  />
                  <AvatarFallback className="rounded-lg bg-secondary text-primary font-bold">
                    {userName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate font-bold text-foreground text-xs leading-snug">{userName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{displayRoleLabel}</p>
                  <p className="truncate text-[10px] text-primary/80 font-medium">{userOrg}</p>
                </div>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" side="top" className="w-60 p-2">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal px-2 py-1.5">
                    <p className="font-bold text-xs text-foreground">{userName}</p>
                    <p className="text-[11px] text-muted-foreground">{displayRoleLabel}</p>
                    <p className="text-[10px] text-primary mt-0.5">{userOrg}</p>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/app/profile" className="flex items-center gap-2 cursor-pointer text-xs">
                    <User className="size-3.5" />
                    <span>Profile settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleTheme} className="flex items-center gap-2 cursor-pointer text-xs">
                  {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                  <span>{theme === "dark" ? "Light theme (Default)" : "Dark theme"}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logout()}
                  className="flex items-center gap-2 cursor-pointer text-xs text-destructive focus:text-destructive"
                >
                  <LogOut className="size-3.5" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
