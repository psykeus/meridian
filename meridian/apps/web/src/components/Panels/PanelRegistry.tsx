import type { ReactNode } from "react";
import { ConflictPanel, WeatherSeismicPanel } from "@/pages/DashboardPage";
import { GlobalNewsFeedPanel } from "./GlobalNewsFeedPanel";
import { MarketsPanel } from "./MarketsPanel";
import { MilitaryTrackerPanel } from "./MilitaryTrackerPanel";
import { NavalForcesPanel } from "./NavalForcesPanel";
import { CyberThreatMonitorPanel } from "./CyberThreatMonitorPanel";
import { HumanitarianAlertsPanel } from "./HumanitarianAlertsPanel";
import { AIAnalystPanel } from "./AIAnalystPanel";
import { GeopoliticalRiskPanel } from "./GeopoliticalRiskPanel";
import { DailyBriefPanel } from "./DailyBriefPanel";
import { IntelBoardPanel } from "./IntelBoardPanel";
import { SocialIntelPanel } from "./SocialIntelPanel";
import { ForcePosturePanel } from "./ForcePosturePanel";
import { AirTrafficRadarPanel } from "./AirTrafficRadarPanel";
import { AviationTrackerPanel } from "./AviationTrackerPanel";
import { EnergyResourcesPanel } from "./EnergyResourcesPanel";
import { SupplyChainPanel } from "./SupplyChainPanel";
import { SitrepPanel } from "./SitrepPanel";
import { CorrelationEnginePanel } from "./CorrelationEnginePanel";
import { SpaceLaunchesPanel } from "./SpaceLaunchesPanel";
import { NuclearWMDPanel } from "./NuclearWMDPanel";

type ComponentName =
  | "ConflictMonitor"
  | "WeatherSeismic"
  | "GlobalNewsFeed"
  | "MarketsFinance"
  | "MilitaryTracker"
  | "NavalForces"
  | "CyberThreatMonitor"
  | "HumanitarianAlerts"
  | "AIAnalyst"
  | "GeopoliticalRisk"
  | "DailyBrief"
  | "IntelBoard"
  | "SocialIntel"
  | "ForcePosture"
  | "AirTrafficRadar"
  | "AviationTracker"
  | "EnergyResources"
  | "SupplyChain"
  | "SitrepBuilder"
  | "CorrelationEngine"
  | "SpaceLaunches"
  | "NuclearWMD";

const REGISTRY: Record<ComponentName, (props?: Record<string, unknown>) => ReactNode> = {
  ConflictMonitor:    () => <ConflictPanel />,
  WeatherSeismic:     () => <WeatherSeismicPanel />,
  GlobalNewsFeed:     () => <GlobalNewsFeedPanel />,
  MarketsFinance:     () => <MarketsPanel />,
  MilitaryTracker:    () => <MilitaryTrackerPanel />,
  NavalForces:        () => <NavalForcesPanel />,
  CyberThreatMonitor: () => <CyberThreatMonitorPanel />,
  HumanitarianAlerts: () => <HumanitarianAlertsPanel />,
  AIAnalyst:          () => <AIAnalystPanel />,
  GeopoliticalRisk:   () => <GeopoliticalRiskPanel />,
  DailyBrief:         () => <DailyBriefPanel />,
  IntelBoard:         (props) => <IntelBoardPanel roomId={(props?.roomId as number) ?? 0} />,
  SocialIntel:        () => <SocialIntelPanel />,
  ForcePosture:       () => <ForcePosturePanel />,
  AirTrafficRadar:    () => <AirTrafficRadarPanel />,
  AviationTracker:    () => <AviationTrackerPanel />,
  EnergyResources:    () => <EnergyResourcesPanel />,
  SupplyChain:        () => <SupplyChainPanel />,
  SitrepBuilder:      () => <SitrepPanel />,
  CorrelationEngine:  () => <CorrelationEnginePanel />,
  SpaceLaunches:      () => <SpaceLaunchesPanel />,
  NuclearWMD:         () => <NuclearWMDPanel />,
};

export function renderPanel(componentName: string, props?: Record<string, unknown>): ReactNode {
  const factory = REGISTRY[componentName as ComponentName];
  if (!factory) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 12 }}>
        Panel: {componentName}
      </div>
    );
  }
  return factory(props);
}
