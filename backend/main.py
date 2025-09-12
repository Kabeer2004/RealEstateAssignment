from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import asyncio
import redis.asyncio as redis
from datetime import date
import os
import json
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

async def fetch_bls_qcew_sectors(county_fips: str) -> list:
    # Major NAICS 2-digit sectors (private ownership)
    major_sectors = {
        '11': 'Agriculture',
        '21': 'Mining',
        '22': 'Utilities',
        '23': 'Construction',
        '31': 'Manufacturing',
        '42': 'Wholesale Trade',
        '44': 'Retail Trade',
        '48': 'Transportation and Warehousing',
        '51': 'Information',
        '52': 'Finance and Insurance',
        '53': 'Real Estate',
        '54': 'Professional Services',
        '55': 'Management of Companies',
        '56': 'Administrative Support',
        '61': 'Education Services',
        '62': 'Health Care',
        '71': 'Arts and Entertainment',
        '72': 'Accommodation and Food Services',
        '81': 'Other Services',
        '92': 'Public Administration'
    }

    # Series format: ENU + county_fips (5 digits) + '05' (datatype 5 avg monthly emp, size 0) + naics2
    series_ids = [f"ENU{county_fips}05{naics}" for naics in major_sectors.keys()]

    current_year = date.today().year
    start_year = str(current_year - 2)
    end_year = str(current_year)

    headers = {'Content-type': 'application/json'}
    payload = json.dumps({
        "seriesid": series_ids,
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
            if resp.status != 200: # Fallback
                return []
            result = await resp.json()
            if result.get('status') != 'REQUEST_SUCCEEDED':
                return []

            series = result.get('Results', {}).get('series', [])

            sector_growth = []
            for i, s in enumerate(series):
                data = s['data']
                if len(data) < 5:  # Need at least 1y back (4 quarters prior)
                    continue
                try:
                    latest = int(data[0]['value'])
                    prior_year_same_q = int(data[4]['value'])
                except ValueError:
                    continue # Skip if value is not an integer (e.g. '-')

                if prior_year_same_q and prior_year_same_q > 0:
                    yoy = round(((latest - prior_year_same_q) / prior_year_same_q) * 100, 2)
                    naics = list(major_sectors.keys())[i]
                    sector_growth.append((yoy, major_sectors[naics]))

            # Top 3 by YoY growth
            top = sorted(sector_growth, key=lambda x: x[0], reverse=True)[:3]
            return [{"name": name, "growth": growth} for growth, name in top]

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
    cache_key = f"{address}:{geo_type}"

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
            fetch_bls_qcew_sectors(county_fips),
        ]

        census_task_added = False
        if geo_type in ['tract', 'zip']:
            tasks.append(fetch_census_data(fips, geo, geo_type))
            census_task_added = True

        results = await asyncio.gather(*tasks)
        # Extract results based on whether census_task was added
        lau_data = results[0]
        top_sectors = results[1]
        census_data = results[2] if census_task_added else None

        projection_notes = []
        if census_task_added and isinstance(census_data, dict) and isinstance(lau_data, dict):
            census_data, projection_notes = project_census_data(census_data, lau_data)

        notes = []
        county_context = None
        if 'error' not in lau_data:
            county_context = {
                "source": "BLS (Monthly)",
                **lau_data,
                "top_sectors_growing": top_sectors,
            }
        elif lau_data.get("error"):
            county_context = {"error": lau_data["error"]}

        granular_data = None
        if isinstance(census_data, dict):
            if 'error' not in census_data:
                granular_data = {
                        "source": "Census ACS 5-Year (Annual)",
                        **census_data,
                    "top_sectors_growing": [],  # Census fetch doesn't do sectors yet
                }
                notes.append("Granular data from Census is less timely (annual estimates) than county-level BLS data (monthly).")
                notes.extend(projection_notes)
            elif census_data.get("error"):
                granular_data = {"error": census_data["error"]}

        if geo_type == 'county' and county_context:
            granular_data = county_context
            county_context = None

        result = {
            "geo": {**geo, **fips},
            "county_context": county_context,
            "granular_data": granular_data,
            "notes": notes,
        }
        await redis_client.setex(cache_key, 3600, json.dumps(result))
        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
