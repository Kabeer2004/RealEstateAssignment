import { create } from "zustand";

export interface HistoryItem {
  id: string; // address + geoType
  address: string;
  geoType: "tract" | "county";
  duration: number; // in seconds
  timestamp: number; // when it was searched
}

interface HistoryState {
  history: HistoryItem[];
  addHistoryItem: (item: Omit<HistoryItem, "timestamp" | "id">) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  history: [],
  addHistoryItem: (item) =>
    set((state) => {
      const newItem = {
        ...item,
        id: `${item.address}:${item.geoType}`,
        timestamp: Date.now(),
      };
      // Remove old entry if it exists and add the new one to the top
      const newHistory = state.history.filter((h) => h.id !== newItem.id);
      return { history: [newItem, ...newHistory] };
    }),
}));
