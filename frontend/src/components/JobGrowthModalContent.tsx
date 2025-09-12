"use client";

import dynamic from "next/dynamic";

import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CRESummaryDisplay } from "@/components/CRESummaryDisplay";
import { DataDisplay } from "@/components/DataDisplay";
import { MetricDisplay } from "@/components/MetricDisplay";
import { JobGrowthData } from "@/lib/types";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
});

export function JobGrowthModalContent({
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

          {hasCountyData && (
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
                  source="BLS QCEW"
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
                  source="Census ACS"
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
                  source="Census ACS"
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
                  source="Census ACS"
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
                  source="BLS LAU (Annual)"
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