import { Page } from "@playwright/test";

/** Sample events used across all E2E tests. */
export const sampleEvents = [
  {
    id: "usgs_ci12345",
    source_id: "usgs_earthquakes",
    category: "environment",
    subcategory: "earthquake",
    title: "M5.5 — 10km NE of Test City, CA",
    body: null,
    severity: "medium",
    lat: 34.052,
    lng: -118.243,
    metadata: { magnitude: 5.5 },
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/ci12345",
    event_time: "2024-06-01T12:00:00Z",
    ingested_at: "2024-06-01T12:00:05Z",
  },
  {
    id: "gdacs_001",
    source_id: "gdacs",
    category: "environment",
    subcategory: "flood",
    title: "GDACS: Flood Alert — Bangladesh",
    body: "Severe flooding reported.",
    severity: "high",
    lat: 23.7,
    lng: 90.4,
    metadata: {},
    url: null,
    event_time: "2024-06-01T08:00:00Z",
    ingested_at: "2024-06-01T08:01:00Z",
  },
  {
    id: "acled_123",
    source_id: "acled_conflicts",
    category: "geopolitical",
    subcategory: "battle",
    title: "Armed Clash — Eastern Ukraine",
    body: "Clashes reported near Donetsk",
    severity: "critical",
    lat: 48.0,
    lng: 37.8,
    metadata: {},
    url: null,
    event_time: "2024-06-01T10:00:00Z",
    ingested_at: "2024-06-01T10:01:00Z",
  },
  {
    id: "cisa_kev_001",
    source_id: "cisa_kev",
    category: "cyber",
    subcategory: "vulnerability",
    title: "CVE-2024-1234 — Critical RCE in Apache",
    body: "Remote code execution vulnerability",
    severity: "critical",
    lat: 38.9,
    lng: -77.0,
    metadata: { cve_id: "CVE-2024-1234" },
    url: null,
    event_time: "2024-06-01T09:00:00Z",
    ingested_at: "2024-06-01T09:01:00Z",
  },
];

export const feedHealth: Record<string, unknown> = {
  usgs_earthquakes: { name: "USGS Earthquake Catalog", status: "healthy", last_success: "2024-06-01T12:00:00Z", last_error: null, fetch_count: 10, error_count: 0, avg_latency_ms: 320 },
  nasa_firms:       { name: "NASA FIRMS Active Fires",  status: "healthy", last_success: "2024-06-01T11:00:00Z", last_error: null, fetch_count: 8,  error_count: 0, avg_latency_ms: 450 },
  gdacs:            { name: "GDACS Global Disasters",   status: "stale",   last_success: "2024-06-01T06:00:00Z", last_error: null, fetch_count: 5,  error_count: 1, avg_latency_ms: 800 },
  fema:             { name: "FEMA Declarations",        status: "error",   last_success: null,                   last_error: "timeout", fetch_count: 2, error_count: 3, avg_latency_ms: null },
};

const sampleRules = [
  {
    id: 1, name: "Military Alert", description: "Fires on military events",
    is_active: true, condition_type: "category", condition_params: { category: "military" },
    delivery_channels: ["in_app"], webhook_url: null, email_to: null,
    trigger_count: 5, last_triggered: "2024-06-01T10:00:00Z", created_at: "2024-05-01T00:00:00Z",
  },
];

const sampleNotifications = [
  {
    id: 1, rule_id: 1, title: "Military event detected", body: "Armed clash in Eastern Ukraine",
    severity: "high", source_event_id: "acled_123", is_read: false, created_at: "2024-06-01T10:00:00Z",
  },
  {
    id: 2, rule_id: 1, title: "Previous alert", body: "Event cleared",
    severity: "medium", source_event_id: null, is_read: true, created_at: "2024-05-31T10:00:00Z",
  },
];

const samplePlanRooms = [
  {
    id: 1, owner_id: 1, name: "Ukraine Ops", description: "Monitoring Eastern Ukraine",
    aoi_bbox: null, aoi_countries: ["UA"], is_archived: false,
    created_at: "2024-05-01T00:00:00Z", updated_at: "2024-06-01T00:00:00Z",
  },
];

const sampleTasks = [
  { id: 1, plan_room_id: 1, created_by: 1, assigned_to: null, title: "Monitor troop movements", notes: null, status: "to_monitor", priority: "high", created_at: "2024-06-01T00:00:00Z", updated_at: "2024-06-01T00:00:00Z" },
  { id: 2, plan_room_id: 1, created_by: 1, assigned_to: null, title: "Update daily brief", notes: null, status: "active_watch", priority: "medium", created_at: "2024-06-01T00:00:00Z", updated_at: "2024-06-01T00:00:00Z" },
];

const sampleTimeline = [
  { id: 1, plan_room_id: 1, created_by: 1, is_auto: false, title: "Situation escalated", body: "New clashes reported", source_label: null, entry_time: "2024-06-01T10:00:00Z", created_at: "2024-06-01T10:00:00Z" },
];

const sampleAnnotations = [
  { id: 1, plan_room_id: 1, created_by: 1, annotation_type: "poi", label: "HQ", notes: "Command post", color: "#00ff00", geom_json: { type: "Point", coordinates: [37.8, 48.0] }, is_locked: false, created_at: "2024-06-01T00:00:00Z" },
];

const sampleMembers = [
  { user_id: 1, role: "owner", joined_at: "2024-05-01T00:00:00Z" },
];

