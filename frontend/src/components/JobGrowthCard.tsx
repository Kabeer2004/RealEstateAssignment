"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { motion } from "framer-motion";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { JobGrowthModalContent } from "@/components/JobGrowthModalContent";
import { cn } from "@/lib/utils";
import { JobGrowthData } from "@/lib/types";
import { useHistoryStore } from "@/lib/historyStore";
import { fetchJobGrowthData } from "@/lib/api";

export function JobGrowthCard({
  address,
  geoType,
  flushCache,
}: {
  address: string;
  geoType: "tract" | "zip" | "county";
  flushCache: boolean;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const { addHistoryItem } = useHistoryStore();

  const getRatingClass = (r?: string) => {
    switch (r?.toLowerCase()) {
      case "high":
      case "strong":
      case "outperforming":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "moderate":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "low":
      case "weak":
      case "underperforming":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };
  const queryClient = useQueryClient();
  const { data, isLoading, isSuccess, error } = useQuery({
    queryKey: ["jobGrowth", address, geoType, flushCache],
    queryFn: () => fetchJobGrowthData(address, geoType, flushCache),
    onSuccess: (freshData) => {
      if (flushCache) {
        queryClient.setQueryData(
          ["jobGrowth", address, geoType, false],
          freshData
        );
      }
    },
    retry: false,
  });

  React.useEffect(() => {
    if (isLoading) {
      setStartTime(Date.now());
    }
  }, [isLoading]);

  // Effect for stopping the timer and adding to history
  React.useEffect(() => {
    // This effect runs when the query is no longer loading AND we have a start time set.
    if (!isLoading && startTime) {
      const duration = (Date.now() - startTime) / 1000;
      // We only add to history on success.
      if (isSuccess) {
        addHistoryItem({ address, geoType, duration });
      }
      // Reset startTime for the next run.
      setStartTime(null);
    }
  }, [isLoading, isSuccess, startTime, addHistoryItem, address, geoType]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (startTime) {
      interval = setInterval(() => {
        setElapsedTime((Date.now() - startTime) / 1000);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [startTime]);

  if (isLoading)
    return (
      <Skeleton className="h-48 w-full p-4 flex flex-col items-center justify-center gap-2">
        <div className="font-medium text-center">
          Fetching data for:
          <p className="font-semibold truncate" title={address}>
            {address}
          </p>
        </div>
        <div className="text-2xl font-bold tabular-nums mt-2">
          {elapsedTime.toFixed(1)}s
        </div>
      </Skeleton>
    );

  if (error) {
    const errorMessage =
      axios.isAxiosError(error) && error.response
        ? `${error.response.status}: ${error.response.data.detail}`
        : error.message;
    return (
      <Alert variant="destructive">
        <AlertTitle>{address}</AlertTitle>
        <AlertDescription>
          Failed to fetch data: {errorMessage}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const { geo, granular_data, county_context, cre_summary } = data;
  const hasGranularData = granular_data && !granular_data.error;

  const mainData = hasGranularData ? granular_data : county_context;

  const growth1Y = mainData?.growth?.["1y"];
  const wageGrowth1Y = county_context?.wage_data?.wage_growth?.["1y"];

  return (
    <>
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
      >
        <Card
          onClick={() => setIsModalOpen(true)}
          className="cursor-pointer hover:shadow-lg transition-shadow"
        >
          <CardHeader>
            <CardTitle>{address}</CardTitle>
            <CardDescription>
              {geoType.toUpperCase()} &middot; {geo.lat.toFixed(4)},{" "}
              {geo.lon.toFixed(4)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mainData && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="font-medium text-muted-foreground">
                    Total Jobs
                  </div>
                  <div className="text-right font-semibold">
                    {(mainData.total_jobs ?? 0).toLocaleString()}
                  </div>
                  <div className="font-medium text-muted-foreground">
                    Unemployment
                  </div>
                  <div className="text-right font-semibold">
                    {mainData.unemployment_rate != null
                      ? `${mainData.unemployment_rate.toFixed(1)}%`
                      : "N/A"}
                  </div>
                  <div className="font-medium text-muted-foreground">
                    1Y Job Growth
                  </div>
                  <div className="text-right font-semibold">
                    {growth1Y != null ? `${growth1Y.toFixed(1)}%` : "N/A"}
                  </div>
                  <div className="font-medium text-muted-foreground">
                    1Y Wage Growth
                  </div>
                  <div className="text-right font-semibold">
                    {wageGrowth1Y != null
                      ? `${wageGrowth1Y.toFixed(1)}%`
                      : "N/A"}
                  </div>
                </div>
                {cre_summary && (
                  <div className="flex flex-wrap gap-2 pt-3 border-t">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        getRatingClass(cre_summary.workforce_quality)
                      )}
                    >
                      Workforce: {cre_summary.workforce_quality}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        getRatingClass(cre_summary.recession_resilience)
                      )}
                    >
                      Resilience: {cre_summary.recession_resilience}
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <JobGrowthModalContent
          address={address}
          data={data}
          geoType={geoType}
        />
      </Modal>
    </>
  );
}