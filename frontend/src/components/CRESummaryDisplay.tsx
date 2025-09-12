"use client";

import { CRESummary } from "@/lib/types";
import { MetricDisplay } from "./MetricDisplay";

export function CRESummaryDisplay({ summary }: { summary?: CRESummary }) {
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