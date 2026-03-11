import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/Layout/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { FeedHealthPage } from "@/pages/FeedHealthPage";
import { AlertRulesPage } from "@/pages/AlertRulesPage";
import { PlanModePage } from "@/pages/PlanModePage";
import { WatchListPage } from "@/pages/WatchListPage";
import { SitrepPage } from "@/pages/SitrepPage";
import { useEventSocket } from "@/hooks/useSocket";

export default function App() {
  useEventSocket();

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="feeds" element={<FeedHealthPage />} />
        <Route path="alerts" element={<AlertRulesPage />} />
        <Route path="plan" element={<PlanModePage />} />
        <Route path="watch" element={<WatchListPage />} />
        <Route path="sitrep" element={<SitrepPage />} />
      </Route>
    </Routes>
  );
}
