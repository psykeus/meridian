import { ALL_LAYERS } from "./layers";
import type { LayerConfig, LayerGroup, RenderMode } from "./layers";

// ── Credential metadata for workers that require API keys ─────────────────
export interface EnvVar {
  key: string;
  label: string;
  secret?: boolean;
}

export interface CredentialMeta {
  envVars: EnvVar[];
  signupUrl: string;
  docsUrl?: string;
}

/** Map from layer ID → credential requirements. Layers not listed here are free/keyless. */
const CREDENTIAL_MAP: Record<string, CredentialMeta> = {
  civil_flights: {
    envVars: [
      { key: "OPENSKY_CLIENT_ID", label: "OAuth2 Client ID" },
      { key: "OPENSKY_CLIENT_SECRET", label: "OAuth2 Client Secret", secret: true },
    ],
    signupUrl: "https://opensky-network.org/",
    docsUrl: "https://openskynetwork.github.io/opensky-api/rest.html#authentication",
  },
  faa_notams: {
    envVars: [
      { key: "FAA_CLIENT_ID", label: "Client ID" },
      { key: "FAA_CLIENT_SECRET", label: "Client Secret", secret: true },
    ],
    signupUrl: "https://api.faa.gov/",
    docsUrl: "https://api.faa.gov/docs",
  },
  vessels: {
    envVars: [
      { key: "AISHUB_USERNAME", label: "Username" },
      { key: "AISHUB_PASSWORD", label: "Password", secret: true },
    ],
    signupUrl: "https://www.aishub.net/join",
    docsUrl: "https://www.aishub.net/api",
  },
  aisstream_vessels: {
    envVars: [
      { key: "AISSTREAM_API_KEY", label: "API Key", secret: true },
    ],
    signupUrl: "https://aisstream.io/authenticate",
    docsUrl: "https://aisstream.io/documentation",
  },
  armed_conflicts: {
    envVars: [
      { key: "ACLED_API_KEY", label: "API Key", secret: true },
      { key: "ACLED_EMAIL", label: "Registered Email" },
    ],
    signupUrl: "https://acleddata.com/register/",
    docsUrl: "https://apidocs.acleddata.com/",
  },
  airstrikes: {
    envVars: [
      { key: "ACLED_API_KEY", label: "API Key", secret: true },
      { key: "ACLED_EMAIL", label: "Registered Email" },
    ],
    signupUrl: "https://acleddata.com/register/",
    docsUrl: "https://apidocs.acleddata.com/",
  },
  sanctions: {
    envVars: [
      { key: "OPENSANCTIONS_API_KEY", label: "API Key", secret: true },
    ],
    signupUrl: "https://www.opensanctions.org/api/",
    docsUrl: "https://www.opensanctions.org/docs/api/",
  },
  wildfires: {
    envVars: [{ key: "NASA_API_KEY", label: "NASA API Key" }],
    signupUrl: "https://api.nasa.gov/",
    docsUrl: "https://firms.modaps.eosdis.nasa.gov/api/",
  },
  firms_hotspots: {
    envVars: [{ key: "NASA_API_KEY", label: "NASA API Key" }],
    signupUrl: "https://api.nasa.gov/",
    docsUrl: "https://firms.modaps.eosdis.nasa.gov/api/",
  },
  near_earth_objects: {
    envVars: [{ key: "NASA_API_KEY", label: "NASA API Key" }],
    signupUrl: "https://api.nasa.gov/",
  },
  nasa_donki: {
    envVars: [{ key: "NASA_API_KEY", label: "NASA API Key" }],
    signupUrl: "https://api.nasa.gov/",
  },
  cloudflare_radar: {
    envVars: [{ key: "CLOUDFLARE_API_TOKEN", label: "API Token", secret: true }],
    signupUrl: "https://dash.cloudflare.com/profile/api-tokens",
    docsUrl: "https://radar.cloudflare.com/api",
  },
  power_grid: {
    envVars: [{ key: "EIA_API_KEY", label: "API Key", secret: true }],
    signupUrl: "https://www.eia.gov/opendata/register.php",
    docsUrl: "https://www.eia.gov/opendata/",
  },
  crypto_markets: {
    envVars: [{ key: "COINGECKO_API_KEY", label: "API Key (Pro)", secret: true }],
    signupUrl: "https://www.coingecko.com/en/api",
  },
  finnhub_markets: {
    envVars: [{ key: "FINNHUB_API_KEY", label: "API Key", secret: true }],
    signupUrl: "https://finnhub.io/register",
    docsUrl: "https://finnhub.io/docs/api",
  },
  fred_economics: {
    envVars: [{ key: "FRED_API_KEY", label: "API Key" }],
    signupUrl: "https://fred.stlouisfed.org/docs/api/api_key.html",
  },
  spacetrack_catalog: {
    envVars: [
      { key: "SPACETRACK_USERNAME", label: "Username" },
      { key: "SPACETRACK_PASSWORD", label: "Password", secret: true },
    ],
    signupUrl: "https://www.space-track.org/auth/createAccount",
    docsUrl: "https://www.space-track.org/documentation",
  },
  malware_bazaar: {
    envVars: [{ key: "MALWAREBAZAAR_API_KEY", label: "API Key", secret: true }],
    signupUrl: "https://bazaar.abuse.ch/",
  },
  eu_energy: {
    envVars: [{ key: "ENTSOE_API_KEY", label: "ENTSO-E Security Token", secret: true }],
    signupUrl: "https://transparency.entsoe.eu/",
    docsUrl: "https://transparency.entsoe.eu/content/static_content/Static%20content/web%20api/Guide.html",
  },
  flightaware_flights: {
    envVars: [{ key: "FLIGHTAWARE_API_KEY", label: "AeroAPI Key", secret: true }],
    signupUrl: "https://www.flightaware.com/aeroapi/portal",
    docsUrl: "https://www.flightaware.com/aeroapi/portal/documentation",
  },
  alpha_vantage: {
    envVars: [{ key: "ALPHA_VANTAGE_API_KEY", label: "API Key", secret: true }],
    signupUrl: "https://www.alphavantage.co/support/#api-key",
  },
};

