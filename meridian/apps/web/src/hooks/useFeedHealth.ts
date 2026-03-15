import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface FeedHealthEntry {
  name: string;
  status: "healthy" | "degraded" | "error" | "unknown";
  last_success?: string;
  last_error?: string;
  fetch_count: number;
  error_count: number;
  avg_latency_ms?: number;
  refresh_interval?: number;
}

/**
 * Shared hook for polling feed health data.
 * Auto-refreshes every `intervalMs` (default 30s).
 */
export function useFeedHealth(intervalMs = 30_000) {
  const [feeds, setFeeds] = useState<Record<string, FeedHealthEntry>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = useCallback(async () => {
    try {
      const resp = await apiFetch("/api/v1/feeds/health");
      if (resp.ok) {
        setFeeds(await resp.json());
        setLastRefresh(new Date());
      }
    } catch { /* API may be offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { feeds, loading, lastRefresh, refresh };
}
