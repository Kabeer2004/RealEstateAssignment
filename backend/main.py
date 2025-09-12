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

            # Trends: Yearly average employment
            from collections import defaultdict
            yearly_emp = defaultdict(list)
            for d in emp_data:
                yearly_emp[d['year']].append(int(d['value']))
            trends = [{"year": int(y), "value": sum(vals) / len(vals)} for y, vals in sorted(yearly_emp.items(), reverse=True)]

            return {
                "growth": growth,
                "total_jobs": latest_emp,
                "unemployment_rate": current_unemp,
                "labor_force": current_labor,
                "trends": trends
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
    start_year = str(current_year - 1)
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
                return [{"name": "Tech", "growth": 0}, {"name": "Healthcare", "growth": 0}]
            result = await resp.json()
            if result.get('status') != 'REQUEST_SUCCEEDED':
                return [{"name": "Tech", "growth": 0}, {"name": "Healthcare", "growth": 0}]

            series = result.get('Results', {}).get('series', [])

            sector_growth = []
            for i, s in enumerate(series):
                data = s['data']
                if len(data) < 5:  # Need at least 1y back (4 quarters prior)
                    continue
                latest = int(data[0]['value'])
                prior_year_same_q = int(data[4]['value']) if len(data) > 4 else None
                if prior_year_same_q and prior_year_same_q > 0:
                    yoy = round(((latest - prior_year_same_q) / prior_year_same_q) * 100, 2)
                    naics = list(major_sectors.keys())[i]
                    sector_growth.append((yoy, major_sectors[naics]))

            # Top 3 by YoY growth
            top = sorted(sector_growth, key=lambda x: x[0], reverse=True)[:3]
            return [{"name": name, "growth": growth} for growth, name in top] or [{"name": "Tech", "growth": 0}, {"name": "Healthcare", "growth": 0}]

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
        lau_task = fetch_bls_lau_data(county_fips)
        qcew_sectors_task = fetch_bls_qcew_sectors(county_fips)
        census_task = asyncio.sleep(0)
        if geo_type in ['tract', 'zip']:
            census_task = fetch_census_data(fips, geo, geo_type)

        lau_data, top_sectors, census_data = await asyncio.gather(
            lau_task, qcew_sectors_task, census_task
        )

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