// Supplementary info not derivable from LayerConfig
const EXTRA_INFO: Record<string, { dataPoints?: string[]; refreshSec?: number; free?: boolean; configurableInterval?: { min: number; max: number; presets: { label: string; value: number }[] } }> = {
  earthquakes:        { dataPoints: ["Magnitude", "Depth (km)", "Alert level", "Tsunami flag", "Felt reports"], refreshSec: 60, free: true },
  earthquakes_emsc:   { dataPoints: ["Magnitude", "Depth", "Region", "Felt reports"], refreshSec: 300, free: true },
  wildfires:          { dataPoints: ["Brightness temp (K)", "Fire radiative power", "Confidence %"], refreshSec: 3600 },
  firms_hotspots:     { dataPoints: ["Hotspot location", "Brightness", "FRP", "Satellite"], refreshSec: 3600 },
  natural_events:     { dataPoints: ["Event type", "Category", "Sources", "Geometry"], refreshSec: 3600, free: true },
  volcanoes:          { dataPoints: ["Volcano name", "Alert level", "Last eruption"], refreshSec: 43200, free: true },
  hurricanes:         { dataPoints: ["Storm name", "Category", "Wind speed", "Pressure"], refreshSec: 3600, free: true },
  tornado_warnings:   { dataPoints: ["Warning type", "Severity", "Area", "Expires"], refreshSec: 300, free: true },
  floods:             { dataPoints: ["Event type", "Alert level", "River gauge", "Discharge"], refreshSec: 3600, free: true },
  tsunami_zones:      { dataPoints: ["Watch/Warning level", "Region", "Magnitude", "ETA"], refreshSec: 300, free: true },
  weather_radar:      { dataPoints: ["Precipitation overlay", "Timestamp", "Coverage"], refreshSec: 300, free: true },
  global_disasters:   { dataPoints: ["Event type", "Alert level", "Affected population", "Country"], refreshSec: 3600, free: true },
  copernicus_ems:     { dataPoints: ["Activation type", "Country", "Event", "Status"], refreshSec: 21600, free: true },
  air_quality:        { dataPoints: ["PM2.5", "PM10", "NO2", "O3", "Station"], refreshSec: 3600, free: true },
  armed_conflicts:    { dataPoints: ["Event type", "Actors", "Fatalities", "Country"], refreshSec: 3600 },
  airstrikes:         { dataPoints: ["Strike type", "Location", "Source"], refreshSec: 3600 },
  civil_unrest:       { dataPoints: ["Protest type", "Scale", "Location", "Source"], refreshSec: 3600 },
  gdelt_events:       { dataPoints: ["CAMEO code", "Actors", "Tone score", "Goldstein scale"], refreshSec: 900, free: true },
  rss_news:           { dataPoints: ["Headline", "Source", "Category", "Published"], refreshSec: 900, free: true },
  telegram_osint:     { dataPoints: ["Channel", "Message", "Media", "Timestamp"], refreshSec: 300, free: true },
  sanctions:          { dataPoints: ["Entity name", "Regime", "Countries", "Listing date"], refreshSec: 86400 },
  travel_advisories:  { dataPoints: ["Country", "Level", "Advisory text", "Updated"], refreshSec: 86400, free: true },
  civil_flights:      { dataPoints: ["Call sign", "ICAO24", "Altitude", "Speed", "Squawk"], refreshSec: 15 },
  flightaware_flights: {
    dataPoints: ["Ident", "Aircraft type", "Operator", "Origin", "Destination", "Altitude", "Speed"],
    refreshSec: 28800,
    configurableInterval: {
      min: 1800,     // 30 min
      max: 86400,    // 24h
      presets: [
        { label: "30min (~$7.20/mo)", value: 1800 },
        { label: "1hr (~$3.60/mo)", value: 3600 },
        { label: "2hr (~$1.80/mo)", value: 7200 },
        { label: "4hr (~$0.90/mo)", value: 14400 },
        { label: "8hr (~$0.45/mo)", value: 28800 },
        { label: "12hr (~$0.30/mo)", value: 43200 },
        { label: "24hr (~$0.15/mo)", value: 86400 },
      ],
    },
  },
  military_aircraft:  { dataPoints: ["Call sign", "Type", "Altitude", "Route", "OSINT tags"], refreshSec: 30, free: true },
  emergency_squawks:  { dataPoints: ["Squawk code", "Call sign", "Aircraft type", "Position"], refreshSec: 30, free: true },
  faa_notams:         { dataPoints: ["TFR boundaries", "Altitude", "Effective times", "Type"], refreshSec: 3600 },
  vessels:            { dataPoints: ["MMSI", "Vessel name", "Type", "Destination", "Speed"], refreshSec: 60 },
  aisstream_vessels:  { dataPoints: ["MMSI", "Vessel name", "IMO", "Call sign", "Ship type", "Destination", "SOG", "COG", "Heading", "Nav status"], refreshSec: 10 },
  chokepoints:        { dataPoints: ["Chokepoint name", "Traffic density", "Vessel types"], refreshSec: 60 },
  naval_vessels:      { dataPoints: ["MMSI", "Vessel class", "Flag state", "Position"], refreshSec: 300, free: true },
  uscg_incidents:     { dataPoints: ["Incident type", "Location", "Status", "SAR ops"], refreshSec: 3600, free: true },
  disease_outbreaks:  { dataPoints: ["Disease", "Country", "Cases", "Deaths", "Status"], refreshSec: 21600, free: true },
  fema_disasters:     { dataPoints: ["Disaster number", "Type", "State", "Declaration date"], refreshSec: 86400, free: true },
  fema_ipaws:         { dataPoints: ["Alert type", "Severity", "Area", "Expires"], refreshSec: 300, free: true },
  acaps_crises:       { dataPoints: ["Crisis name", "Severity", "Country", "INFORM score"], refreshSec: 86400, free: true },
  unhcr_displacement: { dataPoints: ["Country", "Population type", "Count", "Year"], refreshSec: 86400, free: true },
  fews_famine:        { dataPoints: ["Region", "IPC phase", "Population affected"], refreshSec: 86400, free: true },
  promed_health:      { dataPoints: ["Disease", "Location", "Source", "Date"], refreshSec: 21600, free: true },
  reliefweb_crises:   { dataPoints: ["Disaster type", "Country", "Organization", "Phase"], refreshSec: 3600, free: true },
  reddit_osint:       { dataPoints: ["Subreddit", "Title", "Score", "Comments"], refreshSec: 900, free: true },
  cisa_vulnerabilities: { dataPoints: ["CVE ID", "Vendor", "Product", "Date added"], refreshSec: 3600, free: true },
  cisa_advisories:    { dataPoints: ["Advisory ID", "Title", "Severity", "Published"], refreshSec: 3600, free: true },
  cve_feed:           { dataPoints: ["CVE ID", "CVSS score", "Severity", "Product"], refreshSec: 3600, free: true },
  osv_vulns:          { dataPoints: ["Package", "Ecosystem", "Severity", "Summary"], refreshSec: 3600, free: true },
  otx_threats:        { dataPoints: ["Pulse name", "IOC type", "TLP", "Tags"], refreshSec: 3600, free: true },
  malware_bazaar:     { dataPoints: ["SHA256", "File type", "Signature", "Tags"], refreshSec: 3600 },
  internet_censorship: { dataPoints: ["Country", "Test type", "Anomaly", "Confirmed"], refreshSec: 3600, free: true },
  cloudflare_radar:   { dataPoints: ["Country", "AS number", "Traffic drop %", "Duration"], refreshSec: 900 },
  bgp_hijacks:        { dataPoints: ["Prefix", "Origin AS", "Visibility", "Type"], refreshSec: 900, free: true },
  ioda_outages:       { dataPoints: ["Country", "Signal type", "Score", "Duration"], refreshSec: 900, free: true },
  iss:                { dataPoints: ["Latitude", "Longitude", "Crew count", "Altitude"], refreshSec: 5, free: true },
  space_weather:      { dataPoints: ["Kp index", "Solar wind", "Geomagnetic storm level"], refreshSec: 900, free: true },
  near_earth_objects: { dataPoints: ["Name", "Diameter (km)", "Miss distance", "Hazardous flag"], refreshSec: 86400 },
  space_launches:     { dataPoints: ["Mission", "Rocket", "Pad", "Status", "Window"], refreshSec: 3600, free: true },
  nasa_donki:         { dataPoints: ["CME speed", "Flare class", "Storm Kp", "Impact time"], refreshSec: 3600 },
  celestrak_sats:     { dataPoints: ["Satellite name", "NORAD ID", "Inclination", "Period"], refreshSec: 14400, free: true },
  starlink_constellation: { dataPoints: ["Satellite count", "Orbital plane", "Position"], refreshSec: 14400, free: true },
  gps_constellation:  { dataPoints: ["PRN", "Block", "Position", "Health"], refreshSec: 43200, free: true },
  spacetrack_catalog: { dataPoints: ["NORAD ID", "Object type", "RCS", "Orbit"], refreshSec: 86400 },
  power_grid:         { dataPoints: ["Demand (MWh)", "Generation mix", "Region"], refreshSec: 3600 },
  eu_energy:          { dataPoints: ["Load", "Generation", "Cross-border flow"], refreshSec: 3600 },
  baker_hughes:       { dataPoints: ["Active rigs", "Country", "Basin", "Change"], refreshSec: 604800, free: true },
  power_outages:      { dataPoints: ["State", "Customers out", "Utility", "Trend"], refreshSec: 900, free: true },
  crypto_markets:     { dataPoints: ["Price", "24h change %", "Market cap", "Volume"], refreshSec: 300 },
  finnhub_markets:    { dataPoints: ["Symbol", "Price", "Change %", "Volume"], refreshSec: 300 },
  fred_economics:     { dataPoints: ["Indicator", "Value", "Date", "Frequency"], refreshSec: 86400 },
  nuclear_reactors:   { dataPoints: ["Reactor name", "Country", "Status", "Type", "MWe"], refreshSec: 86400, free: true },
  radiation_monitoring: { dataPoints: ["CPM/µSv/h", "Station", "Country", "Level"], refreshSec: 3600, free: true },
  nrc_events:         { dataPoints: ["Event number", "Facility", "Type", "Date"], refreshSec: 3600, free: true },
};

