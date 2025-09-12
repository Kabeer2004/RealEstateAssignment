from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import asyncio
import redis.asyncio as redis
from datetime import date
import os
import json
from collections import defaultdict
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load .env
load_dotenv()

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

BLS_API_KEY = os.getenv("BLS_API_KEY")
CENSUS_API_KEY = os.getenv("CENSUS_API_KEY")

# CORS (Cross-Origin Resource Sharing)
origins = [
    "http://localhost:3000",  # Allow Next.js dev server
    # Add your deployed frontend URL here later
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_password = os.getenv("REDIS_PASSWORD")
redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True, password=redis_password)

class AddressInput(BaseModel):
    address: str
    geo_type: str = "tract"

async def geocode_address(address: str) -> dict:
    async with aiohttp.ClientSession() as session:
        url = f"https://nominatim.openstreetmap.org/search?q={address}&format=json&addressdetails=1"
        async with session.get(url) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="Geocoding failed")
            data = await resp.json()
            if not data:
                raise HTTPException(status_code=404, detail="Address not found by geocoder.")
            addr = data[0]['address']
            return {
                "lat": float(data[0]['lat']),
                "lon": float(data[0]['lon']),
                "zip": addr.get('postcode')
            }

async def get_fips_codes(geo: dict) -> dict:
    lat, lon = geo['lat'], geo['lon']
    url = f"https://geo.fcc.gov/api/census/block/find?latitude={lat}&longitude={lon}&format=json&showall=true"
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=424, detail="Failed to retrieve FIPS codes from FCC API.")
            data = await resp.json()
            if not data.get('County') or not data.get('State'):
                raise HTTPException(status_code=404, detail="FIPS codes not found for the given address.")
            block_fips = data['Block']['FIPS']
            return {
                "state_fips": data['State']['FIPS'],
                "county_fips": data['County']['FIPS'],
                "tract_code": block_fips[:11]  # state + county + tract
            }

async def fetch_bls_lau_data(county_fips: str) -> dict:
    emp_series = f"LAUCN{county_fips}0000000005"  # Employed persons
    unemp_rate_series = f"LAUCN{county_fips}0000000003"  # Unemployment rate
    labor_series = f"LAUCN{county_fips}0000000006"  # Labor force

    current_year = date.today().year
    start_year = str(current_year - 6)  # For 5y trends
    end_year = str(current_year)

    headers = {'Content-type': 'application/json'}
    payload = json.dumps({
        "seriesid": [emp_series, unemp_rate_series, labor_series],
        "startyear": start_year,
        "endyear": end_year,
        "registrationkey": BLS_API_KEY,
        "catalog": False,
        "calculations": True,
        "annualaverage": False
    })

    async with aiohttp.ClientSession() as session:
        url = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
        async with session.post(url, data=payload, headers=headers) as resp:
            if resp.status != 200:
                return {"error": f"BLS LAU request failed with status {resp.status}"}
            result = await resp.json()
            if result.get('status') != 'REQUEST_SUCCEEDED':
                return {"error": result.get('message', ["Unknown error"])[0]}

            series = result.get('Results', {}).get('series', [])
            if not series:
                return {"error": "No LAU data found for this location."}

            emp_data = series[0]['data']
            unemp_data = series[1]['data']
            labor_data = series[2]['data']

            if not emp_data:
                return {"error": "No employment data available."}

            # BLS returns recent first; confirm sorted desc
            emp_data = sorted(emp_data, key=lambda d: (d['year'], d['period']), reverse=True)
            latest_emp = int(emp_data[0]['value'])

            # Compute % change over periods (total %; adjust to annualized if needed)
            def get_growth(data, steps):
                if len(data) > steps:
                    ago_value = int(data[steps]['value'])
                    if ago_value == 0:
                        return float('inf') if latest_emp > 0 else 0
                    return round(((latest_emp - ago_value) / ago_value) * 100, 2)
                return None

            growth = {
                "6mo": get_growth(emp_data, 5),  # 6 months back
                "1y": get_growth(emp_data, 11),
                "2y": get_growth(emp_data, 23),
                "5y": get_growth(emp_data, 59)
            }

        current_unemp = float(unemp_data[0]['value']) if unemp_data else None
        current_labor = int(labor_data[0]['value']) if labor_data else None

        # Monthly trends for chart
        monthly_trends = [
            {
                "year": d['year'],
                "month": d['periodName'],
                "value": int(d['value']),
                "label": f"{d['periodName'][:3]}-{d['year'][2:]}"
            }
            for d in emp_data[:6]
        ]
        monthly_trends.reverse()  # For charting in ascending order


        # Trends: Yearly averages
        from collections import defaultdict
        def calculate_yearly_trends(data_series):
            yearly_data = defaultdict(list)
            for d in data_series:
                try:
                    yearly_data[d['year']].append(float(d['value']))
                except (ValueError, TypeError):
                    continue
            return [{"year": int(y), "value": sum(vals) / len(vals)} for y, vals in sorted(yearly_data.items(), reverse=True)]

        emp_trends = calculate_yearly_trends(emp_data)
        unemp_rate_trends = calculate_yearly_trends(unemp_data)
        labor_force_trends = calculate_yearly_trends(labor_data)

        return {
            "growth": growth,
            "total_jobs": latest_emp,
            "unemployment_rate": current_unemp,
            "labor_force": current_labor,
            "trends": emp_trends, # For backward compatibility
            "employment_trends": emp_trends,
            "unemployment_rate_trends": unemp_rate_trends,
            "labor_force_trends": labor_force_trends,
            "monthly_employment_trends": monthly_trends,
        }

