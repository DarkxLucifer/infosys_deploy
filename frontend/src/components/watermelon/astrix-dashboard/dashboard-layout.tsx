import type { CSSProperties, ReactNode } from "react";
import { Info } from "lucide-react";
import { DashboardSidebar } from "./components/astrix/sidebar";
import { DashboardTopbar } from "./components/astrix/topbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import "./dashboard.css";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider
      className="astrix-dashboard h-svh overflow-hidden no-scrollbar"
      style={
        {
          "--sidebar-width": "18.125rem",
          "--sidebar-width-icon": "5.125rem",
        } as CSSProperties
      }
    >
      <DashboardSidebar />

      <main className="flex flex-1 flex-col overflow-hidden bg-background">
        <div className="sticky top-0 z-50 w-full bg-background">
          <DashboardTopbar />
          {/* Mandatory Section 5 Disclaimer Strip: Always visible, one line across every dashboard screen */}
          <div
            role="region"
            aria-label="Engineering disclaimer"
            className="w-full bg-amber-950/70 border-b border-amber-600/50 px-4 py-1.5 text-center text-xs font-medium text-amber-200 flex items-center justify-center gap-2"
          >
            <Info className="size-3.5 text-amber-400 shrink-0" />
            <span className="truncate">
              <strong>Notice:</strong> AI results are decision support. Engineer review is required before any report is issued.
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </SidebarProvider>
  );
}
