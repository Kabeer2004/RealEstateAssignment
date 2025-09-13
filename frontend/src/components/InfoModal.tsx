"use client";

import { Modal } from "@/components/ui/modal";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InfoModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-2xl">About The Data</CardTitle>
        <CardDescription className="text-xl mb-4">
          Understanding the sources, methodologies, and interpretations behind
          the market analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="font-semibold text-lg mb-2">
            Data Sources & Rationale
          </h3>
          <div className="text-sm text-muted-foreground space-y-4">
            <p>
              To provide timely and granular job market data for any US address,
              we primarily use two datasets from the U.S. Bureau of Labor
              Statistics (BLS), supplemented by Census data for hyper-local
              analysis.
            </p>
            <div>
              <h4 className="font-medium text-foreground">
                1. BLS Local Area Unemployment Statistics (LAU)
              </h4>
              <p>
                - <span className="font-semibold">What it is:</span> Monthly
                data on total employment, unemployment rates, and labor force
                size.
                <br />- <span className="font-semibold">Why we use it:</span> It
                offers excellent timeliness (usually last months data) and
                complete coverage for all 3,000+ U.S. counties, making it the
                bedrock for county-level job growth trends.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-foreground">
                2. BLS Quarterly Census of Employment and Wages (QCEW)
              </h4>
              <p>
                - <span className="font-semibold">What it is:</span> A
                near-census of jobs and wages from unemployment insurance tax
                records.
                <br />- <span className="font-semibold">
                  Why we use it:
                </span>{" "}
                While slightly less timely (quarterly, with a 3-6 month lag),
                QCEW provides crucial data on job growth by specific industry
                sector (e.g., Healthcare, Construction) and wage trends. This is
                vital for understanding the drivers of the local economy.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-foreground">
                3. Census American Community Survey (ACS)
              </h4>
              <p>
                - <span className="font-semibold">What it is:</span> Annual
                5-year estimates on demographics, including employment, income,
                and education.
                <br />- <span className="font-semibold">
                  Why we use it:
                </span>{" "}
                ACS is the source for data at the Census Tract and ZIP code
                level. It also provides key metrics like median household income
                and educational attainment, which are not available in the
                monthly BLS datasets. Its main drawback is timeliness.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-semibold text-lg mb-2">
            Projection Methodology for Tract & ZIP Data
          </h3>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              Census ACS data is released annually, meaning the latest data for
              a tract or ZIP code can be up to 1-2 years old. To provide a more
              current estimate, we project this granular data forward using the
              more timely county-level trends from the BLS.
            </p>
            <div className="p-3 bg-secondary rounded-md space-y-3">
              <p className="font-mono text-center text-foreground text-xs sm:text-sm">
                Projected_Jobs(Year) = Last_Known_Jobs × (1 +
                County_Growth_Rate)
              </p>
              <div>
                <h5 className="font-semibold text-foreground">
                  Let&apos;s break it down:
                </h5>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>
                    <span className="font-medium text-foreground">
                      Last_Known_Jobs:
                    </span>{" "}
                    This is the most recent actual employment number for the
                    small geography (e.g., Census Tract) from the latest Census
                    ACS data. This is our starting point or
                    &quot;baseline.&quot;
                  </li>
                  <li>
                    <span className="font-medium text-foreground">
                      County_Growth_Rate:
                    </span>{" "}
                    This is the percentage change in employment for the entire
                    county over the more recent period (e.g., the last year),
                    calculated from the timely BLS data.
                  </li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold text-foreground">Example:</h5>
                <p>
                  If the last actual data for a Census Tract was{" "}
                  <strong>500 jobs</strong> in 2022, and the surrounding county{" "}
                  saw a job growth of <strong>3%</strong> during 2023, we
                  project the tract&apos;s 2023 employment as:
                  <br />
                  <span className="font-mono text-foreground">
                    500 × (1 + 0.03) = 515 jobs.
                  </span>
                </p>
              </div>
            </div>
            <p>
              This assumes that the smaller geography (tract) grows at a similar
              rate to the larger county it resides in. This is a standard
              estimation technique to bridge data gaps, providing a directional
              and timely view where official data does not yet exist.
            </p>
          </div>
        </section>

        <section>
          <h3 className="font-semibold text-lg mb-2">
            How These Metrics Influence Real Estate Decisions
          </h3>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              Each data point is a signal for underlying real estate demand:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-semibold text-foreground">
                  Job Growth:
                </span>{" "}
                The primary driver of demand. More jobs mean more people,
                leading to higher demand for housing (multifamily,
                single-family), office space, and retail services.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Wage Growth:
                </span>{" "}
                Indicates rising purchasing power, which supports higher rents
                and home prices, and boosts consumer spending at retail
                locations.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Top Growing Sectors:
                </span>{" "}
                Highlights which types of commercial real estate are in demand.
                A boom in &quot;Health Care&quot; signals a need for medical
                office buildings; growth in &quot;Professional Services&quot;
                supports office demand.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Workforce Quality:
                </span>{" "}
                A high percentage of college-educated residents attracts
                high-paying employers, driving demand for Class A office and
                premium housing.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Recession Resilience:
                </span>{" "}
                Markets that have historically weathered economic downturns
                better are considered lower-risk, more stable investments.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h3 className="font-semibold text-lg mb-2">
            Alternative & Paid Data Sources
          </h3>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              For institutional-grade analysis, teams often supplement public
              data with paid, proprietary sources that offer deeper insights,{" "}
              such as:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-semibold text-foreground">CoStar:</span>{" "}
                Comprehensive property-level data, rent and sales comps, and
                market analytics.{" "}
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Moody&apos;s Analytics CRE (formerly REIS):
                </span>{" "}
                Detailed market and submarket forecasts for rents, vacancies,
                and property values.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Placer.ai:
                </span>{" "}
                Uses location data from mobile devices to provide foot traffic
                analysis for retail and other properties.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Green Street:
                </span>{" "}
                REIT research and commercial property price indices.
              </li>
            </ul>
          </div>
        </section>
      </CardContent>
    </Modal>
  );
}
