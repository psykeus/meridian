export type RenderMode = "points" | "geojson" | "tiles";
export type GeojsonLayerType = "line" | "fill" | "circle";

export interface LayerConfig {
  id: string;
  label: string;
  group: LayerGroup;
  sourceIds: string[];
  defaultVisible: boolean;
  color: string;
  icon: string;
  description?: string;
  minZoom?: number;        // layer visible at/above this zoom (default 0)
  maxZoom?: number;        // layer hidden above this zoom (default 24)
  renderMode?: RenderMode; // default "points"
  geojsonUrl?: string;     // for renderMode "geojson"
  geojsonType?: GeojsonLayerType; // MapLibre layer type for geojson
  tileUrl?: string;        // for renderMode "tiles"
  lineWidth?: number;      // for geojson line layers
  fillOpacity?: number;    // for geojson fill layers
  circleRadius?: number;   // for geojson circle layers
  supportsTrack?: boolean; // layer supports orbital tracks or breadcrumb trails
}

export type LayerGroup =
  | "satellite_imagery"
  | "environment"
  | "security"
  | "aviation"
  | "maritime"
  | "military"
  | "humanitarian"
  | "cyber"
  | "space"
  | "energy"
  | "infrastructure";

export const LAYER_GROUPS: Record<LayerGroup, { label: string; icon: string }> = {
  satellite_imagery: { label: "Satellite Imagery",          icon: "🛰" },
  environment:       { label: "Environment & Hazards",      icon: "🌍" },
  security:          { label: "Security & Geopolitical",    icon: "⚔"  },
  aviation:          { label: "Aviation & Airspace",        icon: "✈"  },
  maritime:          { label: "Maritime & Trade",           icon: "⚓"  },
  military:          { label: "Military & Defense",         icon: "◈"  },
  humanitarian:      { label: "Humanitarian & Crisis",      icon: "♡"  },
  cyber:             { label: "Cyber & Internet",           icon: "🔒" },
  space:             { label: "Space & Satellites",         icon: "🚀" },
  energy:            { label: "Energy & Resources",         icon: "⚡"  },
  infrastructure:    { label: "Infrastructure",             icon: "⚙"  },
};

