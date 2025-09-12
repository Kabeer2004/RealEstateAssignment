"use client";

import dynamic from "next/dynamic";
import React, { Fragment, useState } from "react";
import { useForm, FormProvider, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useQuery,
  QueryClient,
  QueryClientProvider,
  useIsFetching,
  useQueryClient,
  useQueries,
} from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { useAddressStore } from "@/lib/store";
import { addressSchema } from "@/lib/schema";
import { useHistoryStore, type HistoryItem } from "@/lib/historyStore";
import axios from "axios";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Plus, X, LayoutGrid, Rows3, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

interface Growth {
  "6mo"?: number;
  "1y"?: number;
  "2y"?: number;
  "5y"?: number;
}

interface Sector {
  name: string;
  growth: number;
}

interface WageData {
  current_avg_weekly_wage?: number;
  annual_equivalent?: number;
  wage_growth?: { "1y"?: number; "3y"?: number; "5y"?: number };
  error?: string;
}

interface ComparativePerformance {
  [key: string]: {
    local_rate: number;
    national_rate: number;
    difference: number;
    outperforming: boolean;
    performance_description: string;
  };
}

interface DownturnResilience {
  covid_impact?: { job_loss_percent: number };
  great_recession_impact?: { job_loss_percent: number };
  resilience_score?: number;
  resilience_rating?: "High" | "Moderate" | "Low";
  error?: string;
}

interface IncomeData {
  median_household_income?: number;
  data_year?: number;
  error?: string;
}

interface LaborParticipation {
  labor_force_participation_rate?: number;
  data_year?: number;
  error?: string;
}

interface EducationData {
  percent_college_educated?: number;
  workforce_quality_rating?: "High" | "Moderate" | "Low";
  data_year?: number;
  error?: string;
}

interface CRESummary {
  employment_growth_strength: "strong" | "moderate" | "weak";
  wage_growth_strength: "strong" | "moderate" | "weak";
  workforce_quality: "High" | "Moderate" | "Low" | "Unknown";
  recession_resilience: "High" | "Moderate" | "Low" | "Unknown";
  vs_national_performance: "outperforming" | "underperforming";
}

interface DataPayload {
  source: string;
  total_jobs: number;
  unemployment_rate?: number;
  labor_force?: number;
  growth: Growth;
  top_sectors_growing: Sector[];
  trends: { year: number; value: number; projected?: boolean }[];
  monthly_employment_trends?: {
    year: string;
    month: string;
    value: number;
    label: string;
  }[];
  error?: string;
  wage_data?: WageData;
  comparative_performance?: ComparativePerformance;
  downturn_resilience?: DownturnResilience;
  income_data?: IncomeData;
  labor_participation?: LaborParticipation;
  education_data?: EducationData;
}

interface JobGrowthData {
  geo: { lat: number; lon: number };
  county_context?: DataPayload;
  granular_data?: DataPayload;
  cre_summary: CRESummary;
  notes: string[];
}

type AddressFormData = z.infer<typeof addressSchema>;

const queryClient = new QueryClient();

export default function Page() {
  return (
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>
  );
}

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => <Skeleton className="h-[200px] w-full" />,
});

// Dynamically import react-select to prevent SSR hydration errors
const ClientOnlySelect = dynamic(() => import("react-select"), { ssr: false });

