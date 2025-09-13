import axios from "axios";
import { JobGrowthData, DataPayload } from "./types";

export type { JobGrowthData, DataPayload };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const fetchJobGrowthData = async (
  address: string,
  geoType: string,
  flushCache: boolean
): Promise<JobGrowthData> => {
  const params: Record<string, string | boolean> = { address, geo_type: geoType };
  if (flushCache) {
    params.flush_cache = true;
  }
  const { data } = await axios.get(`${API_BASE_URL}/api/job-growth`, {
    params,
  });
  return data;
};