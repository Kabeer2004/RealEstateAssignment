export interface Growth {
  "6mo"?: number;
  "1y"?: number;
  "2y"?: number;
  "5y"?: number;
}

export interface Sector {
  name: string;
  growth: number;
}

export interface WageData {
  current_avg_weekly_wage?: number;
  annual_equivalent?: number;
  wage_growth?: { "1y"?: number; "3y"?: number; "5y"?: number };
  error?: string;
}

export interface ComparativePerformance {
  [key: string]: {
    local_rate: number;
    national_rate: number;
    difference: number;
    outperforming: boolean;
    performance_description: string;
  };
}

export interface DownturnResilience {
  covid_impact?: { job_loss_percent: number };
  great_recession_impact?: { job_loss_percent: number };
  resilience_score?: number;
  resilience_rating?: "High" | "Moderate" | "Low";
  error?: string;
}

export interface IncomeData {
  median_household_income?: number;
  data_year?: number;
  error?: string;
}

export interface LaborParticipation {
  labor_force_participation_rate?: number;
  data_year?: number;
  error?: string;
}

export interface EducationData {
  percent_college_educated?: number;
  workforce_quality_rating?: "High" | "Moderate" | "Low";
  data_year?: number;
  error?: string;
}

export interface CRESummary {
  employment_growth_strength: "strong" | "moderate" | "weak";
  wage_growth_strength: "strong" | "moderate" | "weak";
  workforce_quality: "High" | "Moderate" | "Low" | "Unknown";
  recession_resilience: "High" | "Moderate" | "Low" | "Unknown";
  vs_national_performance: "outperforming" | "underperforming";
}

export interface DataPayload {
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

export interface JobGrowthData {
  geo: { lat: number; lon: number };
  county_context?: DataPayload;
  granular_data?: DataPayload;
  cre_summary: CRESummary;
  notes: string[];
}