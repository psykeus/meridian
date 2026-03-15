import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Layout } from "react-grid-layout";
import { DEFAULT_DECK_ID, getDeck, deckPanelsToLayout } from "@/config/decks";

interface SavedLayout {
  id: string;
  label: string;
  deckId: string;
  layout: Layout[];
  activeLayers: string[];
  layerOpacity: Record<string, number>;
  styleKey: string;
  isGlobe: boolean;
  minimizedPanels: string[];
  createdAt: string;
}

export interface CustomFilter {
  id: string;
  name: string;
  icon: string;
  description: string;
  layers: string[];
  color: string;
  newsSources: string[];   // news source names to filter (metadata.source)
  newsKeywords: string[];  // keyword filters for news headlines
  newsRegions: string[];   // region filters for news
  createdAt: string;
  updatedAt: string;
}

interface LayoutStore {
  activeDeckId: string;
  currentLayout: Layout[];
  activeLayers: Set<string>;
  savedLayouts: SavedLayout[];
  isLayerPanelOpen: boolean;
  maximizedPanel: string | null;
  minimizedPanels: Set<string>;
  layerOpacity: Record<string, number>;
  customFilters: CustomFilter[];
  activeFilterId: string | null;  // non-null when a custom filter is applied
  styleKey: string;
  isGlobe: boolean;
  showTracks: Record<string, boolean>;
  panelPosition: "bottom" | "right";
  tickerPosition: "top" | "bottom" | "hidden";

