import { create } from "zustand";
import type { AnomalyInsight } from "@/components/Panel/InsightDetailDrawer";

interface InsightStore {
  selectedInsight: AnomalyInsight | null;
  setSelectedInsight: (insight: AnomalyInsight | null) => void;
  closeInsight: () => void;
}

export const useInsightStore = create<InsightStore>((set) => ({
  selectedInsight: null,
  setSelectedInsight: (insight) => set({ selectedInsight: insight }),
  closeInsight: () => set({ selectedInsight: null }),
}));
