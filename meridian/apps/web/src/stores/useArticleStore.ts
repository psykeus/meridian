import { create } from "zustand";

interface ArticleStore {
  isOpen: boolean;
  url: string | null;
  title: string | null;
  language: string | null;
  open: (url: string, title: string, language?: string) => void;
  close: () => void;
}

export const useArticleStore = create<ArticleStore>((set) => ({
  isOpen: false,
  url: null,
  title: null,
  language: null,
  open: (url, title, language) => set({ isOpen: true, url, title, language: language ?? null }),
  close: () => set({ isOpen: false, url: null, title: null, language: null }),
}));
