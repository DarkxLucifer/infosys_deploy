import type { ComponentType, SVGProps } from "react";
import {
  AnalysisIcon,
  AssetsIcon,
  HomeIcon,
  InspectionsIcon,
  MaintenanceIcon,
  ReportsIcon,
  SettingsIcon,
} from "./components/astrix/icons";
import { MapPin, Bell, ShieldCheck } from "lucide-react";

export type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type NavigationItem = {
  name: string;
  href: string;
  icon: SvgIcon;
  badge?: string;
  adminOnly?: boolean;
};

export const workspaceNavigation: NavigationItem[] = [
  { name: "Overview", href: "/dashboard", icon: HomeIcon },
  { name: "Assets", href: "/dashboard/assets", icon: AssetsIcon },
  { name: "Inspections", href: "/dashboard/inspections", icon: InspectionsIcon },
  { name: "Damage Map", href: "/dashboard/damage-map", icon: MapPin as unknown as SvgIcon },
  { name: "Analysis Review", href: "/dashboard/analysis", icon: AnalysisIcon },
  { name: "Maintenance", href: "/dashboard/maintenance", icon: MaintenanceIcon },
  { name: "Reports", href: "/dashboard/reports", icon: ReportsIcon },
  { name: "Notifications", href: "/dashboard/notifications", icon: Bell as unknown as SvgIcon, badge: "3" },
  { name: "Admin Console", href: "/dashboard/admin", icon: ShieldCheck as unknown as SvgIcon, adminOnly: true },
  { name: "Settings", href: "/dashboard/settings", icon: SettingsIcon },
];

export type DateRange =
  | "today"
  | "last-7-days"
  | "last-30-days"
  | "last-90-days"
  | "last-12-months";

export const dateRangeOptions: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last-7-days", label: "Last 7 Days" },
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "last-90-days", label: "Last 90 Days" },
  { value: "last-12-months", label: "Last 12 Months" },
];

export const reportFormatLabels: Record<string, string> = {
  pdf: "PDF",
  csv: "CSV",
  json: "JSON",
};
