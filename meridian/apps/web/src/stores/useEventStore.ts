import { create } from "zustand";
import type { FeedCategory, GeoEvent, SeverityLevel } from "@/types";

const MAX_EVENTS = 5000;

interface EventFilters {
  categories: Set<FeedCategory>;
  severities: Set<SeverityLevel>;
  hoursBack: number;
}

interface EventStore {
  events: GeoEvent[];
  filters: EventFilters;
  selectedEvent: GeoEvent | null;
  isDrawerOpen: boolean;

  addEvents: (events: GeoEvent[]) => void;
  addEvent: (event: GeoEvent) => void;
  setSelectedEvent: (event: GeoEvent | null) => void;
  closeDrawer: () => void;
  setFilter: <K extends keyof EventFilters>(key: K, value: EventFilters[K]) => void;
  clearEvents: () => void;

  getFilteredEvents: () => GeoEvent[];
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  filters: {
    categories: new Set(),
    severities: new Set(),
    hoursBack: 24,
  },
  selectedEvent: null,
  isDrawerOpen: false,

  addEvents: (incoming) =>
    set((state) => {
      const existingIds = new Set(state.events.map((e) => e.id));
      const newEvents = incoming.filter((e) => !existingIds.has(e.id));
      const merged = [...newEvents, ...state.events].slice(0, MAX_EVENTS);
      return { events: merged };
    }),

  addEvent: (event) =>
    set((state) => {
      if (state.events.some((e) => e.id === event.id)) return state;
      return { events: [event, ...state.events].slice(0, MAX_EVENTS) };
    }),

  setSelectedEvent: (event) =>
    set({ selectedEvent: event, isDrawerOpen: event !== null }),

  closeDrawer: () => set({ isDrawerOpen: false, selectedEvent: null }),

  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),

  clearEvents: () => set({ events: [] }),

  getFilteredEvents: () => {
    const { events, filters } = get();
    const cutoff = new Date(Date.now() - filters.hoursBack * 3600 * 1000);

    return events.filter((e) => {
      if (new Date(e.event_time) < cutoff) return false;
      if (filters.categories.size > 0 && !filters.categories.has(e.category)) return false;
      if (filters.severities.size > 0 && !filters.severities.has(e.severity)) return false;
      return true;
    });
  },
}));
