import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/Layout/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { FeedManagementPage } from "@/pages/FeedManagementPage";
import { AlertRulesPage } from "@/pages/AlertRulesPage";
import { PlanModePage } from "@/pages/PlanModePage";
import { WatchListPage } from "@/pages/WatchListPage";
import { SitrepPage } from "@/pages/SitrepPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { StatusPage } from "@/pages/StatusPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { LoginPage } from "@/pages/LoginPage";
import { useEventSocket } from "@/hooks/useSocket";
import { ensureFreshToken } from "@/lib/api";

// ── Global Error Boundary ──────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", background: "#0a0e14",
          color: "#c0c0c0", fontFamily: "monospace", padding: "2rem",
        }}>
          <h1 style={{ color: "#ff5252", marginBottom: "1rem" }}>Something went wrong</h1>
          <p style={{ maxWidth: 600, textAlign: "center", marginBottom: "1.5rem" }}>
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = "/"; }}
            style={{
              padding: "0.5rem 1.5rem", background: "#00e676", color: "#0a0e14",
              border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600,
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Auth Guard ──────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // On mount (including hard refresh), proactively refresh expired tokens
    ensureFreshToken().finally(() => setReady(true));
  }, []);

  if (!ready) return null; // brief pause while checking/refreshing token

  const token = localStorage.getItem("access_token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  useEventSocket();

  return (
    <ErrorBoundary>
      <Routes>
        {/* Standalone public pages (no app shell) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Main app shell — requires auth */}
        <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<DashboardPage />} />
          <Route path="feeds" element={<FeedManagementPage />} />
          <Route path="alerts" element={<AlertRulesPage />} />
          <Route path="plan" element={<PlanModePage />} />
          <Route path="watch" element={<WatchListPage />} />
          <Route path="sitrep" element={<SitrepPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
