import { useEffect, Component, type ReactNode, type ErrorInfo } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AppStoreProvider, useAppStore } from "@/store/app";
import { AuthProvider, useAuth } from "@/store/auth-context";
import { SessionTimeoutModal } from "@/components/auth/session-timeout-modal";
import { Toaster } from "@/components/ui/sonner";

import DashboardLayout from "@/components/watermelon/astrix-dashboard/dashboard-layout";
import { DashboardNavigationProvider } from "@/components/watermelon/astrix-dashboard/components/astrix/navigation";
import { ThemeProvider } from "@/components/watermelon/astrix-dashboard/components/astrix/theme-provider";

// Role-based Dashboards
import { InspectorDashboard } from "@/components/dashboard/role-dashboards/inspector-dashboard";
import { CivilEngineerDashboard } from "@/components/dashboard/role-dashboards/engineer-dashboard";
import { InfrastructureManagerDashboard } from "@/components/dashboard/role-dashboards/manager-dashboard";
import { MaintenanceEngineerDashboard } from "@/components/dashboard/role-dashboards/maintenance-dashboard";
import { AdministratorDashboard } from "@/components/dashboard/role-dashboards/admin-dashboard";
import { NotificationsCenter } from "@/components/dashboard/notifications-center";

// Authentication Suite (Part 2)
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";
import ForgotPasswordPage from "@/pages/auth/forgot-password";
import ResetPasswordPage from "@/pages/auth/reset-password";
import VerifyEmailPage from "@/pages/auth/verify-email";
import TwoFactorPage from "@/pages/auth/mfa";
import AcceptInvitationPage from "@/pages/auth/accept-invitation";
import AccessDeniedPage from "@/pages/auth/access-denied";
import AccountLockedPage from "@/pages/auth/account-locked";
import SignedOutPage from "@/pages/auth/signed-out";
import SetupPage from "@/pages/auth/setup";
import OAuthCallbackPage from "@/pages/auth/oauth-callback";

// Real Legal & Support Pages (Part 0.2 Rule 8)
import PrivacyPage from "@/pages/legal/privacy";
import TermsPage from "@/pages/legal/terms";
import AccessibilityPage from "@/pages/legal/accessibility";
import ContactPage from "@/pages/legal/contact";
import NotFoundPage from "@/pages/not-found";

// Review Queue & Profile (Part 3)
import ReviewQueuePage from "@/pages/review-queue";
import ProfilePage from "@/pages/profile";

// Core Infrastructure Views
import { AssetsPage } from "@/components/dashboard/assets";
import { AssetDetailPage } from "@/components/dashboard/asset-detail";
import { InspectionsPage } from "@/components/dashboard/inspections";
import { InspectionDetailPage } from "@/components/dashboard/inspection-detail";
import { DamageMapPage } from "@/pages/damage-map";
import { DamageAnalyticsPage } from "@/pages/damage-analytics";
import { InspectionNewPage } from "@/components/dashboard/inspection-new";
import { AnalysisDetailPage } from "@/components/dashboard/analysis-detail";
import { MaintenancePage } from "@/components/dashboard/maintenance";

/* ------------------------------------------------------------------ */
/* Route Guards & Session Bridges                                     */
/* ------------------------------------------------------------------ */

function RequireSession({ children }: { children: ReactNode }) {
  const { state, signIn, signOut } = useAppStore();
  const { user, isLoading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (user && !state.session) {
      const match = state.users.find(
        (u) =>
          u.role ===
          (user.role === "maintenance"
            ? "maintenance-engineer"
            : user.role === "engineer"
            ? "civil-engineer"
            : user.role)
      );
      if (match) {
        signIn(match.id);
      }
    } else if (!user && state.session) {
      signOut();
    }
  }, [user, state.session, state.users, signIn, signOut]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs text-muted-foreground font-mono">Restoring session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function DashboardRoleDispatcher() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  const role = user.role;

  if (role === "inspector") return <InspectorDashboard />;
  if (role === "manager") return <InfrastructureManagerDashboard />;
  if (role === "maintenance" || (role as string) === "maintenance-engineer") return <MaintenanceEngineerDashboard />;
  if (role === "admin") return <AdministratorDashboard />;
  return <CivilEngineerDashboard />;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class DashboardErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Dashboard error boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4 text-center">
          <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h2 className="text-lg font-bold text-foreground">Dashboard View Encountered an Issue</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {this.state.error?.message || "An unexpected error occurred while rendering this dashboard widget."}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Reload Page
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/app/dashboard";
              }}
              className="px-4 py-2 rounded-lg border border-border bg-card text-foreground text-xs font-semibold hover:bg-muted transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardShell() {
  return (
    <DashboardNavigationProvider>
      <DashboardLayout>
        <DashboardErrorBoundary>
          <Outlet />
        </DashboardErrorBoundary>
      </DashboardLayout>
    </DashboardNavigationProvider>
  );
}

