import { create } from "zustand";
import type { GeoEvent } from "@/types";

interface ReplayStore {
  mode: "live" | "replay";
  startTime: Date | null;
  endTime: Date | null;
  replayEvents: GeoEvent[];
  isLoading: boolean;
  error: string | null;

  fetchReplay: (start: Date, end: Date) => Promise<void>;
  setLive: () => void;
}

export const useReplayStore = create<ReplayStore>((set) => ({
  mode: "live",
  startTime: null,
  endTime: null,
  replayEvents: [],
  isLoading: false,
  error: null,

  fetchReplay: async (start, end) => {
    set({ isLoading: true, error: null, mode: "replay", startTime: start, endTime: end });
    try {
      const params = new URLSearchParams({
        start_time: start.toISOString(),
        end_time:   end.toISOString(),
        limit:      "2000",
      });
      const resp = await fetch(`/api/v1/events/replay?${params}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: GeoEvent[] = await resp.json();
      set({ replayEvents: Array.isArray(data) ? data : [], isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err), replayEvents: [] });
    }
  },

  setLive: () =>
    set({ mode: "live", startTime: null, endTime: null, replayEvents: [], isLoading: false, error: null }),
}));
