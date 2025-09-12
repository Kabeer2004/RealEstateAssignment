"use client";

import { useAddressStore } from "@/lib/store";
import { useHistoryStore, type HistoryItem } from "@/lib/historyStore";

export function History() {
  const { history } = useHistoryStore();
  const { setAddresses, setGeoType, setFlushCache } = useAddressStore();

  if (history.length === 0) {
    return null;
  }

  const handleHistoryClick = (item: HistoryItem) => {
    setAddresses([item.address]);
    setGeoType(item.geoType);
    setFlushCache(false); // Use cached result for history clicks
  };

  return (
    <div className="mt-8 pt-6 border-t">
      <h3 className="text-lg font-semibold mb-3">History</h3>
      <div className="space-y-1 max-h-60 overflow-y-auto pr-2">
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => handleHistoryClick(item)}
            className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors"
          >
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium truncate pr-2" title={item.address}>
                {item.address}
              </span>
              <span className="text-muted-foreground whitespace-nowrap">
                {item.duration.toFixed(2)}s
              </span>
            </div>
            <div className="text-xs text-muted-foreground capitalize">
              {item.geoType}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}