function AddressForm() {
  const { setAddresses, setGeoType, flushCache, setFlushCache } =
    useAddressStore();

  const isFetching = useIsFetching() > 0;

  const methods = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      addresses: [{ value: "" }],
      geoType: "tract",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: methods.control,
    name: "addresses",
  });

  const onSubmit = (data: AddressFormData) => {
    const addressValues = data.addresses
      .map((a) => a.value)
      .filter((a) => a.trim());
    setAddresses(addressValues);
    setGeoType(data.geoType);
  };

  return (
    <FormProvider {...methods}>
      <motion.form
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        onSubmit={methods.handleSubmit(onSubmit)}
        className="space-y-6"
      >
        <div>
          <label className="block text-sm font-medium mb-2">Addresses</label>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  {...methods.register(`addresses.${index}.value`)}
                  placeholder={`Address ${index + 1}`}
                  className="flex-grow"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => append({ value: "" })}
          >
            <Plus className="mr-2 size-4" />
            Add Address
          </Button>
          {methods.formState.errors.addresses && (
            <p className="text-red-500 text-sm mt-1">
              {methods.formState.errors.addresses.message ||
                methods.formState.errors.addresses.root?.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Geography Level
          </label>
          <ClientOnlySelect
            options={[
              { value: "tract", label: "Census Tract" },
              { value: "zip", label: "ZIP Code" },
              { value: "county", label: "County" },
            ]}
            onChange={(opt) => {
              const geoTypeValue =
                (opt?.value as "tract" | "zip" | "county") || "tract";
              methods.setValue("geoType", geoTypeValue);
              setGeoType(geoTypeValue);
            }}
            defaultValue={{
              value: "tract",
              label: "Census Tract",
            }}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="flush-cache"
            checked={flushCache}
            onCheckedChange={(checked) => setFlushCache(Boolean(checked))}
          />
          <label
            htmlFor="flush-cache"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Force Refresh (Flush Cache)
          </label>
        </div>

        <Button type="submit" className="w-full" disabled={isFetching}>
          {isFetching && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isFetching ? "Fetching Data..." : "Fetch Job Growth Data"}
        </Button>
      </motion.form>
    </FormProvider>
  );
}

function HomePage() {
  const { addresses, geoType, flushCache } = useAddressStore();
  const [view, setView] = useState<"explore" | "compare">("explore");

  return (
    <div className="flex h-screen bg-background">
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Market Analysis</h1>
          <div className="flex items-center gap-2">
            <Button
              variant={view === "explore" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setView("explore")}
              aria-label="Explore View"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant={view === "compare" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setView("compare")}
              aria-label="Compare View"
            >
              <Rows3 className="size-4" />
            </Button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {view === "explore" ? (
              <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {addresses.map((address) => (
                  <JobGrowthCard
                    key={address}
                    address={address}
                    geoType={geoType}
                    flushCache={flushCache}
                  />
                ))}
              </div>
            ) : addresses.length >= 2 ? (
              <ComparisonTable addresses={addresses} geoType={geoType} />
            ) : (
              <Alert>
                <AlertTitle>Not enough addresses</AlertTitle>
                <AlertDescription>
                  Please enter at least two addresses to compare.
                </AlertDescription>
              </Alert>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <aside className="w-96 p-6 bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0">
          <h2 className="text-xl font-semibold mb-4">Market Search</h2>
          <AddressForm />
          <History />
        </div>
      </aside>
    </div>
  );
}

function JobGrowthCard({
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
    queryFn: async () => {
      const params: any = { address, geo_type: geoType };
      if (flushCache) {
        params.flush_cache = true;
      }
      const { data } = await axios.get("http://localhost:8000/api/job-growth", {
        params,
      });
      return data as JobGrowthData;
    },
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

function ComparisonTable({
  addresses,
  geoType,
}: {
  addresses: string[];
  geoType: string;
}) {
  const results = useQueries({
    queries: addresses.map((address) => ({
      queryKey: ["jobGrowth", address, geoType],
      queryFn: async () => {
        const { data } = await axios.get(
          "http://localhost:8000/api/job-growth",
          { params: { address, geo_type: geoType } }
        );
        return data;
      },
      retry: false,
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
      format: (v: number) => v?.toFixed(1) + "%" ?? "N/A",
    },
    {
      label: "Labor Force",
      path: "labor_force",
      format: (v: number) => v?.toLocaleString() ?? "N/A",
    },
    {
      label: "1Y Growth",
      path: "growth.1y", // Path within either granular or county
      format: (v: number) => v + "%" ?? "N/A",
    },
    {
      label: "2Y Growth",
      path: "growth.2y",
      format: (v: number) => v + "%" ?? "N/A",
    },
    {
      label: "5Y Growth",
      path: "growth.5y",
      format: (v: number) => v + "%" ?? "N/A",
    },
    {
      label: "Avg. Weekly Wage",
      path: "wage_data.current_avg_weekly_wage",
      format: (v: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(v),
    },
    {
      label: "1Y Wage Growth",
      path: "wage_data.wage_growth.1y",
      format: (v: number) => v + "%" ?? "N/A",
    },
    {
      label: "Median HH Income",
      path: "income_data.median_household_income",
      format: (v: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(v),
    },
    {
      label: "Labor Participation",
      path: "labor_participation.labor_force_participation_rate",
      format: (v: number) => v + "%" ?? "N/A",
    },
    {
      label: "% College Educated",
      path: "education_data.percent_college_educated",
      format: (v: number) => v + "%" ?? "N/A",
    },
    {
      label: "Resilience Score",
      path: "downturn_resilience.resilience_score",
      format: (v: number) => v?.toFixed(1) ?? "N/A",
    },
    {
      label: "Workforce Quality",
      path: "education_data.workforce_quality_rating",
    },
  ];

  const getNestedValue = (resultData: any, path: string) => {
    if (!resultData) return undefined;

    // Merge contexts, granular takes precedence
    const mergedData = {
      ...(resultData.county_context || {}),
      ...(resultData.granular_data || {}),
    };

    const value = path
      .split(".")
      .reduce((acc, part) => acc && acc[part], mergedData);
    return value;
  };

  return (
    <div className="w-full overflow-auto border rounded-lg">
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `minmax(200px, 1fr) repeat(${results.length}, minmax(300px, 1fr))`,
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
                      {axios.isAxiosError(result.error)
                        ? result.error.response?.data?.detail
                        : result.error.message}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="text-sm">
                    {(() => {
                      const value = getNestedValue(result.data, attr.path);
                      if (value === undefined || value === null) return "N/A";

                      const formattedValue = attr.format
                        ? attr.format(value)
                        : value;

                      if (attr.label.includes("Sector")) {
                        const sector = getNestedValue(result.data, attr.path);
                        return sector && sector.name ? (
                          <Badge
                            variant={
                              sector.growth > 0 ? "default" : "secondary"
                            }
                          >
                            {formattedValue}
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

function History() {
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

function DataDisplay({ data, title }: { data: DataPayload; title: string }) {
  const yearlyChartData = React.useMemo(() => {
    if (!data.trends || data.trends.length === 0) return [];

    const latestYear = Math.max(...data.trends.map((t) => t.year));
    const fiveYearsAgo = latestYear - 4;
    const filteredTrends = data.trends.filter((t) => t.year >= fiveYearsAgo);

    const sortedTrends = [...filteredTrends].reverse(); // chart needs ascending years
    const lastActualPointIndex = sortedTrends.findLastIndex(
      (p) => !p.projected
    );

    return sortedTrends.map((d, i) => {
      const point: any = {
        year: d.year,
        value: d.value,
        actual: null,
        projected: null,
      };
      if (d.projected) {
        point.projected = d.value;
      } else {
        point.actual = d.value;
      }
      if (
        i === lastActualPointIndex &&
        lastActualPointIndex < sortedTrends.length - 1
      ) {
        point.projected = d.value;
      }
      return point;
    });
  }, [data.trends]);

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-semibold text-lg mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-3">{data.source}</p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-sm">
        <div className="font-medium">Total Jobs:</div>
        <div>{(data.total_jobs ?? 0).toLocaleString()}</div>
        <div className="font-medium">Unemployment:</div>
        <div>{data.unemployment_rate?.toFixed(1)}%</div>
        <div className="font-medium">Labor Force:</div>
        <div>{(data.labor_force ?? 0).toLocaleString()}</div>
      </div>

      {data.top_sectors_growing && data.top_sectors_growing.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            Top Growing Sectors (YoY):
          </p>
          <div className="flex flex-wrap gap-1 mb-4">
            {data.top_sectors_growing.map((sector) => (
              <Badge
                key={sector.name}
                variant={sector.growth > 0 ? "default" : "secondary"}
              >
                {sector.name}: {sector.growth}%
              </Badge>
            ))}
          </div>
        </div>
      )}

      {data.monthly_employment_trends &&
      data.monthly_employment_trends.length > 0 ? (
        <div>
          <h4 className="font-semibold my-2">
            County Employment Trend (Monthly)
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={data.monthly_employment_trends}
              margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" interval={0} />
              <YAxis
                tickFormatter={(value) =>
                  new Intl.NumberFormat("en-US", {
                    notation: "compact",
                    compactDisplay: "short",
                  }).format(value as number)
                }
              />
              <Tooltip
                formatter={(value) => (value as number).toLocaleString()}
              />
              <Legend />
              <Line
                name="Employment"
                type="monotone"
                dataKey="value"
                stroke="#8884d8"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : yearlyChartData && yearlyChartData.length > 0 ? (
        <div>
          <h4 className="font-semibold my-2">Employment Trend</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={yearlyChartData}
              margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" interval={0} />
              <YAxis
                tickFormatter={(value) =>
                  new Intl.NumberFormat("en-US", {
                    notation: "compact",
                    compactDisplay: "short",
                  }).format(value as number)
                }
              />
              <Tooltip
                formatter={(value, name, props) => [
                  (props.payload.value as number).toLocaleString(),
                  "Employment",
                ]}
              />
              <Legend />
              <Line
                name="Actual"
                type="monotone"
                dataKey="actual"
                stroke="#8884d8"
                strokeWidth={2}
                connectNulls={false}
              />
              <Line
                name="Projected"
                type="monotone"
                dataKey="projected"
                stroke="#82ca9d"
                strokeWidth={2}
                strokeDasharray="5 5"
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

function MetricDisplay({
  title,
  value,
  unit = "",
  rating,
  helpText,
}: {
  title: string;
  value?: string | number;
  unit?: string;
  rating?: string;
  helpText?: string;
}) {
  if (value === undefined || value === null) return null;

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

  return (
    <div className="p-3 border rounded-md bg-background/50">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-xl font-semibold">
          {value}
          {unit}
        </span>
        {rating && (
          <Badge className={cn("text-xs", getRatingClass(rating))}>
            {rating}
          </Badge>
        )}
      </div>
      {helpText && (
        <div className="text-xs text-muted-foreground mt-1">{helpText}</div>
      )}
    </div>
  );
}

function CRESummaryDisplay({ summary }: { summary?: CRESummary }) {
  if (!summary) return null;
  return (
    <div className="p-4 border rounded-lg bg-secondary/50">
      <h3 className="font-semibold text-lg mb-3">CRE Investment Summary</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricDisplay
          title="Employment Growth"
          rating={summary.employment_growth_strength}
        />
        <MetricDisplay
          title="Wage Growth"
          rating={summary.wage_growth_strength}
        />
        <MetricDisplay
          title="Workforce Quality"
          rating={summary.workforce_quality}
        />
        <MetricDisplay
          title="Recession Resilience"
          rating={summary.recession_resilience}
        />
        <MetricDisplay
          title="vs. National Avg"
          rating={summary.vs_national_performance}
        />
      </div>
    </div>
  );
}

function JobGrowthModalContent({
  address,
  data,
  geoType,
}: {
  address: string;
  data: JobGrowthData;
  geoType: "tract" | "zip" | "county";
}) {
  const { granular_data, county_context, notes = [], geo, cre_summary } = data;
  const hasGranularData = granular_data && !granular_data.error;
  const hasCountyData = county_context && !county_context.error;

  return (
    <>
      <CardHeader className="pt-0 px-0">
        <CardTitle>{address}</CardTitle>
        <CardDescription>
          {geoType.toUpperCase()} Level Analysis &middot; {geo.lat.toFixed(4)},{" "}
          {geo.lon.toFixed(4)}
        </CardDescription>
      </CardHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        <div className="lg:col-span-2">
          <CRESummaryDisplay summary={cre_summary} />
        </div>
        <div className="space-y-6">
          {hasGranularData && (
            <DataDisplay
              data={granular_data}
              title={`${
                geoType.charAt(0).toUpperCase() + geoType.slice(1)
              } Level Data`}
            />
          )}
          {granular_data?.error && (
            <Alert variant="destructive">
              <AlertDescription>{granular_data.error}</AlertDescription>
            </Alert>
          )}

          {hasCountyData && geoType !== "county" && (
            <DataDisplay data={county_context} title="County Level Context" />
          )}
          {county_context?.error && (
            <Alert variant="destructive">
              <AlertDescription>{county_context.error}</AlertDescription>
            </Alert>
          )}
        </div>
        <div className="space-y-6">
          <div>
            <h4 className="font-semibold mb-2">Market Area</h4>
            <Map lat={geo.lat} lon={geo.lon} geoType={geoType} />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-semibold">Key Economic Indicators</h4>
            {hasCountyData &&
              county_context.wage_data &&
              !county_context.wage_data.error && (
                <MetricDisplay
                  title="Avg. Weekly Wage (County)"
                  value={county_context.wage_data.current_avg_weekly_wage?.toLocaleString(
                    "en-US",
                    {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }
                  )}
                  helpText={`1Y Growth: ${
                    county_context.wage_data.wage_growth?.["1y"] ?? "N/A"
                  }%`}
                />
              )}
            {hasGranularData &&
              granular_data.income_data &&
              !granular_data.income_data.error && (
                <MetricDisplay
                  title={`Median Household Income (${geoType})`}
                  value={granular_data.income_data.median_household_income?.toLocaleString(
                    "en-US",
                    {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }
                  )}
                  helpText={`Data from ${granular_data.income_data.data_year}`}
                />
              )}
            {hasGranularData &&
              granular_data.labor_participation &&
              !granular_data.labor_participation.error && (
                <MetricDisplay
                  title={`Labor Force Participation (${geoType})`}
                  value={
                    granular_data.labor_participation
                      .labor_force_participation_rate
                  }
                  unit="%"
                />
              )}
            {hasGranularData &&
              granular_data.education_data &&
              !granular_data.education_data.error && (
                <MetricDisplay
                  title={`College Educated Workforce (${geoType})`}
                  value={granular_data.education_data.percent_college_educated}
                  unit="%"
                  rating={granular_data.education_data.workforce_quality_rating}
                />
              )}
            {hasCountyData &&
              county_context.downturn_resilience &&
              !county_context.downturn_resilience.error && (
                <MetricDisplay
                  title="Recession Resilience Score"
                  value={county_context.downturn_resilience.resilience_score}
                  rating={county_context.downturn_resilience.resilience_rating}
                  helpText="0-100, higher is better"
                />
              )}
          </div>

          {notes.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
              <h4 className="font-semibold mb-2 text-sm text-foreground">
                Notes
              </h4>
              {notes.map((note, i) => (
                <p key={i}>* {note}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
