import type { Layout } from "react-grid-layout";

export interface PanelSlot {
  i: string;
  component: string;
  x: number; y: number; w: number; h: number;
  minW?: number; minH?: number;
}

export interface Deck {
  id: string;
  label: string;
  description: string;
  icon: string;
  layers: string[];
  panels: PanelSlot[];
}

export const DECKS: Deck[] = [
  {
    id: "command_center",
    label: "Command Center",
    description: "Full-spectrum global operational overview",
    icon: "◉",
    layers: ["earthquakes", "armed_conflicts", "weather_alerts", "emergency_squawks", "wildfires", "fema_disasters"],
    panels: [
      { i: "conflict",  component: "ConflictMonitor",  x: 0, y: 0, w: 6, h: 10, minW: 3, minH: 5 },
      { i: "weather",   component: "WeatherSeismic",   x: 6, y: 0, w: 6, h: 10, minW: 3, minH: 5 },
      { i: "news",      component: "GlobalNewsFeed",   x: 0, y: 10, w: 6, h: 9, minW: 3, minH: 5 },
      { i: "markets",   component: "MarketsFinance",   x: 6, y: 10, w: 6, h: 9, minW: 3, minH: 5 },
      { i: "military",  component: "MilitaryTracker",  x: 0, y: 19, w: 6, h: 9, minW: 3, minH: 5 },
      { i: "naval",     component: "NavalForces",      x: 6, y: 19, w: 6, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "war_conflict",
    label: "War & Conflict",
    description: "Active conflict and military movement monitoring",
    icon: "⚔",
    layers: ["armed_conflicts", "gdelt_events", "emergency_squawks", "vessels", "news"],
    panels: [
      { i: "conflict",  component: "ConflictMonitor",  x: 0, y: 0, w: 6, h: 14, minW: 4, minH: 6 },
      { i: "posture",   component: "ForcePosture",     x: 6, y: 0, w: 3, h: 14, minW: 3, minH: 6 },
      { i: "military",  component: "MilitaryTracker",  x: 9, y: 0, w: 3, h: 14, minW: 3, minH: 6 },
      { i: "news",      component: "GlobalNewsFeed",   x: 0, y: 14, w: 6, h: 10, minW: 3, minH: 5 },
      { i: "naval",     component: "NavalForces",      x: 6, y: 14, w: 6, h: 10, minW: 3, minH: 5 },
    ],
  },
  {
    id: "environment",
    label: "Environment & Climate",
    description: "Natural hazard and environmental monitoring",
    icon: "🌍",
    layers: ["earthquakes", "wildfires", "weather_alerts", "hurricanes", "global_disasters", "river_gauges"],
    panels: [
      { i: "weather",   component: "WeatherSeismic",   x: 0, y: 0, w: 8, h: 14, minW: 4, minH: 6 },
      { i: "fema",      component: "HumanitarianAlerts", x: 8, y: 0, w: 4, h: 14, minW: 3, minH: 5 },
      { i: "news",      component: "GlobalNewsFeed",   x: 0, y: 14, w: 12, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "maritime_trade",
    label: "Maritime & Trade",
    description: "Shipping, naval intelligence, and supply chain monitoring",
    icon: "⚓",
    layers: ["vessels", "armed_conflicts", "news"],
    panels: [
      { i: "naval",   component: "NavalForces",   x: 0, y: 0, w: 4, h: 12, minW: 3, minH: 5 },
      { i: "supply",  component: "SupplyChain",   x: 4, y: 0, w: 4, h: 12, minW: 3, minH: 5 },
      { i: "markets", component: "MarketsFinance", x: 8, y: 0, w: 4, h: 12, minW: 3, minH: 5 },
      { i: "news",    component: "GlobalNewsFeed", x: 0, y: 12, w: 12, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "cyber_infra",
    label: "Cyber & Infrastructure",
    description: "Threat intelligence, vulnerabilities, and internet health",
    icon: "⚡",
    layers: ["cisa_kev", "news"],
    panels: [
      { i: "cyber",     component: "CyberThreatMonitor", x: 0, y: 0, w: 8, h: 14, minW: 4, minH: 6 },
      { i: "news",      component: "GlobalNewsFeed",     x: 8, y: 0, w: 4, h: 14, minW: 3, minH: 5 },
      { i: "markets",   component: "MarketsFinance",     x: 0, y: 14, w: 12, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "financial_intel",
    label: "Financial Intelligence",
    description: "Markets, sanctions, and economic risk monitoring",
    icon: "₿",
    layers: ["news", "armed_conflicts"],
    panels: [
      { i: "markets",  component: "MarketsFinance",    x: 0, y: 0, w: 6, h: 14, minW: 4, minH: 6 },
      { i: "energy",   component: "EnergyResources",   x: 6, y: 0, w: 3, h: 14, minW: 3, minH: 6 },
      { i: "risk",     component: "GeopoliticalRisk",  x: 9, y: 0, w: 3, h: 14, minW: 3, minH: 6 },
      { i: "news",     component: "GlobalNewsFeed",    x: 0, y: 14, w: 12, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "aviation",
    label: "Aviation Tracker",
    description: "Live flight tracking and aviation incidents",
    icon: "✈",
    layers: ["emergency_squawks", "armed_conflicts"],
    panels: [
      { i: "radar",    component: "AirTrafficRadar",  x: 0, y: 0, w: 6, h: 14, minW: 4, minH: 6 },
      { i: "aviation", component: "AviationTracker", x: 6, y: 0, w: 3, h: 14, minW: 3, minH: 5 },
      { i: "military", component: "MilitaryTracker", x: 9, y: 0, w: 3, h: 14, minW: 3, minH: 5 },
      { i: "weather",  component: "WeatherSeismic",  x: 0, y: 14, w: 12, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "humanitarian",
    label: "Humanitarian Response",
    description: "Disaster response, displacement, and aid operations",
    icon: "🏥",
    layers: ["fema_disasters", "wildfires", "weather_alerts", "global_disasters"],
    panels: [
      { i: "fema",      component: "HumanitarianAlerts", x: 0, y: 0, w: 6, h: 14, minW: 3, minH: 6 },
      { i: "weather",   component: "WeatherSeismic",   x: 6, y: 0, w: 6, h: 14, minW: 3, minH: 6 },
      { i: "news",      component: "GlobalNewsFeed",   x: 0, y: 14, w: 12, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "ai_analyst",
    label: "AI Analyst",
    description: "AI-powered intelligence chat, risk index, daily brief, and correlation engine",
    icon: "🤖",
    layers: ["armed_conflicts", "earthquakes", "weather_alerts"],
    panels: [
      { i: "ai",          component: "AIAnalyst",          x: 0, y: 0, w: 5, h: 18, minW: 4, minH: 8 },
      { i: "sitrep",      component: "SitrepBuilder",      x: 5, y: 0, w: 4, h: 18, minW: 3, minH: 8 },
      { i: "correlation", component: "CorrelationEngine",  x: 9, y: 0, w: 3, h: 9,  minW: 2, minH: 6 },
      { i: "risk",        component: "GeopoliticalRisk",   x: 9, y: 9, w: 3, h: 9,  minW: 2, minH: 6 },
    ],
  },
  {
    id: "situational_awareness",
    label: "Situational Awareness",
    description: "All-domain global overview with AI risk scoring",
    icon: "◈",
    layers: ["earthquakes", "armed_conflicts", "weather_alerts", "wildfires", "vessels", "emergency_squawks"],
    panels: [
      { i: "conflict",     component: "ConflictMonitor",   x: 0, y: 0,  w: 4, h: 10, minW: 3, minH: 5 },
      { i: "weather",      component: "WeatherSeismic",    x: 4, y: 0,  w: 4, h: 10, minW: 3, minH: 5 },
      { i: "risk",         component: "GeopoliticalRisk",  x: 8, y: 0,  w: 4, h: 10, minW: 2, minH: 5 },
      { i: "military",     component: "MilitaryTracker",   x: 0, y: 10, w: 3, h: 9,  minW: 3, minH: 5 },
      { i: "naval",        component: "NavalForces",       x: 3, y: 10, w: 3, h: 9,  minW: 3, minH: 5 },
      { i: "correlation",  component: "CorrelationEngine", x: 6, y: 10, w: 3, h: 9,  minW: 2, minH: 5 },
      { i: "ai",           component: "AIAnalyst",         x: 9, y: 10, w: 3, h: 9,  minW: 3, minH: 5 },
    ],
  },
];

export const DEFAULT_DECK_ID = "command_center";

export function getDeck(id: string): Deck {
  return DECKS.find((d) => d.id === id) ?? DECKS[0];
}

export function deckPanelsToLayout(panels: PanelSlot[]): Layout[] {
  return panels.map(({ i, x, y, w, h, minW, minH }) => ({ i, x, y, w, h, minW, minH }));
}
