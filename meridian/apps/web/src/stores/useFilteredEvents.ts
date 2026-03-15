import { useMemo } from "react";
import { useEventStore } from "./useEventStore";
import { useReplayStore } from "./useReplayStore";

export function useFilteredEvents() {
  const liveEvents = useEventStore((s) => s.events);
  const filters    = useEventStore((s) => s.filters);

  const replayMode   = useReplayStore((s) => s.mode);
  const replayEvents = useReplayStore((s) => s.replayEvents);
  const cursorTime   = useReplayStore((s) => s.cursorTime);

  return useMemo(() => {
    if (replayMode === "replay") {
      if (cursorTime == null) return replayEvents;
      return replayEvents.filter(
        (e) => new Date(e.event_time).getTime() <= cursorTime,
      );
    }

    const cutoff = new Date(Date.now() - filters.hoursBack * 3600 * 1000);
    return liveEvents.filter((e) => {
      if (new Date(e.event_time) < cutoff) return false;
      if (filters.categories.size > 0 && !filters.categories.has(e.category)) return false;
      if (filters.severities.size > 0 && !filters.severities.has(e.severity)) return false;
      if (filters.sourceIds.size > 0 && !filters.sourceIds.has(e.source_id)) return false;
      return true;
    });
  }, [replayMode, replayEvents, liveEvents, filters, cursorTime]);
}