  setActiveDeck: (deckId: string) => void;
  updateLayout: (layout: Layout[]) => void;
  toggleLayer: (layerId: string) => void;
  setLayerVisible: (layerId: string, visible: boolean) => void;
  toggleLayerPanel: () => void;
  saveCurrentLayout: (label: string) => void;
  loadSavedLayout: (id: string) => void;
  deleteSavedLayout: (id: string) => void;
  setMaximizedPanel: (panelId: string | null) => void;
  toggleMinimized: (panelId: string) => void;
  restorePanel: (panelId: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setStyleKey: (key: string) => void;
  setIsGlobe: (globe: boolean) => void;
  setShowTracks: (layerId: string, show: boolean) => void;
  setPanelPosition: (pos: "bottom" | "right") => void;
  setTickerPosition: (pos: "top" | "bottom" | "hidden") => void;

  // Custom filter CRUD
  createFilter: (name: string, icon: string, description: string, color?: string) => string;
  updateFilter: (id: string, updates: Partial<Pick<CustomFilter, "name" | "icon" | "description" | "layers" | "color" | "newsSources" | "newsKeywords" | "newsRegions">>) => void;
  deleteFilter: (id: string) => void;
  applyFilter: (id: string) => void;
  saveLayersToActiveFilter: () => void;
  clearActiveFilter: () => void;
}

function defaultLayersForDeck(deckId: string): Set<string> {
  const deck = getDeck(deckId);
  return new Set(deck.layers);
}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set, get) => ({
      activeDeckId: DEFAULT_DECK_ID,
      currentLayout: deckPanelsToLayout(getDeck(DEFAULT_DECK_ID).panels),
      activeLayers: defaultLayersForDeck(DEFAULT_DECK_ID),
      savedLayouts: [],
      isLayerPanelOpen: false,
      maximizedPanel: null,
      minimizedPanels: new Set<string>(),
      layerOpacity: {},
      customFilters: [],
      activeFilterId: null,
      styleKey: "dark",
      isGlobe: false,
      showTracks: {
        iss: true, celestrak_sats: true, starlink_constellation: true,
        gps_constellation: true, spacetrack_catalog: true,
        civil_flights: true, military_aircraft: true, emergency_squawks: true,
        vip_aircraft: true, bomber_isr: true,
        vessels: false, naval_vessels: false, aisstream_vessels: false,
      },
      panelPosition: "bottom" as const,
      tickerPosition: "top" as const,

      setActiveDeck: (deckId) => {
        const deck = getDeck(deckId);
        set({
          activeDeckId: deckId,
          currentLayout: deckPanelsToLayout(deck.panels),
          activeLayers: defaultLayersForDeck(deckId),
          activeFilterId: null,
        });
        // Auto-apply linked news preset if available
        import("@/stores/useNewsFeedStore").then(({ useNewsFeedStore }) => {
          const newsStore = useNewsFeedStore.getState();
          const deckPresets = newsStore.getPresetsForDeck(deckId);
          const linked = deckPresets.filter((p: { deckId: string | null }) => p.deckId === deckId);
          if (linked.length > 0) {
            const latest = linked[linked.length - 1];
            newsStore.loadPreset(latest.id);
          }
        }).catch(() => { /* news feed store may not be loaded yet */ });
      },

      updateLayout: (layout) => {
        // Structural comparison to prevent infinite loop with react-grid-layout.
        // RGL's synchronizeLayoutWithChildren() always creates a new array reference,
        // and its componentDidUpdate fires onLayoutChange on reference change — so
        // without this guard, every onLayoutChange → set → re-render → onLayoutChange.
        const prev = get().currentLayout;
        const same = prev.length === layout.length && prev.every((item, i) => {
          const next = layout[i];
          return next && item.i === next.i && item.x === next.x && item.y === next.y && item.w === next.w && item.h === next.h;
        });
        if (!same) set({ currentLayout: layout });
      },

      toggleLayer: (layerId) =>
        set((state) => {
          const next = new Set(state.activeLayers);
          if (next.has(layerId)) next.delete(layerId);
          else next.add(layerId);
          return { activeLayers: next };
        }),

      setLayerVisible: (layerId, visible) =>
        set((state) => {
          const next = new Set(state.activeLayers);
          if (visible) next.add(layerId);
          else next.delete(layerId);
          return { activeLayers: next };
        }),

      toggleLayerPanel: () =>
        set((state) => ({ isLayerPanelOpen: !state.isLayerPanelOpen })),

      saveCurrentLayout: (label) => {
        const { activeDeckId, currentLayout, activeLayers, layerOpacity, styleKey, isGlobe, minimizedPanels } = get();
        const saved: SavedLayout = {
          id: `layout_${Date.now()}`,
          label,
          deckId: activeDeckId,
          layout: currentLayout,
          activeLayers: [...activeLayers],
          layerOpacity,
          styleKey,
          isGlobe,
          minimizedPanels: [...minimizedPanels],
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ savedLayouts: [...state.savedLayouts, saved] }));
      },

      loadSavedLayout: (id) => {
        const saved = get().savedLayouts.find((l) => l.id === id);
        if (!saved) return;
        set({
          activeDeckId: saved.deckId,
          currentLayout: saved.layout,
          activeLayers: new Set(saved.activeLayers),
          ...(saved.layerOpacity ? { layerOpacity: saved.layerOpacity } : {}),
          ...(saved.styleKey ? { styleKey: saved.styleKey } : {}),
          ...(saved.isGlobe !== undefined ? { isGlobe: saved.isGlobe } : {}),
          ...(saved.minimizedPanels ? { minimizedPanels: new Set(saved.minimizedPanels) } : {}),
        });
      },

      deleteSavedLayout: (id) =>
        set((state) => ({ savedLayouts: state.savedLayouts.filter((l) => l.id !== id) })),

      setMaximizedPanel: (panelId) => set({ maximizedPanel: panelId }),
      toggleMinimized: (panelId) =>
        set((state) => {
          const next = new Set(state.minimizedPanels);
          if (next.has(panelId)) next.delete(panelId); else next.add(panelId);
          return { minimizedPanels: next };
        }),
      restorePanel: (panelId) =>
        set((state) => {
          const next = new Set(state.minimizedPanels);
          next.delete(panelId);
          return { minimizedPanels: next };
        }),
      setLayerOpacity: (layerId, opacity) =>
        set((state) => ({ layerOpacity: { ...state.layerOpacity, [layerId]: opacity } })),

      setStyleKey: (key) => set({ styleKey: key }),
      setIsGlobe: (globe) => set({ isGlobe: globe }),
      setShowTracks: (layerId, show) =>
        set((state) => ({ showTracks: { ...state.showTracks, [layerId]: show } })),
      setPanelPosition: (pos) => set({ panelPosition: pos }),
      setTickerPosition: (pos) => set({ tickerPosition: pos }),

      // ── Custom filter CRUD ─────────────────────────────────────────────
      createFilter: (name, icon, description, color) => {
        const id = `filter_${Date.now()}`;
        const now = new Date().toISOString();
        const filter: CustomFilter = {
          id,
          name,
          icon: icon || "◈",
          description,
          layers: [...get().activeLayers],
          color: color || "#00e676",
          newsSources: [],
          newsKeywords: [],
          newsRegions: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          customFilters: [...state.customFilters, filter],
          activeFilterId: id,
        }));
        return id;
      },

      updateFilter: (id, updates) =>
        set((state) => ({
          customFilters: state.customFilters.map((f) =>
            f.id === id
              ? { ...f, ...updates, updatedAt: new Date().toISOString() }
              : f
          ),
        })),

      deleteFilter: (id) =>
        set((state) => ({
          customFilters: state.customFilters.filter((f) => f.id !== id),
          activeFilterId: state.activeFilterId === id ? null : state.activeFilterId,
        })),

      applyFilter: (id) => {
        const filter = get().customFilters.find((f) => f.id === id);
        if (!filter) return;
        set({
          activeLayers: new Set(filter.layers),
          activeFilterId: id,
        });
        // Apply news filters if the feed has any configured
        if (filter.newsSources.length > 0 || filter.newsKeywords.length > 0 || filter.newsRegions.length > 0) {
          import("@/stores/useNewsFeedStore").then(({ useNewsFeedStore }) => {
            const ns = useNewsFeedStore.getState();
            ns.setSelectedSources(filter.newsSources);
            ns.setKeywords(filter.newsKeywords);
            ns.setSelectedRegions(filter.newsRegions);
            if (!ns.isOpen) ns.open();
          }).catch(() => {});
        }
      },

      saveLayersToActiveFilter: () => {
        const { activeFilterId, activeLayers, customFilters } = get();
        if (!activeFilterId) return;
        set({
          customFilters: customFilters.map((f) =>
            f.id === activeFilterId
              ? { ...f, layers: [...activeLayers], updatedAt: new Date().toISOString() }
              : f
          ),
        });
      },

      clearActiveFilter: () => set({ activeFilterId: null }),
    }),
    {
      name: "meridian-layout",
      version: 11,
      partialize: (state) => ({
        savedLayouts: state.savedLayouts,
        activeDeckId: state.activeDeckId,
        currentLayout: state.currentLayout,
        activeLayers: [...state.activeLayers],
        layerOpacity: state.layerOpacity,
        customFilters: state.customFilters,
        activeFilterId: state.activeFilterId,
        styleKey: state.styleKey,
        isGlobe: state.isGlobe,
        minimizedPanels: [...state.minimizedPanels],
        showTracks: state.showTracks,
        panelPosition: state.panelPosition,
        tickerPosition: state.tickerPosition,
      }),
      migrate: (persisted: unknown, fromVersion: number) => {
        const p = persisted as any;
        if (fromVersion < 5) {
          const deckId = p?.activeDeckId ?? DEFAULT_DECK_ID;
          p.activeLayers = [...defaultLayersForDeck(deckId)];
        }
        if (fromVersion < 6) {
          p.styleKey = p.styleKey ?? "dark";
          p.isGlobe = p.isGlobe ?? false;
          p.minimizedPanels = p.minimizedPanels ?? [];
          p.showTracks = p.showTracks ?? {
            iss: true, celestrak_sats: true, starlink_constellation: true,
            gps_constellation: true, spacetrack_catalog: true,
            civil_flights: true, military_aircraft: true, emergency_squawks: true,
            vip_aircraft: true, bomber_isr: true,
            vessels: false, naval_vessels: false,
          };
        }
        if (fromVersion < 7) {
          p.panelPosition = p.panelPosition ?? "bottom";
          p.tickerPosition = p.tickerPosition ?? "top";
        }
        if (fromVersion < 8) {
          // Force-enable aviation flight paths — previous defaults had these
          // set to false, and ?? migration wouldn't overwrite existing values.
          const tracks = p.showTracks ?? {};
          tracks.civil_flights = true;
          tracks.military_aircraft = true;
          tracks.emergency_squawks = true;
          tracks.vip_aircraft = true;
          tracks.bomber_isr = true;
          p.showTracks = tracks;
        }
        if (fromVersion < 9) {
          // currentLayout now persisted — existing users get their deck default
          if (!p.currentLayout) {
            const deckId = p.activeDeckId ?? DEFAULT_DECK_ID;
            p.currentLayout = deckPanelsToLayout(getDeck(deckId).panels);
          }
        }
        if (fromVersion < 10) {
          // Add color field to existing custom filters
          if (Array.isArray(p.customFilters)) {
            p.customFilters = p.customFilters.map((f: any) => ({
              ...f,
              color: f.color ?? "#00e676",
            }));
          }
        }
        if (fromVersion < 11) {
          // Add news source/keyword/region fields to existing custom filters
          if (Array.isArray(p.customFilters)) {
            p.customFilters = p.customFilters.map((f: any) => ({
              ...f,
              newsSources: f.newsSources ?? [],
              newsKeywords: f.newsKeywords ?? [],
              newsRegions: f.newsRegions ?? [],
            }));
          }
        }
        return p;
      },
      merge: (persisted: any, current) => {
        const p = persisted as any;
        const deckId = p?.activeDeckId ?? DEFAULT_DECK_ID;
        return {
          ...current,
          ...(p as Partial<LayoutStore>),
          currentLayout: p?.currentLayout ?? deckPanelsToLayout(getDeck(deckId).panels),
          activeLayers: new Set(p?.activeLayers ?? [...defaultLayersForDeck(DEFAULT_DECK_ID)]),
          minimizedPanels: new Set(p?.minimizedPanels ?? []),
        };
      },
    }
  )
);
