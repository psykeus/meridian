import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NewsPreset {
  id: string;
  name: string;
  deckId: string | null;
  keywords: string[];
  selectedSources: string[];
  selectedRegions: string[];
  selectedStreams: string[];
  createdAt: string;
}

interface NewsFeedStore {
  isOpen: boolean;
  activeTab: "headlines" | "streams";
  keywords: string[];
  selectedSources: string[];
  selectedRegions: string[];
  sortBy: "time" | "severity";
  presets: NewsPreset[];
  activePresetId: string | null;

  toggle: () => void;
  open: () => void;
  close: () => void;
  setActiveTab: (tab: "headlines" | "streams") => void;
  setKeywords: (keywords: string[]) => void;
  addKeyword: (keyword: string) => void;
  removeKeyword: (keyword: string) => void;
  setSelectedSources: (sources: string[]) => void;
  setSelectedRegions: (regions: string[]) => void;
  setSortBy: (sortBy: "time" | "severity") => void;
  savePreset: (name: string, deckId: string | null) => string;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  getPresetsForDeck: (deckId: string) => NewsPreset[];
}

export const useNewsFeedStore = create<NewsFeedStore>()(
  persist(
    (set, get) => ({
      isOpen: false,
      activeTab: "headlines",
      keywords: [],
      selectedSources: [],
      selectedRegions: [],
      sortBy: "time",
      presets: [],
      activePresetId: null,

      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      setKeywords: (keywords) => set({ keywords }),
      addKeyword: (keyword) =>
        set((s) => ({
          keywords: s.keywords.includes(keyword) ? s.keywords : [...s.keywords, keyword],
        })),
      removeKeyword: (keyword) =>
        set((s) => ({ keywords: s.keywords.filter((k) => k !== keyword) })),

      setSelectedSources: (sources) => set({ selectedSources: sources }),
      setSelectedRegions: (regions) => set({ selectedRegions: regions }),
      setSortBy: (sortBy) => set({ sortBy }),

      savePreset: (name, deckId) => {
        const { keywords, selectedSources, selectedRegions } = get();
        const id = `news_preset_${Date.now()}`;
        const preset: NewsPreset = {
          id,
          name,
          deckId,
          keywords: [...keywords],
          selectedSources: [...selectedSources],
          selectedRegions: [...selectedRegions],
          selectedStreams: [],
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          presets: [...s.presets, preset],
          activePresetId: id,
        }));
        return id;
      },

      loadPreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        if (!preset) return;
        set({
          keywords: [...preset.keywords],
          selectedSources: [...preset.selectedSources],
          selectedRegions: [...preset.selectedRegions],
          activePresetId: id,
        });
      },

      deletePreset: (id) =>
        set((s) => ({
          presets: s.presets.filter((p) => p.id !== id),
          activePresetId: s.activePresetId === id ? null : s.activePresetId,
        })),

      getPresetsForDeck: (deckId) => {
        return get().presets.filter((p) => p.deckId === deckId || p.deckId === null);
      },
    }),
    {
      name: "meridian-news-feed",
      version: 1,
      partialize: (state) => ({
        presets: state.presets,
        keywords: state.keywords,
        selectedSources: state.selectedSources,
        selectedRegions: state.selectedRegions,
        sortBy: state.sortBy,
        activePresetId: state.activePresetId,
      }),
    }
  )
);
