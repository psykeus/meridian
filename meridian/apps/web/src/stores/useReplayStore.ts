import { create } from "zustand";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { GeoEvent } from "@/types";

const DENSITY_BINS = 200;
const SPEEDS = [1, 2, 5, 10, 50, 100] as const;

type PlaybackState = "idle" | "playing" | "paused" | "recording";

interface ReplayStore {
  // Existing
  mode: "live" | "replay";
  startTime: Date | null;
  endTime: Date | null;
  replayEvents: GeoEvent[];
  isLoading: boolean;
  error: string | null;
  gibsDate: string | null;

  // Playback engine
  playbackState: PlaybackState;
  cursorTime: number | null;       // ms timestamp of playhead
  speed: number;                    // 1, 2, 5, 10, 50, 100
  densityBuckets: number[];         // DENSITY_BINS bins for histogram
  densitySeverities: Array<Record<string, number>>; // severity breakdown per bucket

  // Event selection
  selectedEventIds: Set<string>;
  selectionMode: boolean;

  // Map instance reference (set by MeridianMap)
  mapInstance: MaplibreMap | null;

  // Actions
  play(): void;
  pause(): void;
  stop(): void;
  stepForward(): void;
  stepBack(): void;
  setCursorTime(ms: number): void;
  setSpeed(speed: number): void;
  toggleEventSelection(id: string): void;
  selectEventsInRange(startMs: number, endMs: number): void;
  clearSelection(): void;
  setSelectionMode(on: boolean): void;
  setMapInstance(map: MaplibreMap | null): void;

  // Existing
  fetchReplay(start: Date, end: Date): Promise<void>;
  setLive(): void;
  setGibsDate(date: string | null): void;
}

// RAF-based playback loop
let _rafId: number | null = null;
let _lastFrameTime: number | null = null;

function startPlaybackLoop() {
  stopPlaybackLoop();
  _lastFrameTime = performance.now();

  const tick = (now: number) => {
    const state = useReplayStore.getState();
    if (state.playbackState !== "playing" && state.playbackState !== "recording") {
      _rafId = null;
      _lastFrameTime = null;
      return;
    }

    const delta = now - (_lastFrameTime ?? now);
    _lastFrameTime = now;

    const { cursorTime, speed, endTime } = state;
    if (cursorTime == null || !endTime) {
      _rafId = null;
      return;
    }

    const newCursor = cursorTime + delta * speed;
    const endMs = endTime.getTime();

    if (newCursor >= endMs) {
      // Reached end
      useReplayStore.setState({
        cursorTime: endMs,
        playbackState: state.playbackState === "recording" ? "paused" : "paused",
      });
      _rafId = null;
      _lastFrameTime = null;
      return;
    }

    useReplayStore.setState({ cursorTime: newCursor });
    _rafId = requestAnimationFrame(tick);
  };

  _rafId = requestAnimationFrame(tick);
}

