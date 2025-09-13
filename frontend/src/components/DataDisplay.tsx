"use client";

import React from "react";
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

import { Badge } from "@/components/ui/badge";
import { DataPayload } from "@/lib/types";

export function DataDisplay({
  data,
  title,
}: {
  data: DataPayload;
  title: string;
}) {
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
      const point: {
        year: number;
        value: number;
        actual: number | null;
        projected: number | null;
      } = {
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