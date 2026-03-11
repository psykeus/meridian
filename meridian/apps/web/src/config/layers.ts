export interface LayerConfig {
  id: string;
  label: string;
  group: LayerGroup;
  sourceIds: string[];
  defaultVisible: boolean;
  color: string;
  description?: string;
}

export type LayerGroup =
  | "environment"
  | "security"
  | "aviation"
  | "maritime"
  | "military"
  | "humanitarian"
  | "cyber"
  | "energy";

export const LAYER_GROUPS: Record<LayerGroup, { label: string; icon: string }> = {
  environment:  { label: "Environment & Hazards",       icon: "🌍" },
  security:     { label: "Security & Geopolitical",     icon: "⚔" },
  aviation:     { label: "Aviation & Airspace",         icon: "✈" },
  maritime:     { label: "Maritime & Trade",            icon: "⚓" },
  military:     { label: "Military & Defense",          icon: "◈" },
  humanitarian: { label: "Humanitarian & Crisis",       icon: "♡" },
  cyber:        { label: "Space & Cyber",               icon: "⚡" },
  energy:       { label: "Energy & Infrastructure",     icon: "⚙" },
};

export const ALL_LAYERS: LayerConfig[] = [
  // ── ENVIRONMENT & HAZARDS (14) ──────────────────────────────────────────
  { id: "earthquakes",         label: "Earthquakes",                group: "environment",  sourceIds: ["usgs_earthquakes"],     defaultVisible: true,  color: "#ff9800", description: "USGS events sized by magnitude" },
  { id: "wildfires",           label: "Active Fires",               group: "environment",  sourceIds: ["nasa_firms"],           defaultVisible: true,  color: "#ff5252", description: "NASA FIRMS VIIRS active fire detections" },
  { id: "volcanoes",           label: "Volcano Alerts",             group: "environment",  sourceIds: ["volcano_discovery"],    defaultVisible: false, color: "#ff6d00", description: "GVP current alert levels" },
  { id: "hurricanes",          label: "Hurricane / Cyclone Tracks", group: "environment",  sourceIds: ["noaa_nhc"],             defaultVisible: false, color: "#00bcd4", description: "NOAA NHC active tropical systems" },
  { id: "tornado_warnings",    label: "Tornado & Storm Warnings",   group: "environment",  sourceIds: ["noaa_alerts"],          defaultVisible: false, color: "#ffeb3b", description: "NWS tornado and severe storm alerts" },
  { id: "floods",              label: "Floods & River Gauges",      group: "environment",  sourceIds: ["gdacs", "usgs_water"],  defaultVisible: false, color: "#448aff", description: "GDACS flood events + USGS river gauges" },
  { id: "tsunami_zones",       label: "Tsunami Warning Zones",      group: "environment",  sourceIds: ["noaa_alerts"],          defaultVisible: false, color: "#00bcd4", description: "Active tsunami watches and warnings" },
  { id: "landslide_risk",      label: "Landslide Risk",             group: "environment",  sourceIds: ["gdacs"],                defaultVisible: false, color: "#8d6e63", description: "NASA GLD landslide susceptibility" },
  { id: "dust_storms",         label: "Dust Storm Coverage",        group: "environment",  sourceIds: ["noaa_alerts"],          defaultVisible: false, color: "#bcaaa4", description: "Active dust and sand storm advisories" },
  { id: "weather_radar",       label: "Weather Radar",              group: "environment",  sourceIds: ["noaa_alerts"],          defaultVisible: false, color: "#80cbc4", description: "RainViewer global precipitation radar" },
  { id: "heat_extremes",       label: "Heat Index Extremes",        group: "environment",  sourceIds: ["noaa_alerts"],          defaultVisible: false, color: "#ff7043", description: "Extreme heat advisories and warnings" },
  { id: "wildfire_perimeters", label: "Wildfire Perimeters",        group: "environment",  sourceIds: ["nasa_firms"],           defaultVisible: false, color: "#e64a19", description: "Active fire perimeter polygons" },
  { id: "coral_bleaching",     label: "Coral Reef Bleaching",       group: "environment",  sourceIds: ["noaa_alerts"],          defaultVisible: false, color: "#f48fb1", description: "NOAA coral bleaching watch/alert status" },
  { id: "global_disasters",    label: "Global Disasters",           group: "environment",  sourceIds: ["gdacs"],                defaultVisible: true,  color: "#ffa726", description: "GDACS composite disaster events" },

  // ── SECURITY & GEOPOLITICAL (10) ────────────────────────────────────────
  { id: "armed_conflicts",     label: "Armed Conflicts",            group: "security",     sourceIds: ["acled"],                defaultVisible: true,  color: "#ff5252", description: "ACLED conflict events — last 30/90/180 days" },
  { id: "airstrikes",          label: "Airstrikes & Kinetic",       group: "security",     sourceIds: ["acled", "gdelt"],       defaultVisible: false, color: "#f50057", description: "Filtered airstrike and kinetic events" },
  { id: "civil_unrest",        label: "Protests & Civil Unrest",    group: "security",     sourceIds: ["acled", "gdelt"],       defaultVisible: false, color: "#ff6d00", description: "Active protests and unrest events" },
  { id: "terrorism",           label: "Terrorism Incidents",        group: "security",     sourceIds: ["acled"],                defaultVisible: false, color: "#d50000", description: "GTD-sourced terrorism incidents" },
  { id: "travel_advisories",   label: "Travel Advisory Map",        group: "security",     sourceIds: ["rss_news"],             defaultVisible: false, color: "#ff9800", description: "US State Dept travel advisory levels" },
  { id: "internet_censorship", label: "Internet Censorship",        group: "security",     sourceIds: ["cisa_kev"],             defaultVisible: false, color: "#9c27b0", description: "OONI network interference data" },
  { id: "press_freedom",       label: "Press Freedom Index",        group: "security",     sourceIds: ["rss_news"],             defaultVisible: false, color: "#7c4dff", description: "RSF Press Freedom choropleth" },
  { id: "sanctions",           label: "Active Sanctions",           group: "security",     sourceIds: ["rss_news"],             defaultVisible: false, color: "#e040fb", description: "OpenSanctions country outlines" },
  { id: "un_operations",       label: "UN Peace Operations",        group: "security",     sourceIds: ["reliefweb"],            defaultVisible: false, color: "#29b6f6", description: "DPPA active UN mission deployments" },
  { id: "gdelt_events",        label: "GDELT Political Events",     group: "security",     sourceIds: ["gdelt"],                defaultVisible: false, color: "#7c4dff", description: "GDELT event index — political tone" },

  // ── AVIATION & AIRSPACE (12) ─────────────────────────────────────────────
  { id: "civil_flights",       label: "Live Civil Flights",         group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#29b6f6", description: "All civil aircraft with ADS-B" },
  { id: "military_aircraft",   label: "Military Aircraft",          group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#ff5252", description: "ICAO hex-filtered military flights" },
  { id: "emergency_squawks",   label: "Emergency Squawks",          group: "aviation",     sourceIds: ["opensky"],              defaultVisible: true,  color: "#ff1744", description: "Squawks 7700/7600/7500 — animated" },
  { id: "vip_aircraft",        label: "VIP / Executive Aircraft",   group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#ffd740", description: "Known VIP and head-of-state callsigns" },
  { id: "helicopters",         label: "Helicopters",                group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#69f0ae", description: "Rotorcraft by ICAO category" },
  { id: "tfrs_notams",         label: "TFRs / NOTAMs",              group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#ff9100", description: "FAA Temporary Flight Restrictions" },
  { id: "airports",            label: "Global Airports",            group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#b0bec5", description: "Major international airports" },
  { id: "flight_trails",       label: "Flight Trails",              group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#448aff", description: "15-min position history trails" },
  { id: "flight_density",      label: "Flight Volume Density",      group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#448aff", description: "Heatmap of flight concentration" },
  { id: "flight_anomalies",    label: "Flight Volume Anomalies",    group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#ff6d00", description: "Unusual flight volume highlights" },
  { id: "bomber_isr",          label: "Bomber / ISR Aircraft",      group: "aviation",     sourceIds: ["opensky"],              defaultVisible: false, color: "#d50000", description: "OSINT-filtered strategic & ISR callsigns" },
  { id: "launch_corridors",    label: "Space Launch Corridors",     group: "aviation",     sourceIds: ["nasa_iss"],             defaultVisible: false, color: "#00e676", description: "Active and planned launch trajectories" },

  // ── MARITIME & TRADE (10) ────────────────────────────────────────────────
  { id: "vessels",             label: "Live Vessel Positions",      group: "maritime",     sourceIds: ["aishub"],               defaultVisible: true,  color: "#448aff", description: "AISHub — all AIS-broadcasting vessels" },
  { id: "naval_vessels",       label: "Naval Vessels",              group: "maritime",     sourceIds: ["aishub"],               defaultVisible: false, color: "#ff5252", description: "MMSI-filtered military ships" },
  { id: "carrier_groups",      label: "Carrier Strike Groups",      group: "maritime",     sourceIds: ["aishub"],               defaultVisible: false, color: "#ff1744", description: "OSINT-verified CSG positions" },
  { id: "submarine_cables",    label: "Submarine Cable Routes",     group: "maritime",     sourceIds: ["aishub"],               defaultVisible: false, color: "#ffd740", description: "TeleGeography undersea cable network" },
  { id: "chokepoints",         label: "Shipping Chokepoints",       group: "maritime",     sourceIds: ["aishub"],               defaultVisible: true,  color: "#ff6d00", description: "Hormuz, Suez, Malacca, Bab-el-Mandeb, Panama" },
  { id: "piracy_incidents",    label: "Piracy / ASAM Incidents",   group: "maritime",     sourceIds: ["reliefweb"],            defaultVisible: false, color: "#f50057", description: "IMO and ASAM piracy reports" },
  { id: "global_ports",        label: "Global Port Locations",      group: "maritime",     sourceIds: ["aishub"],               defaultVisible: false, color: "#80cbc4", description: "HDX major commercial port database" },
  { id: "uscg_incidents",      label: "USCG Maritime Incidents",    group: "maritime",     sourceIds: ["fema"],                 defaultVisible: false, color: "#29b6f6", description: "US Coast Guard incident reports" },
  { id: "tanker_routes",       label: "Oil Tanker Routes",          group: "maritime",     sourceIds: ["aishub"],               defaultVisible: false, color: "#ff9800", description: "AIS-derived tanker traffic density" },
  { id: "container_density",   label: "Container Ship Density",     group: "maritime",     sourceIds: ["aishub"],               defaultVisible: false, color: "#448aff", description: "Container vessel concentration heatmap" },

  // ── MILITARY & DEFENSE (8) ───────────────────────────────────────────────
  { id: "military_bases",      label: "Military Bases",             group: "military",     sourceIds: ["acled"],                defaultVisible: false, color: "#546e7a", description: "OSM military tag + curated global bases" },
  { id: "naval_homeports",     label: "Naval Homeports",            group: "military",     sourceIds: ["aishub"],               defaultVisible: false, color: "#455a64", description: "Curated major naval homeports" },
  { id: "nuclear_sites",       label: "Nuclear Weapons Sites",      group: "military",     sourceIds: ["iaea_news"],            defaultVisible: false, color: "#ff1744", description: "NTI open-data known sites" },
  { id: "military_hq",         label: "Military HQ Locations",      group: "military",     sourceIds: ["acled"],                defaultVisible: false, color: "#607d8b", description: "Curated command & control locations" },
  { id: "mil_exercises",       label: "Military Exercises",         group: "military",     sourceIds: ["rss_news"],             defaultVisible: false, color: "#78909c", description: "Announced and observed exercises" },
  { id: "missile_zones",       label: "Missile Test Zones",         group: "military",     sourceIds: ["iaea_news"],            defaultVisible: false, color: "#e53935", description: "NTI missile test range data" },
  { id: "arms_embargoes",      label: "Arms Embargo Countries",     group: "military",     sourceIds: ["rss_news"],             defaultVisible: false, color: "#c62828", description: "SIPRI arms embargo coverage" },
  { id: "defense_procurement", label: "Defense Procurement Hubs",  group: "military",     sourceIds: ["rss_news"],             defaultVisible: false, color: "#b0bec5", description: "SAM.gov activity clusters" },

  // ── HUMANITARIAN & CRISIS (10) ───────────────────────────────────────────
  { id: "refugee_movements",   label: "Refugee & IDP Movements",   group: "humanitarian", sourceIds: ["reliefweb"],            defaultVisible: false, color: "#ff8a65", description: "UNHCR displacement tracking" },
  { id: "humanitarian_ops",    label: "Humanitarian Operations",    group: "humanitarian", sourceIds: ["reliefweb"],            defaultVisible: false, color: "#4db6ac", description: "OCHA active operations" },
  { id: "food_insecurity",     label: "Food Insecurity Zones",      group: "humanitarian", sourceIds: ["reliefweb"],            defaultVisible: false, color: "#ffca28", description: "IPC Phase 3+ acute food insecurity" },
  { id: "disease_outbreaks",   label: "Disease Outbreaks",          group: "humanitarian", sourceIds: ["who_outbreaks", "promed_rss"], defaultVisible: false, color: "#ab47bc", description: "WHO and ProMED active outbreak alerts" },
  { id: "fema_disasters",      label: "FEMA Disasters (US)",        group: "humanitarian", sourceIds: ["fema"],                 defaultVisible: true,  color: "#ff9800", description: "Active FEMA disaster declarations" },
  { id: "fema_shelters",       label: "FEMA Open Shelters",         group: "humanitarian", sourceIds: ["fema"],                 defaultVisible: false, color: "#26c6da", description: "Currently open emergency shelters (US)" },
  { id: "nuclear_reactors",    label: "Nuclear Reactors",           group: "humanitarian", sourceIds: ["iaea_news"],            defaultVisible: false, color: "#66bb6a", description: "IAEA PRIS operational reactors" },
  { id: "radiation_monitoring",label: "Radiation Monitoring",       group: "humanitarian", sourceIds: ["iaea_news"],            defaultVisible: false, color: "#ffee58", description: "EURDEP radiation monitoring network" },
  { id: "famine_warnings",     label: "Famine Warning Areas",       group: "humanitarian", sourceIds: ["reliefweb"],            defaultVisible: false, color: "#ef6c00", description: "FEWS NET famine early warning zones" },
  { id: "acaps_crises",        label: "ACAPS Crisis Severity",      group: "humanitarian", sourceIds: ["acaps"],                defaultVisible: false, color: "#e53935", description: "ACAPS INFORM humanitarian severity" },

  // ── SPACE & CYBER (5) ────────────────────────────────────────────────────
  { id: "iss",                 label: "ISS Position",               group: "cyber",        sourceIds: ["nasa_iss"],             defaultVisible: false, color: "#00e676", description: "Live International Space Station track" },
  { id: "satellites",          label: "Active Satellites",          group: "cyber",        sourceIds: ["nasa_iss"],             defaultVisible: false, color: "#69f0ae", description: "Celestrak TLE-derived LEO satellites" },
  { id: "ground_stations",     label: "Ground Station Network",     group: "cyber",        sourceIds: ["noaa_space_weather"],   defaultVisible: false, color: "#40c4ff", description: "SatNOGS global ground station map" },
  { id: "internet_outages",    label: "Internet Outage Overlay",    group: "cyber",        sourceIds: ["cisa_kev"],             defaultVisible: false, color: "#ff6d00", description: "Cloudflare Radar outage heatmap" },
  { id: "sub_cables",          label: "Submarine Comm Cables",      group: "cyber",        sourceIds: ["aishub"],               defaultVisible: false, color: "#ffd740", description: "Undersea fiber optic cable network" },

  // ── ENERGY & INFRASTRUCTURE (5) ──────────────────────────────────────────
  { id: "nuclear_plants",      label: "Nuclear Power Plants",       group: "energy",       sourceIds: ["iaea_news"],            defaultVisible: false, color: "#66bb6a", description: "IAEA PRIS operational reactor locations" },
  { id: "power_grid",          label: "Power Grid Infrastructure",  group: "energy",       sourceIds: ["noaa_space_weather"],   defaultVisible: false, color: "#ffd740", description: "EIA major grid transmission lines" },
  { id: "lng_terminals",       label: "LNG Terminals",              group: "energy",       sourceIds: ["aishub"],               defaultVisible: false, color: "#26c6da", description: "Global LNG import/export terminals" },
  { id: "oil_gas_infra",       label: "Oil & Gas Infrastructure",   group: "energy",       sourceIds: ["aishub"],               defaultVisible: false, color: "#ff9800", description: "EIA pipelines, refineries, platforms" },
  { id: "internet_exchanges",  label: "Internet Exchange Points",   group: "energy",       sourceIds: ["cisa_kev"],             defaultVisible: false, color: "#40c4ff", description: "PeeringDB major IXP locations" },
];