async def fetch_bls_qcew_sectors(county_fips: str) -> dict:
    """
    Fetches top growing sectors and average weekly wage data from BLS QCEW.
    """
    major_sectors = {
        '23': 'Construction',
        '31': 'Manufacturing', # Note: BLS uses 31-33 for manufacturing supersector
        '42': 'Wholesale Trade',
        '44': 'Retail Trade', # Note: 44-45 for retail
        '48': 'Transportation and Warehousing', # 48-49
        '51': 'Information',
        '52': 'Finance and Insurance',
        '53': 'Real Estate and Rental',
        '54': 'Professional and Technical Services',
        '56': 'Admin and Support Services',
        '61': 'Educational Services',
        '62': 'Health Care and Social Assistance',
        '72': 'Accommodation and Food Services',
    }

    # Series for sectors (Private Employment) and total average weekly wage
    sector_series_ids = [f"ENU{county_fips}105{naics}" for naics in major_sectors.keys()]
    wage_series_id = f"ENU{county_fips}11510" # Avg weekly wage, private, all industries
    series_ids = sector_series_ids + [wage_series_id]

    current_year = date.today().year
    start_year = str(current_year - 6) # Go back further for wage trends
    end_year = str(current_year - 1)  # QCEW has a 6-month lag, so last full year is safest

    headers = {'Content-type': 'application/json'}
    payload = json.dumps({
        "seriesid": series_ids,
        "startyear": start_year,
        "endyear": end_year,
        "registrationkey": BLS_API_KEY,
        "calculations": True,
        "annualaverage": True
    })

    async with aiohttp.ClientSession() as session:
        url = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
        async with session.post(url, data=payload, headers=headers) as resp:
            if resp.status != 200:
                return {"error": f"QCEW API error {resp.status}"}
            result = await resp.json()
            if result.get('status') != 'REQUEST_SUCCEEDED':
                return {"error": result.get('message', ['Unknown QCEW error'])[0]}

            series = result.get('Results', {}).get('series', [])
            sector_growth = []
            wage_data_raw = None

            for s in series:
                series_id = s['seriesID']
                if series_id == wage_series_id:
                    wage_data_raw = sorted(s.get('data', []), key=lambda d: d['year'], reverse=True)
                    continue

                if not s.get('data'):
                    continue

                industry_code = series_id[11:]
                industry_name = major_sectors.get(industry_code, f'Industry {industry_code}')
                data = sorted(s.get('data', []), key=lambda d: d['year'], reverse=True)

                if data and data[0].get('calculations') and data[0]['calculations'].get('pct_changes'):
                    if '12' in data[0]['calculations']['pct_changes']:
                        growth_rate = float(data[0]['calculations']['pct_changes']['12'])
                        sector_growth.append((growth_rate, industry_name))

            top_sectors = sorted(sector_growth, key=lambda x: x[0], reverse=True)[:3]

            # Process wage data
            wage_info = {"error": "No wage data available"}
            if wage_data_raw:
                latest_wage = float(wage_data_raw[0]['value'])
                def get_wage_growth(years_back):
                    if len(wage_data_raw) > years_back:
                        old_wage = float(wage_data_raw[years_back]['value'])
                        if old_wage > 0:
                            return round(((latest_wage - old_wage) / old_wage) * 100, 2)
                    return None
                wage_info = {
                    "current_avg_weekly_wage": latest_wage,
                    "annual_equivalent": round(latest_wage * 52, 0),
                    "wage_growth": {
                        "1y": get_wage_growth(1),
                        "3y": get_wage_growth(3),
                        "5y": get_wage_growth(5)
                    }
                }

            return {
                "top_sectors_growing": [{"name": name, "growth": growth} for growth, name in top_sectors],
                "wage_data": wage_info
            }

