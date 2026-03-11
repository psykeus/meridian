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
  createdAt: string;
}

interface LayoutStore {
  activeDeckId: string;
  currentLayout: Layout[];
  activeLayers: Set<string>;
  savedLayouts: SavedLayout[];
  isLayerPanelOpen: boolean;
  maximizedPanel: string | null;

  setActiveDeck: (deckId: string) => void;
  updateLayout: (layout: Layout[]) => void;
  toggleLayer: (layerId: string) => void;
  setLayerVisible: (layerId: string, visible: boolean) => void;
  toggleLayerPanel: () => void;
  saveCurrentLayout: (label: string) => void;
  loadSavedLayout: (id: string) => void;
  deleteSavedLayout: (id: string) => void;
  setMaximizedPanel: (panelId: string | null) => void;
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

      setActiveDeck: (deckId) => {
        const deck = getDeck(deckId);
        set({
          activeDeckId: deckId,
          currentLayout: deckPanelsToLayout(deck.panels),
          activeLayers: defaultLayersForDeck(deckId),
        });
      },

      updateLayout: (layout) => set({ currentLayout: layout }),

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
        const { activeDeckId, currentLayout, activeLayers } = get();
        const saved: SavedLayout = {
          id: `layout_${Date.now()}`,
          label,
          deckId: activeDeckId,
          layout: currentLayout,
          activeLayers: [...activeLayers],
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
        });
      },

      deleteSavedLayout: (id) =>
        set((state) => ({ savedLayouts: state.savedLayouts.filter((l) => l.id !== id) })),

      setMaximizedPanel: (panelId) => set({ maximizedPanel: panelId }),
    }),
    {
      name: "meridian-layout",
      version: 2,
      partialize: (state) => ({
        savedLayouts: state.savedLayouts,
        activeDeckId: state.activeDeckId,
        activeLayers: [...state.activeLayers],
      }),
      migrate: (persisted: unknown, fromVersion: number) => {
        const p = persisted as any;
        if (fromVersion < 2) {
          // Merge new default layers into existing persisted set without wiping user choices
          const deckId = p?.activeDeckId ?? DEFAULT_DECK_ID;
          const defaults = [...defaultLayersForDeck(deckId)];
          const existing: string[] = p?.activeLayers ?? defaults;
          p.activeLayers = [...new Set([...existing, ...defaults])];
        }
        return p;
      },
      merge: (persisted: any, current) => ({
        ...current,
        ...(persisted as Partial<LayoutStore>),
        activeLayers: new Set((persisted as any)?.activeLayers ?? [...defaultLayersForDeck(DEFAULT_DECK_ID)]),
      }),
    }
  )
);
