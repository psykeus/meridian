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
    layers: ["earthquakes", "earthquakes_emsc", "armed_conflicts", "terrorism", "emergency_squawks", "civil_flights", "military_aircraft", "wildfires", "fema_disasters", "global_disasters", "gdelt_events", "rss_news", "osint_rss", "space_weather", "iss", "crypto_markets", "acaps_crises", "radiation_monitoring", "natural_events", "trade_routes", "piracy"],
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
    layers: ["armed_conflicts", "terrorism", "gdelt_events", "emergency_squawks", "civil_flights", "military_aircraft", "vessels", "rss_news", "osint_rss", "military_bases", "piracy"],
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
    layers: ["earthquakes", "earthquakes_emsc", "wildfires", "firms_hotspots", "natural_events", "hurricanes", "global_disasters", "tsunami_zones", "weather_radar", "copernicus_ems"],
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
    layers: ["vessels", "naval_vessels", "aisstream_vessels", "piracy", "trade_routes", "seaports_global", "armed_conflicts", "rss_news", "chokepoints"],
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
    icon: "🔒",
    layers: ["cisa_vulnerabilities", "cisa_advisories", "cve_feed", "osv_vulns", "otx_threats", "internet_censorship", "bgp_hijacks", "ioda_outages", "submarine_cables", "cable_landings", "ixp_locations", "data_centers", "rss_news"],
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
    layers: ["rss_news", "armed_conflicts", "crypto_markets", "finnhub_markets", "fred_economics", "sanctions"],
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
    layers: ["emergency_squawks", "civil_flights", "military_aircraft", "faa_notams", "armed_conflicts", "airports_global"],
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
    layers: ["fema_disasters", "fema_ipaws", "wildfires", "global_disasters", "acaps_crises", "disease_outbreaks", "unhcr_displacement", "reliefweb_crises", "fews_famine"],
    panels: [
      { i: "fema",      component: "HumanitarianAlerts", x: 0, y: 0, w: 6, h: 14, minW: 3, minH: 6 },
      { i: "weather",   component: "WeatherSeismic",   x: 6, y: 0, w: 6, h: 14, minW: 3, minH: 6 },
      { i: "news",      component: "GlobalNewsFeed",   x: 0, y: 14, w: 12, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "space_satellite",
    label: "Space & Satellites",
    description: "Satellite tracking, space weather, and orbital awareness",
    icon: "🛰",
    layers: ["iss", "space_weather", "near_earth_objects", "space_launches", "nasa_donki", "celestrak_sats", "starlink_constellation", "gps_constellation", "spacetrack_catalog", "nasa-gibs-truecolor"],
    panels: [
      { i: "weather",     component: "WeatherSeismic",    x: 0, y: 0, w: 6, h: 14, minW: 3, minH: 6 },
      { i: "military",    component: "MilitaryTracker",   x: 6, y: 0, w: 6, h: 14, minW: 3, minH: 6 },
      { i: "news",        component: "GlobalNewsFeed",    x: 0, y: 14, w: 12, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    description: "Critical infrastructure: power, pipelines, cables, data centers",
    icon: "⚙",
    layers: ["submarine_cables", "cable_landings", "oil_gas_pipelines", "power_plants", "nuclear_facilities", "lng_terminals", "data_centers", "ixp_locations", "airports_global", "seaports_global", "military_bases", "trade_routes", "power_grid", "eu_energy"],
    panels: [
      { i: "energy",      component: "EnergyResources",   x: 0, y: 0, w: 6, h: 14, minW: 3, minH: 6 },
      { i: "markets",     component: "MarketsFinance",    x: 6, y: 0, w: 6, h: 14, minW: 3, minH: 6 },
      { i: "news",        component: "GlobalNewsFeed",    x: 0, y: 14, w: 12, h: 9, minW: 3, minH: 5 },
    ],
  },
  {
    id: "ai_analyst",
    label: "AI Analyst",
    description: "AI-powered intelligence chat, risk index, daily brief, and correlation engine",
    icon: "🤖",
    layers: ["armed_conflicts", "earthquakes", "gdelt_events", "rss_news"],
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
    layers: ["earthquakes", "armed_conflicts", "terrorism", "wildfires", "vessels", "piracy", "emergency_squawks", "military_aircraft", "gdelt_events", "global_disasters", "trade_routes", "submarine_cables"],
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
