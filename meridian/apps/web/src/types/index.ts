export type FeedCategory =
  | "environment"
  | "military"
  | "aviation"
  | "maritime"
  | "cyber"
  | "finance"
  | "geopolitical"
  | "humanitarian"
  | "nuclear"
  | "space"
  | "social"
  | "energy";

export type SeverityLevel = "info" | "low" | "medium" | "high" | "critical";

export interface GeoEvent {
  id: string;
  source_id: string;
  category: FeedCategory;
  subcategory?: string;
  title: string;
  body?: string;
  severity: SeverityLevel;
  lat: number;
  lng: number;
  metadata: Record<string, unknown>;
  url?: string;
  event_time: string;
  ingested_at?: string;
}

export interface WebSocketMessage {
  type: "geo_event";
  source_id: string;
  category: FeedCategory;
  data: GeoEvent;
}

export interface FeedStatus {
  source_id: string;
  display_name: string;
  category: FeedCategory;
  refresh_interval_seconds: number;
  status: "healthy" | "stale" | "error" | "disabled";
  last_fetched: string | null;
  last_success: string | null;
  last_error: string | null;
}

export type MapStyle =
  | "carto-dark"
  | "carto-light"
  | "satellite"
  | "terrain"
  | "openfreemap";

export interface LayerConfig {
  id: string;
  label: string;
  category: FeedCategory;
  enabled: boolean;
  opacity: number;
}

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  info: "#448aff",
  low: "#00e676",
  medium: "#ffeb3b",
  high: "#ff9800",
  critical: "#ff5252",
};

export const CATEGORY_LABELS: Record<FeedCategory, string> = {
  environment: "Environment",
  military: "Military",
  aviation: "Aviation",
  maritime: "Maritime",
  cyber: "Cyber",
  finance: "Finance",
  geopolitical: "Geopolitical",
  humanitarian: "Humanitarian",
  nuclear: "Nuclear",
  space: "Space",
  social: "Social",
  energy: "Energy",
};
