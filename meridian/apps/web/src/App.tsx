import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/Layout/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { FeedHealthPage } from "@/pages/FeedHealthPage";
import { AlertRulesPage } from "@/pages/AlertRulesPage";
import { PlanModePage } from "@/pages/PlanModePage";
import { WatchListPage } from "@/pages/WatchListPage";
import { SitrepPage } from "@/pages/SitrepPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { StatusPage } from "@/pages/StatusPage";
import { PricingPage } from "@/pages/PricingPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { useEventSocket } from "@/hooks/useSocket";

export default function App() {
  useEventSocket();

  return (
    <Routes>
      {/* Standalone public pages (no app shell) */}
      <Route path="/status" element={<StatusPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Main app shell */}
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="feeds" element={<FeedHealthPage />} />
        <Route path="alerts" element={<AlertRulesPage />} />
        <Route path="plan" element={<PlanModePage />} />
        <Route path="watch" element={<WatchListPage />} />
        <Route path="sitrep" element={<SitrepPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
