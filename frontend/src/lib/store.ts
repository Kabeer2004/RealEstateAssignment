import { create } from 'zustand';

interface AddressState {
  addresses: string[];
  setAddresses: (addresses: string[]) => void;
  geoType: 'tract' | 'county';
  setGeoType: (geoType: 'tract' | 'county') => void;
  flushCache: boolean;
  setFlushCache: (flush: boolean) => void;
}

export const useAddressStore = create<AddressState>((set) => ({
  addresses: [],
  setAddresses: (addresses) => set({ addresses }),
  geoType: 'tract',
  setGeoType: (geoType) => set({ geoType }),
  flushCache: false,
  setFlushCache: (flush) => set({ flushCache: flush }),
}));