async def fetch_national_employment_data() -> dict:
    """Get national employment data for comparison."""
    national_series = "LNS12000000" # Civilian employment level, seasonally adjusted
    current_year = date.today().year
    start_year = str(current_year - 6)
    end_year = str(current_year)
    payload = json.dumps({"seriesid": [national_series], "startyear": start_year, "endyear": end_year, "registrationkey": BLS_API_KEY})
    headers = {'Content-type': 'application/json'}

    async with aiohttp.ClientSession() as session:
        url = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
        async with session.post(url, data=payload, headers=headers) as resp:
            if resp.status != 200: return {"error": f"Failed to fetch national data: {resp.status}"}
            result = await resp.json()
            if result.get('status') != 'REQUEST_SUCCEEDED': return {"error": result.get('message', ['Unknown'])[0]}
            series = result.get('Results', {}).get('series', [])
            if not series or not series[0].get('data'): return {"error": "No national employment data"}

            data = sorted(series[0]['data'], key=lambda d: (d['year'], d['period']), reverse=True)
            latest_emp = int(data[0]['value']) * 1000

            def get_national_growth(months_back):
                if len(data) > months_back:
                    old_emp = int(data[months_back]['value']) * 1000
                    if old_emp > 0: return round(((latest_emp - old_emp) / old_emp) * 100, 2)
                return None

            return {
                "national_growth": {
                    "1y": get_national_growth(11),
                    "2y": get_national_growth(23),
                    "5y": get_national_growth(59)
                }
            }

def compare_local_to_national(local_growth: dict, national_data: dict) -> dict:
    """Compare local growth rates to national averages."""
    comparison = {}
    national_growth = national_data.get("national_growth", {})
    for period in ["1y", "2y", "5y"]:
        local_rate = local_growth.get(period)
        national_rate = national_growth.get(period)
        if local_rate is not None and national_rate is not None:
            difference = round(local_rate - national_rate, 2)
            outperforming = local_rate > national_rate
            comparison[period] = {
                "local_rate": local_rate,
                "national_rate": national_rate,
                "difference": difference,
                "outperforming": outperforming,
                "performance_description": f"{'Outperforming' if outperforming else 'Underperforming'} national average by {abs(difference):.1f} p.p."
            }
    return comparison