const sampleAnomalies = [
  { type: "volume_spike", category: "geopolitical", severity: "high", description: "3x event volume spike in Eastern Europe", z_score: 3.2, detected_at: "2024-06-01T10:00:00Z" },
];

/** Intercept API calls so E2E tests run without a live backend. */
export async function mockApiRoutes(page: Page) {
  // Auth — mock login/register so tests never hit a real backend
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "test-token", refresh_token: "test-refresh" }) })
  );
  await page.route("**/api/v1/auth/register", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "test-token", refresh_token: "test-refresh" }) })
  );

  // Inject token into localStorage so RequireAuth passes
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("refresh_token", "test-refresh");
  });

  // Events
  await page.route("**/api/v1/events**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sampleEvents) })
  );

  // Feed health
  await page.route("**/api/v1/feeds/health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(feedHealth) })
  );

  await page.route("**/api/v1/feeds/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(
      Object.entries(feedHealth).map(([id, h]: [string, any]) => ({
        source_id: id, display_name: h.name, status: h.status, refresh_interval_seconds: 300,
        last_fetched: h.last_success, last_success: h.last_success, last_error: h.last_error,
      }))
    )})
  );

  // Alert rules
  await page.route("**/api/v1/alerts/rules", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 99, ...JSON.parse(route.request().postData() || "{}"), is_active: true, trigger_count: 0, last_triggered: null, created_at: new Date().toISOString() }) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sampleRules) });
    }
  });

  await page.route("**/api/v1/alerts/rules/*/toggle", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...sampleRules[0], is_active: false }) })
  );

  // Notifications
  await page.route("**/api/v1/alerts/notifications/unread-count", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1 }) })
  );

  await page.route("**/api/v1/alerts/notifications/read-all", (route) =>
    route.fulfill({ status: 204 })
  );

  await page.route("**/api/v1/alerts/notifications**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sampleNotifications) })
  );

  // Plan rooms
  await page.route("**/api/v1/plan-rooms/*/tasks", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 99, ...JSON.parse(route.request().postData() || "{}"), status: "to_monitor", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sampleTasks) });
    }
  });

  await page.route("**/api/v1/plan-rooms/*/timeline**", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 99, title: "New entry", created_at: new Date().toISOString() }) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sampleTimeline) });
    }
  });

  await page.route("**/api/v1/plan-rooms/*/annotations**", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 99, annotation_type: "poi", label: "Test", color: "#ff0000", created_at: new Date().toISOString() }) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sampleAnnotations) });
    }
  });

  await page.route("**/api/v1/plan-rooms/*/intel**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );

  await page.route("**/api/v1/plan-rooms/*/members**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sampleMembers) })
  );

  await page.route("**/api/v1/plan-rooms/*/watch-list**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );

  await page.route("**/api/v1/plan-rooms/*/export/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exported_at: new Date().toISOString(), room: samplePlanRooms[0], annotations: [], timeline: [], tasks: [], watch_list: [], intel_notes: [] }) })
  );

  await page.route("**/api/v1/plan-rooms/*/share**", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 1, token: "abc123", label: "Shared", is_active: true, created_at: new Date().toISOString() }) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
  });

  // Plan rooms list (must come after more specific plan-room routes)
  await page.route("**/api/v1/plan-rooms", (route) => {
    if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 99, owner_id: 1, ...body, is_archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(samplePlanRooms) });
    }
  });

  // AI endpoints
  await page.route("**/ai/anomalies", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sampleAnomalies) })
  );

  await page.route("**/ai/risk-scores", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { country: "Ukraine", score: 92, raw_score: 450, event_count: 120, tier: "critical" },
      { country: "Myanmar", score: 78, raw_score: 320, event_count: 85, tier: "high" },
      { country: "Sudan", score: 71, raw_score: 280, event_count: 70, tier: "high" },
    ]) })
  );

  await page.route("**/ai/brief/daily", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      date: "2024-06-01", generated_at: "2024-06-01T06:00:00Z",
      executive_summary: "Global tensions remain elevated with ongoing conflicts in Eastern Europe and the Sahel.",
      category_summaries: { geopolitical: "Continued fighting in Ukraine.", military: "Military movements detected.", environment: "Earthquake swarm in California." },
      event_counts: { geopolitical: 50, military: 30, environment: 20 },
    }) })
  );

  await page.route("**/ai/report", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      topic: "test", region: null, generated_at: new Date().toISOString(),
      report: "## Executive Summary\nTest report content.\n## Situation Overview\nDetailed analysis.",
      event_count: 10,
    }) })
  );

  await page.route("**/ai/chat", (route) =>
    route.fulfill({ status: 200, contentType: "text/event-stream", body: "data: {\"content\":\"Analysis complete.\"}\n\ndata: [DONE]\n\n" })
  );

  await page.route("**/ai/examples", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["What are the current threats?", "Military activity near Taiwan"]) })
  );

  // Credentials
  await page.route("**/api/v1/credentials", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: ["OPENSKY_USERNAME"] }) })
  );

  // Tokens
  await page.route("**/api/v1/tokens**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );

  // Orgs
  await page.route("**/api/v1/orgs**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );

  // WebSocket — abort (no live backend; now requires ?token= param)
  await page.route("**/ws/events**", (route) => route.abort());
}

/** Filter out expected non-critical console errors. */
export function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("WebSocket") &&
      !e.includes("net::ERR") &&
      !e.includes("Failed to fetch") &&
      !e.includes("getSnapshot") &&
      !e.includes("migrate")
  );
}