export const ALL_LAYERS: LayerConfig[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // SATELLITE IMAGERY (tile overlays)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "nasa-gibs-truecolor",
    label: "MODIS True Color (Terra)",
    group: "satellite_imagery",
    sourceIds: [],
    defaultVisible: false,
    color: "#4fc3f7",
    icon: "🌐",
    description: "NASA GIBS daily true-color satellite composite",
    renderMode: "tiles",
    tileUrl: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
    minZoom: 1,
    maxZoom: 9,
  },
  {
    id: "nasa-gibs-nightlights",
    label: "VIIRS Night Lights",
    group: "satellite_imagery",
    sourceIds: [],
    defaultVisible: false,
    color: "#ffd740",
    icon: "🌙",
    description: "VIIRS day/night band at-sensor radiance",
    renderMode: "tiles",
    tileUrl: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
    minZoom: 1,
    maxZoom: 8,
  },
  {
    id: "nasa-gibs-fires",
    label: "MODIS Fire & Thermal",
    group: "satellite_imagery",
    sourceIds: [],
    defaultVisible: false,
    color: "#ff5252",
    icon: "🔥",
    description: "MODIS thermal anomaly / fire detection overlay",
    renderMode: "tiles",
    tileUrl: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Thermal_Anomalies_Day/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png",
    minZoom: 1,
    maxZoom: 7,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT & HAZARDS
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "earthquakes",         label: "Earthquakes (USGS)",          group: "environment",  sourceIds: ["usgs_earthquakes"],                icon: "🌋", defaultVisible: true,  color: "#ff9800", description: "USGS events sized by magnitude" },
  { id: "earthquakes_emsc",    label: "Earthquakes (EMSC)",          group: "environment",  sourceIds: ["emsc_earthquakes"],                icon: "🌍", defaultVisible: true,  color: "#e65100", description: "European-Mediterranean seismic events" },
  { id: "wildfires",           label: "Active Fires (FIRMS)",        group: "environment",  sourceIds: ["nasa_firms"],                      icon: "🔥", defaultVisible: true,  color: "#ff5252", description: "NASA FIRMS VIIRS active fire detections" },
  { id: "firms_hotspots",      label: "FIRMS Hotspots (Global)",     group: "environment",  sourceIds: ["firms_active_fires"],              icon: "🔥", defaultVisible: false, color: "#ff1744", description: "NASA FIRMS global thermal hotspots" },
  { id: "natural_events",      label: "NASA Natural Events",         group: "environment",  sourceIds: ["nasa_eonet"],                      icon: "🌎", defaultVisible: true,  color: "#4caf50", description: "NASA EONET natural events (storms, fires, volcanoes)" },
  { id: "volcanoes",           label: "Volcano Alerts",              group: "environment",  sourceIds: ["volcano_discovery"],               icon: "⛰",  defaultVisible: false, color: "#ff6d00", description: "GVP current alert levels" },
  { id: "hurricanes",          label: "Hurricane / Cyclone Tracks",  group: "environment",  sourceIds: ["noaa_nhc"],                        icon: "🌀", defaultVisible: false, color: "#00bcd4", description: "NOAA NHC active tropical systems" },
  { id: "tornado_warnings",    label: "Tornado & Storm Warnings",    group: "environment",  sourceIds: ["noaa_weather_alerts"],             icon: "🌪",  defaultVisible: false, color: "#ffeb3b", description: "NWS tornado and severe storm alerts" },
  { id: "floods",              label: "Floods & River Gauges",       group: "environment",  sourceIds: ["gdacs", "usgs_water"],             icon: "💧", defaultVisible: false, color: "#448aff", description: "GDACS flood events + USGS river gauges" },
  { id: "tsunami_zones",       label: "Tsunami Warnings",            group: "environment",  sourceIds: ["tsunami_warnings"],                icon: "🌊", defaultVisible: true,  color: "#00bcd4", description: "Active tsunami watches and warnings" },
  { id: "weather_radar",       label: "Weather Radar",               group: "environment",  sourceIds: ["rainviewer_radar"],                icon: "🌧",  defaultVisible: false, color: "#80cbc4", description: "RainViewer global precipitation radar" },
  { id: "global_disasters",    label: "Global Disasters",            group: "environment",  sourceIds: ["gdacs"],                           icon: "⚠",  defaultVisible: true,  color: "#ffa726", description: "GDACS composite disaster events" },
  { id: "copernicus_ems",      label: "Copernicus EMS",              group: "environment",  sourceIds: ["copernicus_ems"],                  icon: "🇪🇺", defaultVisible: false, color: "#2196f3", description: "Copernicus Emergency Management activations" },
  { id: "air_quality",         label: "Air Quality",                 group: "environment",  sourceIds: ["openaq"],                          icon: "💨", defaultVisible: false, color: "#78909c", description: "OpenAQ air quality monitoring stations" },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & GEOPOLITICAL
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "armed_conflicts",     label: "Armed Conflicts",             group: "security",     sourceIds: ["acled_conflicts", "acled"],        icon: "⚔",  defaultVisible: true,  color: "#ff5252", description: "ACLED conflict events" },
  { id: "terrorism",           label: "Terrorism Incidents",          group: "security",     sourceIds: ["gtd_terrorism"],                   icon: "💣", defaultVisible: true,  color: "#d50000", description: "Global Terrorism Database incidents" },
  { id: "airstrikes",          label: "Airstrikes & Kinetic",        group: "security",     sourceIds: ["acled_conflicts", "acled", "gdelt"], icon: "💥", defaultVisible: false, color: "#f50057", description: "Filtered airstrike and kinetic events" },
  { id: "civil_unrest",        label: "Protests & Civil Unrest",     group: "security",     sourceIds: ["acled_conflicts", "acled", "gdelt"], icon: "✊", defaultVisible: false, color: "#ff6d00", description: "Active protests and unrest events" },
  { id: "gdelt_events",        label: "GDELT Political Events",      group: "security",     sourceIds: ["gdelt"],                           icon: "📡", defaultVisible: true,  color: "#7c4dff", description: "GDELT event index — political tone" },
  { id: "rss_news",            label: "RSS News Feed",               group: "security",     sourceIds: ["rss_news"],                        icon: "📰", defaultVisible: true,  color: "#42a5f5", description: "RSS-sourced geopolitical news events" },
  { id: "osint_rss",           label: "OSINT RSS Feeds",             group: "security",     sourceIds: ["osint_rss"],                       icon: "📡", defaultVisible: true,  color: "#26a69a", description: "Open-source intelligence RSS aggregator" },
  { id: "telegram_osint",      label: "Telegram OSINT",              group: "security",     sourceIds: ["telegram_osint"],                  icon: "📱", defaultVisible: false, color: "#26c6da", description: "OSINT from Telegram channels" },
  { id: "sanctions",           label: "Sanctions Entities",          group: "security",     sourceIds: ["open_sanctions"],                  icon: "🚫", defaultVisible: false, color: "#e53935", description: "OpenSanctions watchlist entities" },
  { id: "travel_advisories",   label: "US Travel Advisories",        group: "security",     sourceIds: ["us_travel_advisory"],              icon: "🛂", defaultVisible: false, color: "#ff9800", description: "US State Dept travel advisories" },

  // ═══════════════════════════════════════════════════════════════════════════
  // AVIATION & AIRSPACE
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "civil_flights",       label: "Live Civil Flights",          group: "aviation",     sourceIds: ["opensky"],                         icon: "✈",  defaultVisible: true,  color: "#29b6f6", description: "OpenSky ADS-B civil aircraft", supportsTrack: true },
  { id: "military_aircraft",   label: "Military Aircraft (ADS-B)",   group: "aviation",     sourceIds: ["adsb_lol"],                        icon: "🛡",  defaultVisible: true,  color: "#ff5252", description: "ADS-B Exchange military aircraft tracking", supportsTrack: true },
  { id: "emergency_squawks",   label: "Emergency Squawks",           group: "aviation",     sourceIds: ["emergency_squawks"],               icon: "🚨", defaultVisible: true,  color: "#ff1744", description: "Squawks 7700/7600/7500 — animated", supportsTrack: true },
  { id: "vip_aircraft",        label: "VIP / Government Aircraft",   group: "aviation",     sourceIds: ["vip_aircraft"],                    icon: "👑", defaultVisible: true,  color: "#ffd740", description: "Air Force One, Doomsday planes, heads of state", supportsTrack: true },
  { id: "bomber_isr",          label: "Bombers & ISR Aircraft",      group: "aviation",     sourceIds: ["bomber_isr"],                      icon: "🔍", defaultVisible: true,  color: "#ff6e40", description: "Strategic bombers, ISR, SIGINT, maritime patrol", supportsTrack: true },
  { id: "flightaware_flights",  label: "FlightAware Flights",         group: "aviation",     sourceIds: ["flightaware"],                     icon: "🛩", defaultVisible: false, color: "#1a73e8", description: "FlightAware AeroAPI enriched flight data", supportsTrack: true },
  { id: "faa_notams",          label: "FAA NOTAMs",                  group: "aviation",     sourceIds: ["faa_notam"],                       icon: "⛔", defaultVisible: false, color: "#ff9100", description: "FAA Notices to Air Missions" },
  {
    id: "airports_global",
    label: "Global Airports",
    group: "aviation",
    sourceIds: [],
    defaultVisible: false,
    color: "#90caf9",
    icon: "🛬",
    description: "Major international airports worldwide",
    renderMode: "geojson",
    geojsonUrl: "/geojson/global_airports.geojson",
    geojsonType: "circle",
    circleRadius: 4,
    minZoom: 4,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MARITIME & TRADE
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "vessels",             label: "Live Vessel Positions",       group: "maritime",     sourceIds: ["aishub"],                          icon: "🚢", defaultVisible: true,  color: "#448aff", description: "AISHub — all AIS-broadcasting vessels", supportsTrack: true },
  { id: "piracy",              label: "Piracy & Maritime Crime",     group: "maritime",     sourceIds: ["piracy_imb"],                      icon: "🏴‍☠️", defaultVisible: true,  color: "#ff1744", description: "IMB Piracy Reporting Centre incidents" },
  { id: "chokepoints",        label: "Shipping Chokepoints",        group: "maritime",     sourceIds: ["aishub"],                          icon: "🔑", defaultVisible: true,  color: "#ff6d00", description: "Hormuz, Suez, Malacca, Bab-el-Mandeb, Panama" },
  { id: "naval_vessels",       label: "Naval Vessel Tracking",       group: "maritime",     sourceIds: ["naval_mmsi"],                      icon: "⚓", defaultVisible: false, color: "#536dfe", description: "Known military vessel MMSI tracking", supportsTrack: true },
  { id: "aisstream_vessels",    label: "AIS Live Stream",             group: "maritime",     sourceIds: ["aisstream"],                       icon: "🚢", defaultVisible: false, color: "#00bfa5", description: "AISStream.io real-time vessel positions", supportsTrack: true },
  { id: "uscg_incidents",      label: "USCG Maritime Incidents",     group: "maritime",     sourceIds: ["uscg_maritime"],                   icon: "🚁", defaultVisible: false, color: "#ff6f00", description: "US Coast Guard incident reports" },
  {
    id: "trade_routes",
    label: "Global Shipping Lanes",
    group: "maritime",
    sourceIds: [],
    defaultVisible: false,
    color: "#448aff",
    icon: "🚢",
    description: "Major international shipping routes",
    renderMode: "geojson",
    geojsonUrl: "/geojson/trade_routes.geojson",
    geojsonType: "line",
    lineWidth: 1.5,
    minZoom: 1,
  },
  {
    id: "seaports_global",
    label: "Global Seaports",
    group: "maritime",
    sourceIds: [],
    defaultVisible: false,
    color: "#26c6da",
    icon: "⚓",
    description: "Major container and bulk seaports worldwide",
    renderMode: "geojson",
    geojsonUrl: "/geojson/global_seaports.geojson",
    geojsonType: "circle",
    circleRadius: 5,
    minZoom: 3,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MILITARY & DEFENSE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "military_bases",
    label: "Military Installations",
    group: "military",
    sourceIds: [],
    defaultVisible: false,
    color: "#546e7a",
    icon: "🏛",
    description: "Major military bases and installations globally",
    renderMode: "geojson",
    geojsonUrl: "/geojson/military_bases.geojson",
    geojsonType: "circle",
    circleRadius: 5,
    minZoom: 4,
  },
  {
    id: "embassies",
    label: "Embassies & Consulates",
    group: "military",
    sourceIds: [],
    defaultVisible: false,
    color: "#7e57c2",
    icon: "🏛",
    description: "Major diplomatic missions worldwide",
    renderMode: "geojson",
    geojsonUrl: "/geojson/embassies.geojson",
    geojsonType: "circle",
    circleRadius: 4,
    minZoom: 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HUMANITARIAN & CRISIS
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "disease_outbreaks",   label: "Disease Outbreaks",           group: "humanitarian", sourceIds: ["who_outbreaks"],                   icon: "🦠", defaultVisible: true,  color: "#ab47bc", description: "WHO active outbreak alerts" },
  { id: "fema_disasters",      label: "FEMA Disasters (US)",         group: "humanitarian", sourceIds: ["fema"],                            icon: "🏚",  defaultVisible: true,  color: "#ff9800", description: "Active FEMA disaster declarations" },
  { id: "fema_ipaws",          label: "FEMA IPAWS Alerts",           group: "humanitarian", sourceIds: ["fema_ipaws"],                      icon: "📢", defaultVisible: false, color: "#ff5722", description: "FEMA IPAWS public warnings" },
  { id: "acaps_crises",        label: "ACAPS Crisis Severity",       group: "humanitarian", sourceIds: ["acaps"],                           icon: "📋", defaultVisible: true,  color: "#e53935", description: "ACAPS INFORM humanitarian severity" },
  { id: "unhcr_displacement",  label: "UNHCR Displacement",          group: "humanitarian", sourceIds: ["unhcr_displacement"],              icon: "🏕", defaultVisible: false, color: "#ff8a65", description: "UNHCR refugee and IDP displacement data" },
  { id: "fews_famine",         label: "FEWS NET Famine Watch",       group: "humanitarian", sourceIds: ["fews_net"],                        icon: "🌾", defaultVisible: false, color: "#a1887f", description: "FEWS NET food security alerts" },
  { id: "promed_health",       label: "ProMED Health Alerts",        group: "humanitarian", sourceIds: ["promed_rss"],                      icon: "🏥", defaultVisible: false, color: "#ce93d8", description: "ProMED emerging disease reports" },
  { id: "reliefweb_crises",    label: "ReliefWeb Disasters",         group: "humanitarian", sourceIds: ["reliefweb"],                       icon: "🆘", defaultVisible: false, color: "#ef5350", description: "ReliefWeb humanitarian disaster reports" },
  { id: "reddit_osint",        label: "Reddit OSINT",                group: "humanitarian", sourceIds: ["reddit_osint"],                    icon: "🔍", defaultVisible: false, color: "#ff4500", description: "Reddit OSINT subreddit monitoring" },

  // ═══════════════════════════════════════════════════════════════════════════
  // CYBER & INTERNET
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "cisa_vulnerabilities",label: "CISA Known Exploited Vulns",  group: "cyber",        sourceIds: ["cisa_kev"],                        icon: "🔓", defaultVisible: false, color: "#ff5252", description: "CISA KEV catalog entries" },
  { id: "cisa_advisories",     label: "CISA Advisories",             group: "cyber",        sourceIds: ["cisa_advisories"],                 icon: "🛡",  defaultVisible: false, color: "#e53935", description: "CISA cybersecurity advisories" },
  { id: "cve_feed",            label: "CVE Vulnerabilities",         group: "cyber",        sourceIds: ["nvd_cve"],                         icon: "🐛", defaultVisible: false, color: "#e040fb", description: "NVD latest CVE entries" },
  { id: "osv_vulns",           label: "OSV Vulnerabilities",         group: "cyber",        sourceIds: ["osv_vulnerabilities"],             icon: "📦", defaultVisible: false, color: "#ba68c8", description: "OSV.dev open-source vulnerability feed" },
  { id: "otx_threats",         label: "OTX Threat Intel",            group: "cyber",        sourceIds: ["otx_pulse"],                       icon: "👁",  defaultVisible: false, color: "#7c4dff", description: "AlienVault OTX pulse threat intelligence" },
  { id: "malware_bazaar",      label: "MalwareBazaar Samples",       group: "cyber",        sourceIds: ["malwarebazaar"],                   icon: "🦠", defaultVisible: false, color: "#d50000", description: "Recent malware samples from MalwareBazaar" },
  { id: "internet_censorship", label: "Internet Censorship",         group: "cyber",        sourceIds: ["ooni"],                            icon: "🔒", defaultVisible: false, color: "#9c27b0", description: "OONI network interference data" },
  { id: "cloudflare_radar",    label: "Cloudflare Radar",            group: "cyber",        sourceIds: ["cloudflare_radar"],                icon: "☁",  defaultVisible: false, color: "#f48fb1", description: "Cloudflare Radar internet anomalies" },
  { id: "bgp_hijacks",         label: "BGP Route Anomalies",         group: "cyber",        sourceIds: ["ripe_bgp"],                        icon: "🌐", defaultVisible: false, color: "#00bcd4", description: "RIPE BGP routing anomalies" },
  { id: "ioda_outages",        label: "Internet Outages (IODA)",     group: "cyber",        sourceIds: ["ioda_outages"],                    icon: "📡", defaultVisible: false, color: "#ffab40", description: "IODA internet outage detection" },
  {
    id: "submarine_cables",
    label: "Submarine Cables",
    group: "cyber",
    sourceIds: [],
    defaultVisible: false,
    color: "#00bcd4",
    icon: "🔌",
    description: "Global submarine fiber optic cable routes",
    renderMode: "geojson",
    geojsonUrl: "/geojson/submarine_cables.geojson",
    geojsonType: "line",
    lineWidth: 1.5,
    minZoom: 2,
  },
  {
    id: "cable_landings",
    label: "Cable Landing Points",
    group: "cyber",
    sourceIds: [],
    defaultVisible: false,
    color: "#4dd0e1",
    icon: "📍",
    description: "Submarine cable landing stations",
    renderMode: "geojson",
    geojsonUrl: "/geojson/cable_landing_points.geojson",
    geojsonType: "circle",
    circleRadius: 4,
    minZoom: 4,
  },
  {
    id: "ixp_locations",
    label: "Internet Exchange Points",
    group: "cyber",
    sourceIds: [],
    defaultVisible: false,
    color: "#69f0ae",
    icon: "🏢",
    description: "Major Internet Exchange Points (DE-CIX, AMS-IX, etc.)",
    renderMode: "geojson",
    geojsonUrl: "/geojson/internet_exchange_points.geojson",
    geojsonType: "circle",
    circleRadius: 5,
    minZoom: 4,
  },
  {
    id: "data_centers",
    label: "Data Centers",
    group: "cyber",
    sourceIds: [],
    defaultVisible: false,
    color: "#82b1ff",
    icon: "🖥",
    description: "Major data center hubs worldwide",
    renderMode: "geojson",
    geojsonUrl: "/geojson/data_centers.geojson",
    geojsonType: "circle",
    circleRadius: 4,
    minZoom: 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SPACE & SATELLITES
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "iss",                 label: "ISS Position",                group: "space",        sourceIds: ["nasa_iss"],                        icon: "🛸", defaultVisible: true,  color: "#00e676", description: "Live International Space Station track", supportsTrack: true },
  { id: "space_weather",       label: "Space Weather",               group: "space",        sourceIds: ["noaa_space_weather"],              icon: "☀",  defaultVisible: true,  color: "#ffd740", description: "NOAA SWPC space weather alerts & storms" },
  { id: "near_earth_objects",  label: "Near-Earth Objects",          group: "space",        sourceIds: ["nasa_neo"],                        icon: "☄",  defaultVisible: false, color: "#b388ff", description: "NASA NEO close approaches" },
  { id: "space_launches",      label: "Space Launches",              group: "space",        sourceIds: ["space_devs"],                      icon: "🚀", defaultVisible: false, color: "#69f0ae", description: "Upcoming and recent space launches" },
  { id: "nasa_donki",          label: "NASA DONKI (CME/Flare/Storm)",group: "space",        sourceIds: ["nasa_donki"],                      icon: "🌞", defaultVisible: false, color: "#ff6e40", description: "NASA DONKI coronal mass ejections, solar flares, geomagnetic storms" },
  { id: "celestrak_sats",      label: "Notable Satellites",          group: "space",        sourceIds: ["celestrak_tle"],                   icon: "🛰", defaultVisible: true,  color: "#80deea", description: "CelesTrak notable satellite positions (ISS, Hubble, GOES, etc.)", supportsTrack: true },
  { id: "starlink_constellation", label: "Starlink Constellation",   group: "space",        sourceIds: ["starlink_tracker"],                icon: "📡", defaultVisible: true,  color: "#b0bec5", description: "Starlink satellite constellation positions", supportsTrack: true },
  { id: "gps_constellation",   label: "GPS Constellation",           group: "space",        sourceIds: ["gps_constellation"],               icon: "📍", defaultVisible: true,  color: "#a5d6a7", description: "GPS satellite constellation positions", supportsTrack: true },
  { id: "spacetrack_catalog",  label: "SpaceTrack Catalog",          group: "space",        sourceIds: ["spacetrack_satellites"],            icon: "🔭", defaultVisible: false, color: "#90caf9", description: "SpaceTrack space object catalog", supportsTrack: true },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENERGY & RESOURCES
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "power_grid",          label: "US Power Grid Status",        group: "energy",       sourceIds: ["eia_grid"],                        icon: "🔌", defaultVisible: false, color: "#ffd740", description: "EIA electricity grid status" },
  { id: "eu_energy",           label: "EU Energy (ENTSO-E)",         group: "energy",       sourceIds: ["entso_e"],                         icon: "⚡", defaultVisible: false, color: "#26c6da", description: "European electricity grid data" },
  { id: "baker_hughes",        label: "Baker Hughes Rig Count",      group: "energy",       sourceIds: ["baker_hughes"],                    icon: "🛢", defaultVisible: false, color: "#8d6e63", description: "Baker Hughes active rig count" },
  { id: "power_outages",       label: "Power Outages",               group: "energy",       sourceIds: ["power_outages"],                   icon: "💡", defaultVisible: false, color: "#ffca28", description: "Regional power outage reports" },
  { id: "crypto_markets",      label: "Crypto Markets",              group: "energy",       sourceIds: ["coingecko"],                       icon: "₿",  defaultVisible: true,  color: "#f7931a", description: "CoinGecko top crypto price alerts" },
  { id: "baltic_dry",           label: "Baltic Dry Index",             group: "energy",       sourceIds: ["baltic_dry"],                      icon: "🚢", defaultVisible: false, color: "#795548", description: "Baltic Dry shipping cost index" },
  { id: "finnhub_markets",     label: "Finnhub Markets",             group: "energy",       sourceIds: ["finnhub_markets"],                 icon: "📈", defaultVisible: false, color: "#4caf50", description: "Finnhub stock market events" },
  { id: "fred_economics",      label: "FRED Economic Data",          group: "energy",       sourceIds: ["fred_economics"],                  icon: "📊", defaultVisible: false, color: "#5c6bc0", description: "Federal Reserve economic indicators" },
  {
    id: "power_plants",
    label: "Power Plants (Global)",
    group: "energy",
    sourceIds: [],
    defaultVisible: false,
    color: "#ffb74d",
    icon: "⚡",
    description: "Global power plant locations by fuel type",
    renderMode: "geojson",
    geojsonUrl: "/geojson/power_plants.geojson",
    geojsonType: "circle",
    circleRadius: 4,
    minZoom: 4,
  },
  {
    id: "oil_gas_pipelines",
    label: "Oil & Gas Pipelines",
    group: "energy",
    sourceIds: [],
    defaultVisible: false,
    color: "#ff8a65",
    icon: "🛢",
    description: "Major oil and gas pipeline routes",
    renderMode: "geojson",
    geojsonUrl: "/geojson/oil_gas_pipelines.geojson",
    geojsonType: "line",
    lineWidth: 2,
    minZoom: 3,
  },
  {
    id: "lng_terminals",
    label: "LNG Terminals",
    group: "energy",
    sourceIds: [],
    defaultVisible: false,
    color: "#4db6ac",
    icon: "🏭",
    description: "LNG import and export terminals worldwide",
    renderMode: "geojson",
    geojsonUrl: "/geojson/lng_terminals.geojson",
    geojsonType: "circle",
    circleRadius: 5,
    minZoom: 4,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "nuclear_facilities",
    label: "Nuclear Facilities",
    group: "infrastructure",
    sourceIds: [],
    defaultVisible: false,
    color: "#66bb6a",
    icon: "☢",
    description: "Nuclear reactors, enrichment and research facilities",
    renderMode: "geojson",
    geojsonUrl: "/geojson/nuclear_facilities.geojson",
    geojsonType: "circle",
    circleRadius: 6,
    minZoom: 3,
  },
  { id: "nuclear_reactors",    label: "IAEA PRIS Reactors",          group: "infrastructure", sourceIds: ["iaea_pris", "iaea_news"],        icon: "🔋", defaultVisible: false, color: "#66bb6a", description: "IAEA PRIS reactor status + IAEA news" },
  { id: "radiation_monitoring",label: "Radiation Monitoring",        group: "infrastructure", sourceIds: ["eurdep", "safecast_radiation"],  icon: "⚛",  defaultVisible: false, color: "#ffee58", description: "EURDEP + Safecast radiation monitoring" },
  { id: "nrc_events",          label: "NRC Events (US Nuclear)",     group: "infrastructure", sourceIds: ["nrc_events"],                    icon: "☢",  defaultVisible: false, color: "#aed581", description: "US NRC nuclear event reports" },
];
