import axios from "axios";
import { JobGrowthData, DataPayload } from "./types";

export type { JobGrowthData, DataPayload };

export const fetchJobGrowthData = async (
  address: string,
  geoType: string,
  flushCache: boolean
): Promise<JobGrowthData> => {
  const params: Record<string, string | boolean> = {
    address,
    geo_type: geoType,
  };
  if (flushCache) {
    params.flush_cache = true;
  }

  // In production (docker-compose.yml), NEXT_PUBLIC_API_URL is "", so we hit the Next.js proxy rewrite at /api/...
  // In local dev (docker-compose.local.yml), it's "http://localhost:8000", so we hit the backend directly.
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
  const url = API_BASE_URL ? `${API_BASE_URL}/job-growth` : "/api/job-growth";

  const { data } = await axios.get(url, {
    params,
  });
  return data;
};
