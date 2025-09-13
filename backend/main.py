import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from sqlalchemy.ext.asyncio import AsyncSession

# Add backend directory to path to allow absolute imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from core.config import limiter, CORS_ORIGINS
from core.cache import redis_client
from core.database import get_db
from db.models import ReportCache

from services.geo import geocode_address, get_fips_codes
from services.bls import (
    fetch_bls_lau_data,
    fetch_bls_qcew_sectors,
    fetch_national_employment_data,
    calculate_downturn_resilience,
)
from services.census import (
    fetch_census_data,
    fetch_acs_data,
    project_census_data,
)
from services.analysis import compare_local_to_national

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "Backend is running"}

@app.get("/api/job-growth")
@limiter.limit("10/minute")
async def get_job_growth(request: Request, address: str, geo_type: str = "tract", flush_cache: bool = False, db: AsyncSession = Depends(get_db)):
    cache_key = f"{address}:{geo_type}:v2"

    if flush_cache:
        await redis_client.delete(cache_key)
        db_report = await db.get(ReportCache, cache_key)
        if db_report:
            await db.delete(db_report)
            await db.commit()

    # 1. Check Redis (hot cache)
    cached = await redis_client.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            # Invalid cache, proceed
            pass

    # 2. Check Postgres (warm cache / persistence)
    db_report = await db.get(ReportCache, cache_key)
    if db_report:
        result = db_report.result
        await redis_client.setex(cache_key, 3600, json.dumps(result))
        return result

    try:
        # 3. If not found, fetch fresh data
        geo = await geocode_address(address)
        fips = await get_fips_codes(geo)

        county_fips = fips['state_fips'] + fips['county_fips'][2:]

        # Parallel fetches
        tasks = [
            fetch_bls_lau_data(county_fips),
            fetch_bls_qcew_sectors(county_fips), # Now fetches sectors and wages
            fetch_national_employment_data(),
            calculate_downturn_resilience(county_fips),
            fetch_census_data(fips, geo, geo_type), # Granular employment
            fetch_acs_data(fips, geo, geo_type) # Granular income, education, etc.
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        def get_result(index, default):
            return results[index] if not isinstance(results[index], Exception) else default

        lau_data = get_result(0, {"error": "Failed to fetch LAU data"})
        qcew_data = get_result(1, {"error": "Failed to fetch QCEW data"})
        national_data = get_result(2, {"error": "Failed to fetch national data"})
        resilience_data = get_result(3, {"error": "Failed to fetch resilience data"})
        census_emp_data = get_result(4, {"error": "Failed to fetch Census employment"})
        acs_other_data = get_result(5, {"error": "Failed to fetch ACS demographics"})

        projection_notes = []
        if geo_type in ['tract', 'zip'] and isinstance(census_emp_data, dict) and isinstance(lau_data, dict):
            census_emp_data, projection_notes = project_census_data(census_emp_data, lau_data)

        notes = []
        county_context = None
        if 'error' not in lau_data:
            comparative_performance = compare_local_to_national(lau_data.get('growth', {}), national_data)
            county_context = {
                "source": "BLS (Monthly/Quarterly)",
                **lau_data,
                **qcew_data,
                "downturn_resilience": resilience_data,
                "comparative_performance": comparative_performance,
            }
        elif lau_data.get("error"):
            county_context = {"error": lau_data["error"]}

        granular_data = None
        if isinstance(census_emp_data, dict) and 'error' not in census_emp_data:
            granular_data = {
                    "source": "Census ACS 5-Year (Annual)",
                    **census_emp_data,
                    **(acs_other_data if isinstance(acs_other_data, dict) else {}),
            }
            if geo_type in ['tract', 'zip']:
                notes.append("Granular data from Census is less timely (annual estimates) than county-level BLS data (monthly).")
                notes.append("Exact tract boundaries are not available. 1 mile radius shown for reference.")
            notes.extend(projection_notes)
        else:
            granular_data = {"error": census_emp_data.get("error") if isinstance(census_emp_data, dict) else "Unknown error"}

        # CRE Summary
        cre_summary = {
            "employment_growth_strength": "strong" if lau_data.get('growth', {}).get('1y', 0) > 2 else "moderate" if lau_data.get('growth', {}).get('1y', 0) > 0 else "weak",
            "wage_growth_strength": "strong" if qcew_data.get('wage_data', {}).get('wage_growth', {}).get('1y', 0) > 3 else "moderate" if qcew_data.get('wage_data', {}).get('wage_growth', {}).get('1y', 0) > 0 else "weak",
            "workforce_quality": acs_other_data.get('education_data', {}).get('workforce_quality_rating', 'Unknown') if acs_other_data and not acs_other_data.get("error") else "Unknown",
            "recession_resilience": resilience_data.get('resilience_rating', 'Unknown') if not resilience_data.get("error") else "Unknown",
            "vs_national_performance": "outperforming" if any(v.get('outperforming', False) for v in county_context.get("comparative_performance", {}).values()) else "underperforming",
        }

        result = {
            "geo": {**geo, **fips},
            "county_context": county_context,
            "granular_data": granular_data,
            "cre_summary": cre_summary,
            "notes": notes,
        }

        # 4. Persist and cache the new data
        db_report_to_save = await db.get(ReportCache, cache_key)
        if db_report_to_save:
            db_report_to_save.result = result
        else:
            db_report_to_save = ReportCache(cache_key=cache_key, result=result)
            db.add(db_report_to_save)
        await db.commit()

        await redis_client.setex(cache_key, 3600, json.dumps(result))

        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
