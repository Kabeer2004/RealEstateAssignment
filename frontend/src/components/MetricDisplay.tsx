"use client";

import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

export function MetricDisplay({
  title,
  value,
  unit = "",
  rating,
  helpText,
  source,
}: {
  title: string;
  value?: string | number;
  unit?: string;
  rating?: string;
  helpText?: string;
  source?: string;
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
      {(helpText || source) && (
        <div className="flex justify-between items-center mt-1 text-xs text-muted-foreground">
          <span>{helpText}</span>
          <span className="font-medium">{source}</span>
        </div>
      )}
    </div>
  );
}