// ── Map group → settings category ─────────────────────────────────────────
const GROUP_TO_CATEGORY: Record<LayerGroup, string> = {
  satellite_imagery: "Satellite Imagery",
  environment: "Environment",
  security: "Security",
  aviation: "Aviation",
  maritime: "Maritime",
  military: "Military",
  humanitarian: "Humanitarian",
  cyber: "Cyber",
  space: "Space",
  energy: "Energy",
  infrastructure: "Infrastructure",
};

// ── Unified data source entry ─────────────────────────────────────────────
export interface IntervalPreset {
  label: string;
  value: number;
}

export interface ConfigurableInterval {
  min: number;
  max: number;
  presets: IntervalPreset[];
}

export interface DataSourceConfig {
  id: string;
  name: string;
  icon: string;
  category: string;
  group: LayerGroup;
  description: string;
  dataPoints: string[];
  envVars: EnvVar[];
  signupUrl: string;
  docsUrl?: string;
  free: boolean;
  refreshSec: number;
  sourceIds: string[];
  renderMode: RenderMode;
  minZoom: number;
  maxZoom: number;
  configurableInterval?: ConfigurableInterval;
}

/** Generate the full data source list from ALL_LAYERS. */
function buildDataSources(): DataSourceConfig[] {
  return ALL_LAYERS.map((layer: LayerConfig) => {
    const creds = CREDENTIAL_MAP[layer.id];
    const extra = EXTRA_INFO[layer.id];
    const rm = layer.renderMode ?? "points";

    return {
      id: layer.id,
      name: layer.label,
      icon: layer.icon,
      category: GROUP_TO_CATEGORY[layer.group] ?? layer.group,
      group: layer.group,
      description: layer.description ?? "",
      dataPoints: extra?.dataPoints ?? (rm === "geojson" ? ["GeoJSON features", "Geometry", "Properties"] : rm === "tiles" ? ["Raster tiles", "Satellite imagery"] : []),
      envVars: creds?.envVars ?? [],
      signupUrl: creds?.signupUrl ?? "",
      docsUrl: creds?.docsUrl,
      free: extra?.free ?? (creds?.envVars.length ? false : true),
      refreshSec: extra?.refreshSec ?? (rm === "geojson" || rm === "tiles" ? 0 : 3600),
      sourceIds: layer.sourceIds,
      renderMode: rm,
      minZoom: layer.minZoom ?? 0,
      maxZoom: layer.maxZoom ?? 24,
      configurableInterval: extra?.configurableInterval,
    };
  });
}

export const DATA_SOURCES: DataSourceConfig[] = buildDataSources();

export const DATA_SOURCE_BY_ID = Object.fromEntries(DATA_SOURCES.map((s) => [s.id, s]));
export const SOURCE_TO_DATASOURCE = new Map<string, DataSourceConfig>();
DATA_SOURCES.forEach((ds) => ds.sourceIds.forEach((sid) => SOURCE_TO_DATASOURCE.set(sid, ds)));
