import { create } from 'zustand';

interface JobGrowthData {
    stats: { yoy_growth: number; total_jobs: number; top_sectors: string[] };
    trends: { year: number; value: number }[];
    geo: { lat: number; lon: number; tract?: string; zip?: string; county?: string };
}

interface AddressState {
  addresses: string[];
  geoType: 'tract' | 'zip' | 'county';
  setAddresses: (addresses: string[]) => void;
  setGeoType: (geoType: 'tract' | 'zip' | 'county') => void;
}

export const useAddressStore = create<AddressState>((set) => ({
    addresses: [],
    geoType: 'tract',
    setAddresses: (addresses) => set({ addresses }),
    setGeoType: (geoType) => set({ geoType }),
}));