async def calculate_downturn_resilience(county_fips: str) -> dict:
    """Calculate job losses during COVID-19 and Great Recession."""
    series_id = f"LAUCN{county_fips}0000000005"
    headers = {'Content-type': 'application/json'}
    payload = json.dumps({"seriesid": [series_id], "startyear": "2007", "endyear": str(date.today().year), "registrationkey": BLS_API_KEY, "annualaverage": True})

    async with aiohttp.ClientSession() as session:
        url = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
        async with session.post(url, data=payload, headers=headers) as resp:
            if resp.status != 200: return {"error": "Failed to fetch resilience data"}
            result = await resp.json()
            if result.get('status') != 'REQUEST_SUCCEEDED': return {"error": "No resilience data"}
            data = {int(d['year']): int(d['value']) for d in result['Results']['series'][0]['data']}

    resilience = {}
    # COVID: 2019 peak to 2020 trough
    if 2019 in data and 2020 in data:
        loss = round(((data[2020] - data[2019]) / data[2019]) * 100, 2)
        resilience["covid_impact"] = {"job_loss_percent": loss}
    # GFC: 2007 peak to 2009 trough
    if 2007 in data and 2009 in data:
        loss = round(((data[2009] - data[2007]) / data[2007]) * 100, 2)
        resilience["great_recession_impact"] = {"job_loss_percent": loss}

    if resilience:
        avg_loss = sum(abs(r["job_loss_percent"]) for r in resilience.values()) / len(resilience)
        score = max(0, min(100, 100 - (avg_loss * 5)))
        resilience["resilience_score"] = round(score, 1)
        resilience["resilience_rating"] = "High" if score > 70 else "Moderate" if score > 50 else "Low"

    return resilience

async def fetch_acs_data(fips: dict, geo: dict, geo_type: str) -> dict:
    """Fetches multiple key metrics from ACS in a single call."""
    state = fips['state_fips']
    county = fips['county_fips'][2:]
    tract = fips.get('tract_code', '')[5:] if 'tract_code' in fips else None
    zip_code = geo.get('zip')

    # Variables: Median Income, Labor Force Participation, Education
    get_vars = "B19013_001E," # Median HH Income
    get_vars += "B23025_001E,B23025_002E," # Pop 16+, Civilian Labor Force
    get_vars += "B15003_001E,B15003_022E,B15003_023E,B15003_024E,B15003_025E" # Pop 25+, Bachelors, Masters, Prof, PhD

    if geo_type == "tract" and tract:
        for_clause = f"tract:{tract}"
        in_clause = f"state:{state} county:{county}"
    elif geo_type == "zip" and zip_code:
        for_clause = f"zip code tabulation area:{zip_code}"
        in_clause = ""
    else: # County or invalid
        return {"error": "ACS data is for granular geographies only"}

    year = 2022 # Latest reliable ACS 5-year data
    url = f"https://api.census.gov/data/{year}/acs/acs5?get={get_vars}&for={for_clause}"
    if in_clause: url += f"&in={in_clause}"
    if CENSUS_API_KEY: url += f"&key={CENSUS_API_KEY}"

    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status != 200: return {"error": "Failed to fetch ACS data"}
            data = await resp.json()
            if len(data) < 2: return {"error": "No ACS data available"}
            row = [int(v) if v and v.isdigit() else 0 for v in data[1]]

    # Parse results
    income_data = {"median_household_income": row[0], "data_year": year}

    pop_16, labor_force = row[1], row[2]
    participation_rate = round((labor_force / pop_16) * 100, 2) if pop_16 > 0 else 0
    participation_data = {"labor_force_participation_rate": participation_rate, "data_year": year}

    pop_25, bachelors, masters, prof, phd = row[3], row[4], row[5], row[6], row[7]
    college_plus = bachelors + masters + prof + phd
    college_pct = round((college_plus / pop_25) * 100, 2) if pop_25 > 0 else 0
    education_data = {
        "percent_college_educated": college_pct,
        "workforce_quality_rating": "High" if college_pct > 35 else "Moderate" if college_pct > 25 else "Low",
        "data_year": year
    }

    return {
        "income_data": income_data,
        "labor_participation": participation_data,
        "education_data": education_data
    }