function AssetDetailRoute() {
  const { id = "" } = useParams();
  return <AssetDetailPage assetId={id} />;
}

/* ------------------------------------------------------------------ */
/* Main Application Routes Table                                      */
/* ------------------------------------------------------------------ */

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="infrascan-theme">
      <AuthProvider>
        <AppStoreProvider>
          <Routes>
            {/* Landing / Marketing Page (Part 1) */}
            <Route path="/" element={<LandingPage />} />

          {/* Authentication & Account Flow (Part 2) */}
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signin" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/two-factor" element={<TwoFactorPage />} />
          <Route path="/mfa" element={<TwoFactorPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="/accept-invite" element={<AcceptInvitationPage />} />
          <Route path="/invitations/:token" element={<AcceptInvitationPage />} />
          <Route path="/signed-out" element={<SignedOutPage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route path="/403" element={<AccessDeniedPage />} />
          <Route path="/account-locked" element={<AccountLockedPage />} />

          {/* Legal and Support Pages (Part 0.2 Rule 8) */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/accessibility" element={<AccessibilityPage />} />
          <Route path="/contact" element={<ContactPage />} />

          {/* Protected Application Routes under /app/* (Part 3) */}
          <Route
            path="/app"
            element={
              <RequireSession>
                <DashboardShell />
              </RequireSession>
            }
          >
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardRoleDispatcher />} />
            <Route path="review" element={<ReviewQueuePage />} />
            <Route path="review/:id" element={<AnalysisDetailPage />} />
            <Route path="analysis/:id" element={<AnalysisDetailPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="maintenance/:id" element={<MaintenancePage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="assets/:id" element={<AssetDetailRoute />} />
            <Route path="inspections" element={<InspectionsPage />} />
            <Route path="inspections/new" element={<InspectionNewPage />} />
            <Route path="inspections/:id" element={<InspectionDetailPage />} />
            <Route path="notifications" element={<NotificationsCenter />} />
            <Route path="map" element={<DamageMapPage />} />
            <Route path="analytics" element={<DamageAnalyticsPage />} />
            <Route path="profile" element={<ProfilePage />} />

            {/* Direct role shortcuts */}
            <Route path="inspector" element={<InspectorDashboard />} />
            <Route path="engineer" element={<CivilEngineerDashboard />} />
            <Route path="manager" element={<InfrastructureManagerDashboard />} />
            <Route path="maintenance-console" element={<MaintenanceEngineerDashboard />} />
            <Route path="admin" element={<AdministratorDashboard />} />
          </Route>

          {/* Backward compatibility for /dashboard/* redirecting to /app/* */}
          <Route
            path="/dashboard/*"
            element={
              <RequireSession>
                <DashboardShell />
              </RequireSession>
            }
          >
            <Route index element={<DashboardRoleDispatcher />} />
            <Route path="review" element={<ReviewQueuePage />} />
            <Route path="review/:id" element={<AnalysisDetailPage />} />
            <Route path="analysis/:id" element={<AnalysisDetailPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="maintenance/:id" element={<MaintenancePage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="assets/:id" element={<AssetDetailRoute />} />
            <Route path="inspections" element={<InspectionsPage />} />
            <Route path="inspections/new" element={<InspectionNewPage />} />
            <Route path="inspections/:id" element={<InspectionDetailPage />} />
            <Route path="notifications" element={<NotificationsCenter />} />
            <Route path="map" element={<DamageMapPage />} />
            <Route path="analytics" element={<DamageAnalyticsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="inspector" element={<InspectorDashboard />} />
            <Route path="engineer" element={<CivilEngineerDashboard />} />
            <Route path="manager" element={<InfrastructureManagerDashboard />} />
            <Route path="maintenance-console" element={<MaintenanceEngineerDashboard />} />
            <Route path="admin" element={<AdministratorDashboard />} />
          </Route>

          {/* 404 Catch-All */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        {/* Global Overlays */}
        <SessionTimeoutModal />
        <Toaster position="bottom-right" />
      </AppStoreProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
