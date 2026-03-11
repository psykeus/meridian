import { Page } from "@playwright/test";

/** Intercept API calls so E2E tests run without a live backend. */
export async function mockApiRoutes(page: Page) {
  const sampleEvents = [
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
  ];

  const feedHealth = {
    usgs_earthquakes: { name: "USGS Earthquake Catalog", status: "healthy", last_success: "2024-06-01T12:00:00Z", last_error: null, fetch_count: 10, error_count: 0, avg_latency_ms: 320 },
    nasa_firms:       { name: "NASA FIRMS Active Fires",  status: "healthy", last_success: "2024-06-01T11:00:00Z", last_error: null, fetch_count: 8,  error_count: 0, avg_latency_ms: 450 },
    gdacs:            { name: "GDACS Global Disasters",   status: "stale",   last_success: "2024-06-01T06:00:00Z", last_error: null, fetch_count: 5,  error_count: 1, avg_latency_ms: 800 },
    fema:             { name: "FEMA Declarations",        status: "error",   last_success: null,                   last_error: "timeout", fetch_count: 2, error_count: 3, avg_latency_ms: null },
  };

  await page.route("**/api/v1/events**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sampleEvents) })
  );

  await page.route("**/api/v1/feeds/health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(feedHealth) })
  );

  await page.route("**/api/v1/feeds/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(
      Object.entries(feedHealth).map(([id, h]) => ({
        source_id: id, display_name: h.name, status: h.status, refresh_interval_seconds: 300,
        last_fetched: h.last_success, last_success: h.last_success, last_error: h.last_error,
      }))
    )})
  );

  await page.route("**/ws/events", (route) => route.abort());
}