async def fetch_census_data(fips: dict, geo: dict, geo_type: str) -> dict:
    state = fips['state_fips']
    county = fips['county_fips'][2:]
    tract = fips['tract_code'][5:] if 'tract_code' in fips else None  # Tract part after county
    zip_code = geo.get('zip')

    trends = []
    for year in range(2018, 2024):
        get_vars = "B23025_004E,B23025_005E,B23025_003E"  # Employed, Unemployed, Civilian Labor Force
        if geo_type == "tract" and tract:
            for_clause = f"tract:{tract}"
            in_clause = f"state:{state} county:{county}"
        elif geo_type == "zip" and zip_code:
            for_clause = f"zip code tabulation area:{zip_code}"
            in_clause = ""
        elif geo_type == "county":
            for_clause = f"county:{county}"
            in_clause = f"state:{state}"
        else:
            return {"trends": [], "error": "Invalid geo_type for Census"}

        url = f"https://api.census.gov/data/{year}/acs/acs5?get={get_vars}&for={for_clause}"
        if in_clause:
            url += f"&in={in_clause}"
        if CENSUS_API_KEY:
            url += f"&key={CENSUS_API_KEY}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    continue
                data = await resp.json()
                if len(data) < 2 or any(v is None for v in data[1][:3]):
                    continue
                employed, unemployed, labor = map(int, data[1][:3])
                unemp_rate = round((unemployed / labor * 100) if labor > 0 else 0, 2)
                trends.append({"year": year, "value": employed, "unemp_rate": unemp_rate, "labor_force": labor})

    trends = sorted(trends, key=lambda x: x['year'], reverse=True)
    if not trends:
        return {"trends": [], "error": "No Census data available"}

    latest_emp = trends[0]['value']
    growth = {}
    if len(trends) > 1:
        growth['1y'] = round(((latest_emp - trends[1]['value']) / trends[1]['value']) * 100, 2) if trends[1]['value'] > 0 else None
    if len(trends) > 2:
        growth['2y'] = round(((latest_emp - trends[2]['value']) / trends[2]['value']) * 100, 2) if trends[2]['value'] > 0 else None
    if len(trends) > 5:
        growth['5y'] = round(((latest_emp - trends[5]['value']) / trends[5]['value']) * 100, 2) if trends[5]['value'] > 0 else None

    return {
        "growth": growth,
        "total_jobs": latest_emp,
        "unemployment_rate": trends[0]['unemp_rate'],
        "labor_force": trends[0]['labor_force'],
        "trends": trends
    }
def project_census_data(census_data, county_lau_data):
    if not census_data or census_data.get("error") or not census_data.get("trends"):
        return census_data, []
    if not county_lau_data or county_lau_data.get("error"):
        return census_data, []

    census_trends = census_data["trends"]
    last_census_year = census_trends[0]['year']
    last_census_datapoint = census_trends[0]

    county_emp_trends = {t['year']: t['value'] for t in county_lau_data.get("employment_trends", [])}
    county_labor_trends = {t['year']: t['value'] for t in county_lau_data.get("labor_force_trends", [])}

    latest_county_year = 0
    if county_emp_trends:
        latest_county_year = max(county_emp_trends.keys())

    if latest_county_year <= last_census_year:
        return census_data, []

    # Calculate county growth rates
    county_emp_growth = {}
    sorted_emp_years = sorted(county_emp_trends.keys())
    for i in range(1, len(sorted_emp_years)):
        year = sorted_emp_years[i]
        prev_year = sorted_emp_years[i-1]
        if county_emp_trends.get(prev_year, 0) > 0:
            growth = (county_emp_trends[year] - county_emp_trends[prev_year]) / county_emp_trends[prev_year]
            county_emp_growth[year] = growth

    county_labor_growth = {}
    sorted_labor_years = sorted(county_labor_trends.keys())
    for i in range(1, len(sorted_labor_years)):
        year = sorted_labor_years[i]
        prev_year = sorted_labor_years[i-1]
        if county_labor_trends.get(prev_year, 0) > 0:
            growth = (county_labor_trends[year] - county_labor_trends[prev_year]) / county_labor_trends[prev_year]
            county_labor_growth[year] = growth

    projected_trends = []
    last_known_employed = last_census_datapoint['value']
    last_known_labor = last_census_datapoint['labor_force']

    for year_to_project in range(last_census_year + 1, latest_county_year + 1):
        emp_growth_rate = county_emp_growth.get(year_to_project, 0)
        labor_growth_rate = county_labor_growth.get(year_to_project, 0)

        projected_employed = last_known_employed * (1 + emp_growth_rate)
        projected_labor = last_known_labor * (1 + labor_growth_rate)

        projected_unemployed = projected_labor - projected_employed
        projected_unemp_rate = round((projected_unemployed / projected_labor) * 100, 2) if projected_labor > 0 else 0

        projected_trends.append({
            "year": year_to_project,
            "value": round(projected_employed),
            "unemp_rate": projected_unemp_rate,
            "labor_force": round(projected_labor),
            "projected": True
        })

        last_known_employed = projected_employed
        last_known_labor = projected_labor

    if not projected_trends:
        return census_data, []

    all_trends = census_trends + projected_trends
    all_trends.sort(key=lambda x: x['year'], reverse=True)

    latest_data = all_trends[0]
    census_data['total_jobs'] = latest_data['value']
    census_data['unemployment_rate'] = latest_data['unemp_rate']
    census_data['labor_force'] = latest_data['labor_force']

    latest_emp = latest_data['value']
    growth = {}
    trends_by_year = {t['year']: t['value'] for t in all_trends}
    for y in [1, 2, 5]:
        prev_year_val = trends_by_year.get(latest_data['year'] - y)
        if prev_year_val and prev_year_val > 0:
            growth[f'{y}y'] = round(((latest_emp - prev_year_val) / prev_year_val) * 100, 2)
    census_data['growth'] = growth
    census_data['trends'] = all_trends

    projection_note = "Recent years' data for this geography are projected based on county-level trends from BLS."
    return census_data, [projection_note]

