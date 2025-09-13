"use client";

import React, { Fragment } from "react";
import { useQueries } from "@tanstack/react-query";
import axios from "axios";

import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { fetchJobGrowthData, JobGrowthData, DataPayload } from "@/lib/api";

export function ComparisonTable({
  addresses,
  geoType,
}: {
  addresses: string[];
  geoType: "tract" | "county";
}) {
  const results = useQueries({
    queries: addresses.map((address) => ({
      queryKey: ["jobGrowth", address, geoType], // Use non-flushed key for comparison view
      queryFn: () => fetchJobGrowthData(address, geoType, false),
      retry: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    })),
  });

  const attributes = [
    {
      label: "Total Jobs",
      path: "total_jobs",
      format: (v: number) => v?.toLocaleString() ?? "N/A",
    },
    {
      label: "Unemployment Rate",
      path: "unemployment_rate",
      format: (v: number) => (v != null ? `${v.toFixed(1)}%` : "N/A"),
    },
    {
      label: "Labor Force",
      path: "labor_force",
      format: (v: number) => v?.toLocaleString() ?? "N/A",
    },
    {
      label: "1Y Growth",
      path: "growth.1y", // Path within either granular or county
      format: (v: number) => (v != null ? `${v}%` : "N/A"),
    },
    {
      label: "2Y Growth",
      path: "growth.2y",
      format: (v: number) => (v != null ? `${v}%` : "N/A"),
    },
    {
      label: "5Y Growth",
      path: "growth.5y",
      format: (v: number) => (v != null ? `${v}%` : "N/A"),
    },
    {
      label: "Avg. Weekly Wage",
      path: "wage_data.current_avg_weekly_wage",
      format: (v: number) =>
        v != null
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(v)
          : "N/A",
    },
    {
      label: "1Y Wage Growth",
      path: "wage_data.wage_growth.1y",
      format: (v: number) => (v != null ? `${v}%` : "N/A"),
    },
    {
      label: "Median HH Income",
      path: "income_data.median_household_income",
      format: (v: number) =>
        v != null
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(v)
          : "N/A",
    },
    {
      label: "Labor Participation",
      path: "labor_participation.labor_force_participation_rate",
      format: (v: number) => (v != null ? `${v}%` : "N/A"),
    },
    {
      label: "% College Educated",
      path: "education_data.percent_college_educated",
      format: (v: number) => (v != null ? `${v}%` : "N/A"),
    },
    {
      label: "Resilience Score",
      path: "downturn_resilience.resilience_score",
      format: (v: number) => (v != null ? v.toFixed(1) : "N/A"),
    },
    {
      label: "Workforce Quality",
      path: "education_data.workforce_quality_rating",
    },
  ];

  const getNestedValue = (resultData: JobGrowthData | undefined, path: string) => {
    if (!resultData) return undefined;

    // Merge contexts, granular takes precedence
    const mergedData: Partial<DataPayload> = {
      ...(resultData.county_context || {}),
      ...(resultData.granular_data || {}),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return path.split(".").reduce<any>((acc, part) => acc?.[part], mergedData);
  };

  return (
    <div className="w-full overflow-auto border rounded-lg">
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `minmax(150px, 1fr) repeat(${results.length}, minmax(240px, 1fr))`,
        }}
      >
        {/* Header Row */}
        <div className="sticky top-0 left-0 z-20 p-4 font-semibold bg-card border-b border-r">
          Attribute
        </div>
        {results.map((result, index) => {
          const address = addresses[index];
          const truncatedAddress =
            address.length > 25 ? `${address.substring(0, 22)}...` : address;
          return (
            <div
              key={index}
              className="sticky top-0 z-10 p-4 font-semibold bg-card border-b"
            >
              {result.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : result.isError ? (
                <div className="text-destructive text-sm">Error</div>
              ) : (
                <div className="flex flex-col">
                  <span className="truncate" title={address}>
                    {truncatedAddress}
                  </span>
                  {result.data?.geo && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {result.data.geo.lat.toFixed(4)},{" "}
                      {result.data.geo.lon.toFixed(4)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Attribute Rows */}
        {attributes.map((attr) => (
          <Fragment key={attr.label}>
            <div className="sticky left-0 z-10 p-4 font-medium bg-card border-b border-r">
              {attr.label}
            </div>
            {results.map((result, index) => (
              <div key={index} className="p-4 border-b">
                {result.isLoading ? (
                  <Skeleton className="h-6 w-1/2" />
                ) : result.isError ? (
                  <Alert variant="destructive" className="p-2">
                    <AlertDescription>
                      {(() => {
                        if (axios.isAxiosError(result.error) && result.error.response) {
                          const { data } = result.error.response;
                          const detail = typeof data === "object" && data?.detail ? data.detail : data;
                          return detail;
                        }
                        return result.error.message;
                      })()}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="text-sm">
                    {(() => {
                      const value = getNestedValue(result.data, attr.path);
                      if (value === undefined || value === null) return "N/A";

                      if (typeof value === "object" && !attr.format) {
                        return "N/A";
                      }

                      const formattedValue = attr.format ? attr.format(value) : String(value);

                      if (attr.label.includes("Sector")) {
                        const sector = value as { name: string; growth: number };
                        return sector && sector.name ? (
                          <Badge
                            variant={
                              sector.growth > 0 ? "default" : "secondary"
                            }
                          >
                            {sector.name}: {sector.growth}%
                          </Badge>
                        ) : (
                          "N/A"
                        );
                      }
                      return formattedValue;
                    })()}
                  </div>
                )}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}