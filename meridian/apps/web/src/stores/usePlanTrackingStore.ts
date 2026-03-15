import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GeoEvent } from "@/types";

export interface TrackedEntity {
  entityKey: string;
  event: GeoEvent;
  pinnedAt: string;
  planRoomId?: number;
  planRoomName?: string;
  notes?: string;
}

interface PlanTrackingStore {
  trackedEntities: Record<string, TrackedEntity>;
  pinEntity: (event: GeoEvent, planRoomId?: number, planRoomName?: string, notes?: string) => void;
  unpinEntity: (entityKey: string) => void;
  updateEntityPosition: (entityKey: string, event: GeoEvent) => void;
  isTracked: (entityKey: string) => boolean;
  clearAll: () => void;
}

function getEntityKey(event: GeoEvent): string {
  switch (event.source_id) {
    case "nasa_iss":   return "live:iss";
    case "opensky":
    case "adsb_lol":   return `live:aircraft:${event.metadata?.icao24 ?? event.id}`;
    case "aishub":     return `live:vessel:${event.metadata?.mmsi ?? event.id}`;
    default:           return event.id;
  }
}

export { getEntityKey };

export const usePlanTrackingStore = create<PlanTrackingStore>()(
  persist(
    (set, get) => ({
      trackedEntities: {},

      pinEntity: (event, planRoomId, planRoomName, notes) => {
        const key = getEntityKey(event);
        set((s) => ({
          trackedEntities: {
            ...s.trackedEntities,
            [key]: { entityKey: key, event, pinnedAt: new Date().toISOString(), planRoomId, planRoomName, notes },
          },
        }));
      },

      unpinEntity: (entityKey) => {
        set((s) => {
          const next = { ...s.trackedEntities };
          delete next[entityKey];
          return { trackedEntities: next };
        });
      },

      updateEntityPosition: (entityKey, event) => {
        set((s) => {
          if (!s.trackedEntities[entityKey]) return s;
          return {
            trackedEntities: {
              ...s.trackedEntities,
              [entityKey]: { ...s.trackedEntities[entityKey], event },
            },
          };
        });
      },

      isTracked: (entityKey) => !!get().trackedEntities[entityKey],

      clearAll: () => set({ trackedEntities: {} }),
    }),
    {
      name: "meridian-plan-tracking",
      version: 1,
      migrate: (persisted: unknown) => persisted as any,
    }
  )
);