@app.get("/")
def read_root():
    return {"status": "Backend is running"}

@app.get("/api/job-growth")
@limiter.limit("10/minute")
async def get_job_growth(request: Request, address: str, geo_type: str = "tract", flush_cache: bool = False):
    cache_key = f"{address}:{geo_type}:v2"

    if flush_cache:
        await redis_client.delete(cache_key)

    cached = await redis_client.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            # Invalid cache, proceed to fetch
            pass

    try:
        geo = await geocode_address(address)
        fips = await get_fips_codes(geo)

        county_fips = fips['state_fips'] + fips['county_fips'][2:]

        # Parallel fetches
        tasks = [
            fetch_bls_lau_data(county_fips),
            fetch_bls_qcew_sectors(county_fips), # Now fetches sectors and wages
            fetch_national_employment_data(),
            calculate_downturn_resilience(county_fips),
        ]

        granular_tasks_added = False
        if geo_type in ['tract', 'zip']:
            tasks.extend([
                fetch_census_data(fips, geo, geo_type), # Granular employment
                fetch_acs_data(fips, geo, geo_type) # Granular income, education, etc.
            ])
            granular_tasks_added = True

        results = await asyncio.gather(*tasks, return_exceptions=True)

        def get_result(index, default):
            return results[index] if not isinstance(results[index], Exception) else default

        lau_data = get_result(0, {"error": "Failed to fetch LAU data"})
        qcew_data = get_result(1, {"error": "Failed to fetch QCEW data"})
        national_data = get_result(2, {"error": "Failed to fetch national data"})
        resilience_data = get_result(3, {"error": "Failed to fetch resilience data"})

        census_emp_data = None
        acs_other_data = None
        if granular_tasks_added:
            census_emp_data = get_result(4, {"error": "Failed to fetch Census employment"})
            acs_other_data = get_result(5, {"error": "Failed to fetch ACS demographics"})

        projection_notes = []
        if granular_tasks_added and isinstance(census_emp_data, dict) and isinstance(lau_data, dict):
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
        if granular_tasks_added:
            if isinstance(census_emp_data, dict) and 'error' not in census_emp_data:
                granular_data = {
                        "source": "Census ACS 5-Year (Annual)",
                        **census_emp_data,
                        **(acs_other_data if isinstance(acs_other_data, dict) else {}),
                }
                notes.append("Granular data from Census is less timely (annual estimates) than county-level BLS data (monthly).")
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

        if geo_type == 'county' and county_context:
            granular_data = county_context
            county_context = None

        result = {
            "geo": {**geo, **fips},
            "county_context": county_context,
            "granular_data": granular_data,
            "cre_summary": cre_summary,
            "notes": notes,
        }
        await redis_client.setex(cache_key, 3600, json.dumps(result))
        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
