import { useMemo } from "react";
import { useEventStore } from "./useEventStore";

export function useFilteredEvents() {
  const events = useEventStore((s) => s.events);
  const filters = useEventStore((s) => s.filters);

  return useMemo(() => {
    const cutoff = new Date(Date.now() - filters.hoursBack * 3600 * 1000);
    return events.filter((e) => {
      if (new Date(e.event_time) < cutoff) return false;
      if (filters.categories.size > 0 && !filters.categories.has(e.category)) return false;
      if (filters.severities.size > 0 && !filters.severities.has(e.severity)) return false;
      return true;
    });
  }, [events, filters]);
}