function stopPlaybackLoop() {
  if (_rafId != null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  _lastFrameTime = null;
}

function computeDensity(events: GeoEvent[], startMs: number, endMs: number) {
  const range = endMs - startMs;
  if (range <= 0) return { buckets: new Array(DENSITY_BINS).fill(0), severities: new Array(DENSITY_BINS).fill(null).map(() => ({})) };

  const buckets = new Array(DENSITY_BINS).fill(0);
  const severities: Array<Record<string, number>> = new Array(DENSITY_BINS).fill(null).map(() => ({}));
  const binWidth = range / DENSITY_BINS;

  for (const e of events) {
    const t = new Date(e.event_time).getTime();
    if (t < startMs || t > endMs) continue;
    const bin = Math.min(DENSITY_BINS - 1, Math.floor((t - startMs) / binWidth));
    buckets[bin]++;
    severities[bin][e.severity] = (severities[bin][e.severity] || 0) + 1;
  }

  return { buckets, severities };
}

export const useReplayStore = create<ReplayStore>((set, get) => ({
  mode: "live",
  startTime: null,
  endTime: null,
  replayEvents: [],
  isLoading: false,
  error: null,
  gibsDate: null,

  playbackState: "idle",
  cursorTime: null,
  speed: 1,
  densityBuckets: [],
  densitySeverities: [],

  selectedEventIds: new Set(),
  selectionMode: false,

  mapInstance: null,

  play: () => {
    const { mode, cursorTime, startTime, endTime } = get();
    if (mode !== "replay" || !startTime || !endTime) return;
    // If cursor is at end, rewind
    const cursor = cursorTime ?? startTime.getTime();
    const endMs = endTime.getTime();
    set({
      playbackState: "playing",
      cursorTime: cursor >= endMs ? startTime.getTime() : cursor,
    });
    startPlaybackLoop();
  },

  pause: () => {
    set({ playbackState: "paused" });
    stopPlaybackLoop();
  },

  stop: () => {
    stopPlaybackLoop();
    const { startTime } = get();
    set({
      playbackState: "idle",
      cursorTime: startTime ? startTime.getTime() : null,
    });
  },

  stepForward: () => {
    const { cursorTime, startTime, endTime, densityBuckets } = get();
    if (!startTime || !endTime || cursorTime == null) return;
    const range = endTime.getTime() - startTime.getTime();
    const step = range / (densityBuckets.length || DENSITY_BINS);
    set({ cursorTime: Math.min(endTime.getTime(), cursorTime + step) });
  },

  stepBack: () => {
    const { cursorTime, startTime, endTime, densityBuckets } = get();
    if (!startTime || !endTime || cursorTime == null) return;
    const range = endTime.getTime() - startTime.getTime();
    const step = range / (densityBuckets.length || DENSITY_BINS);
    set({ cursorTime: Math.max(startTime.getTime(), cursorTime - step) });
  },

  setCursorTime: (ms) => set({ cursorTime: ms }),

  setSpeed: (speed) => set({ speed }),

  toggleEventSelection: (id) => {
    const s = new Set(get().selectedEventIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    set({ selectedEventIds: s });
  },

  selectEventsInRange: (startMs, endMs) => {
    const ids = new Set<string>();
    for (const e of get().replayEvents) {
      const t = new Date(e.event_time).getTime();
      if (t >= startMs && t <= endMs) ids.add(e.id);
    }
    set({ selectedEventIds: ids });
  },

  clearSelection: () => set({ selectedEventIds: new Set() }),

  setSelectionMode: (on) => set({ selectionMode: on }),

  setMapInstance: (map) => set({ mapInstance: map }),

  fetchReplay: async (start, end) => {
    set({ isLoading: true, error: null, mode: "replay", startTime: start, endTime: end });
    try {
      const params = new URLSearchParams({
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        limit: "5000",
      });
      const resp = await fetch(`/api/v1/events/replay?${params}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: GeoEvent[] = await resp.json();
      const events = Array.isArray(data) ? data : [];
      const { buckets, severities } = computeDensity(events, start.getTime(), end.getTime());
      set({
        replayEvents: events,
        isLoading: false,
        playbackState: "paused",
        cursorTime: start.getTime(),
        densityBuckets: buckets,
        densitySeverities: severities,
        selectedEventIds: new Set(),
      });
    } catch (err) {
      set({ isLoading: false, error: String(err), replayEvents: [] });
    }
  },

  setLive: () => {
    stopPlaybackLoop();
    set({
      mode: "live",
      startTime: null,
      endTime: null,
      replayEvents: [],
      isLoading: false,
      error: null,
      gibsDate: null,
      playbackState: "idle",
      cursorTime: null,
      densityBuckets: [],
      densitySeverities: [],
      selectedEventIds: new Set(),
      selectionMode: false,
    });
  },

  setGibsDate: (date) => set({ gibsDate: date }),
}));

export { DENSITY_BINS, SPEEDS };
export type { PlaybackState };
