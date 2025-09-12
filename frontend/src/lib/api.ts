import axios from "axios";
import { JobGrowthData } from "./types";

export const fetchJobGrowthData = async (
  address: string,
  geoType: string,
  flushCache: boolean
): Promise<JobGrowthData> => {
  const params: any = { address, geo_type: geoType };
  if (flushCache) {
    params.flush_cache = true;
  }
  const { data } = await axios.get("http://localhost:8000/api/job-growth", {
    params,
  });
  return data;
};