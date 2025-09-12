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
from collections import defaultdict
import logging

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
        # addressdetails=1 is needed to get the ZIP code
        url = f"https://nominatim.openstreetmap.org/search?q={address}&format=json&addressdetails=1"
        async with session.get(url) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="Geocoding failed")
            data = await resp.json()
            if not data:
                raise HTTPException(status_code=404, detail="Address not found by geocoder.")
            
            addr_details = data[0].get('address', {})
            return {
                "lat": float(data[0]['lat']), 
                "lon": float(data[0]['lon']),
                "zip": addr_details.get('postcode')
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

            return {
                "state_fips": data['State']['FIPS'],
                "county_fips": data['County']['FIPS'],
                "tract_code": data['Block']['FIPS'][:11] if data.get('Block') else None # Full 11-digit tract code
            }

async def fetch_bls_lau_data(county_fips: str) -> dict:
    """Fetches Local Area Unemployment Statistics (LAU) for a county."""
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

            series_results = result.get('Results', {}).get('series', [])
            if not series_results or len(series_results) < 3:
                return {"error": "Incomplete LAU data received from BLS."}

            emp_data = sorted(series_results[0]['data'], key=lambda d: (d['year'], d['period']), reverse=True)
            unemp_data = sorted(series_results[1]['data'], key=lambda d: (d['year'], d['period']), reverse=True)
            labor_data = sorted(series_results[2]['data'], key=lambda d: (d['year'], d['period']), reverse=True)

            if not emp_data:
                return {"error": "No employment data available in BLS LAU."}

            latest_emp = int(emp_data[0]['value'])

            def get_growth(data, steps):
                if len(data) > steps:
                    ago_value = int(data[steps]['value'])
                    if ago_value == 0: return float('inf') if latest_emp > 0 else 0
                    return round(((latest_emp - ago_value) / ago_value) * 100, 1)
                return None

            growth = {
                "6mo": get_growth(emp_data, 5),
                "1y": get_growth(emp_data, 11),
                "2y": get_growth(emp_data, 23),
                "5y": get_growth(emp_data, 59),
            }

            yearly_emp = defaultdict(list)
            for d in emp_data:
                yearly_emp[d['year']].append(int(d['value']))
            
            trends = [{"year": int(y), "value": sum(vals) // len(vals)} for y, vals in sorted(yearly_emp.items())]

            return {
                "growth": {k: v for k, v in growth.items() if v is not None},
                "total_jobs": latest_emp,
                "unemployment_rate": float(unemp_data[0]['value']) if unemp_data else None,
                "labor_force": int(labor_data[0]['value']) if labor_data else None,
                "trends": trends
            }

async def fetch_bls_qcew_sectors(county_fips: str) -> list:
    """Fetches Quarterly Census of Employment and Wages (QCEW) for top growing sectors."""
    major_sectors = {'11': 'Agriculture', '21': 'Mining', '23': 'Construction', '31': 'Manufacturing', '42': 'Wholesale Trade', '44': 'Retail Trade', '48': 'Transportation', '51': 'Information', '52': 'Finance', '53': 'Real Estate', '54': 'Professional Services', '56': 'Administrative Support', '61': 'Education', '62': 'Health Care', '71': 'Arts & Entertainment', '72': 'Accommodation & Food'}
    series_ids = [f"ENU{county_fips}05{naics}" for naics in major_sectors.keys()]
    
    current_year = date.today().year
    payload = json.dumps({
        "seriesid": series_ids,
        "startyear": str(current_year - 1), "endyear": str(current_year),
        "registrationkey": BLS_API_KEY, "annualaverage": False
    })

    async with aiohttp.ClientSession() as session:
        url = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
        async with session.post(url, data=payload, headers={'Content-type': 'application/json'}) as resp:
            if resp.status != 200: return []
            result = await resp.json()
            if result.get('status') != 'REQUEST_SUCCEEDED': return []

            sector_growth = []
            for s in result.get('Results', {}).get('series', []):
                data = s['data']
                if len(data) >= 5: # Need at least 1 year of quarterly data
                    latest = int(data[0]['value'])
                    prior_year = int(data[4]['value'])
                    if prior_year > 0:
                        yoy = round(((latest - prior_year) / prior_year) * 100, 1)
                        naics = s['seriesID'][12:14]
                        sector_growth.append({"name": major_sectors.get(naics, "Unknown"), "growth": yoy})
            
            return sorted(sector_growth, key=lambda x: x['growth'], reverse=True)[:5]

async def fetch_bls_county_context(county_fips: str) -> dict:
    """A wrapper to get all county-level data from BLS."""
    lau_task = fetch_bls_lau_data(county_fips)
    qcew_task = fetch_bls_qcew_sectors(county_fips)
    lau_data, qcew_data = await asyncio.gather(lau_task, qcew_task)

    if 'error' in lau_data:
        return {"error": lau_data['error']}
    
    return {
        "source": "BLS LAU (Monthly) & QCEW (Quarterly)",
        **lau_data,
        "top_sectors_growing": qcew_data
    }

ACS_EMPLOY_VARS = [
    'B23025_001E',  # Total pop 16+
    'B23025_003E',  # Civilian labor force
    'B23025_005E',  # Employed
    'B23025_006E'   # Unemployed
]
ACS_INDUSTRY_VARS = {
    'B24030_006E': 'Construction',
    'B24030_007E': 'Manufacturing',
    'B24030_009E': 'Retail Trade',
    'B24030_014E': 'Professional Services',
    'B24030_018E': 'Health Care'
}
ALL_ACS_VARS = ACS_EMPLOY_VARS + list(ACS_INDUSTRY_VARS.keys())

def _parse_census_value(value: str) -> int:
    """Safely parses a value from the Census API, handling nulls/suppressed data."""
    if value is None or value.startswith('-'):
        return 0
    try:
        return int(value)
    except (ValueError, TypeError):
        return 0

async def fetch_census_granular_data(fips: dict, geo_type: str, geo: dict) -> dict:
    """Fetches ACS 5-year estimates for tract or zip."""
    state_fips = fips['state_fips']
    county_fips = fips['county_fips'][2:]  # Strip state prefix for county code
    tract_code = fips.get('tract_code')
    zip_code = geo.get('zip')

    trends = []
    sector_data_by_year = defaultdict(dict)

    years = range(2019, 2024)  # 2019-2023 for 5y growth
    base_url = "https://api.census.gov/data"

    async def fetch_year_data(year, session):
        if geo_type == "tract" and tract_code:
            # The API needs the 6-digit tract code, not the full 11-digit GEOID
            for_clause = f"tract:{tract_code[5:]}"
            in_clause = f"state:{state_fips} county:{county_fips}"
        elif geo_type == "zip" and zip_code:
            for_clause = f"zip code tabulation area:{zip_code}"
            in_clause = ""
        else:
            return

        url = f"{base_url}/{year}/acs/acs5?get={','.join(ALL_ACS_VARS)}&for={for_clause}"
        if in_clause: url += f"&in={in_clause}"
        if CENSUS_API_KEY: url += f"&key={CENSUS_API_KEY}"
        
        async with session.get(url) as resp:
            if resp.status != 200: return
            try:
                data = await resp.json()
            except (aiohttp.ContentTypeError, json.JSONDecodeError):
                return

            if not data or len(data) < 2: return

            headers = data[0]
            row = data[1]
            
            row_data = {var: val for var, val in zip(headers, row)}

            labor_force = _parse_census_value(row_data.get('B23025_003E'))
            unemployed = _parse_census_value(row_data.get('B23025_006E'))
            employed = _parse_census_value(row_data.get('B23025_005E'))

            # Only add trend data if core employment numbers are valid
            if employed > 0 and labor_force > 0:
                trends.append({
                    "year": year,
                    "employed": employed,
                    "labor_force": labor_force,
                    "unemployment_rate": round((unemployed / labor_force * 100), 1) if labor_force > 0 else 0,
                })

                for var, name in ACS_INDUSTRY_VARS.items():
                    sector_data_by_year[year][name] = _parse_census_value(row_data.get(var))

    async with aiohttp.ClientSession() as session:
        tasks = [fetch_year_data(year, session) for year in years]
        await asyncio.gather(*tasks)

    if not trends:
        return {"error": f"No valid Census ACS employment data found for this {geo_type}. It may be a low-population area."}

    trends = sorted(trends, key=lambda x: x['year'], reverse=True)

    latest_employed = trends[0]['employed']
    growth = {}
    if len(trends) > 1:
        prev_employed = trends[1]['employed']
        growth['1y'] = round(((latest_employed - prev_employed) / prev_employed * 100), 1) if prev_employed > 0 else float('inf') if latest_employed > 0 else 0
    if len(trends) > 2:
        prev_2y = trends[2]['employed']
        growth['2y'] = round(((latest_employed - prev_2y) / prev_2y * 100), 1) if prev_2y > 0 else float('inf') if latest_employed > 0 else 0
    if len(trends) >= 5:
        # Find the 2019 data point, might not be exactly at index 4 if some years are missing
        prev_5y_data = next((t for t in trends if t['year'] == 2019), None)
        if prev_5y_data:
            prev_5y = prev_5y_data['employed']
            growth['5y'] = round(((latest_employed - prev_5y) / prev_5y * 100), 1) if prev_5y > 0 else float('inf') if latest_employed > 0 else 0

    sector_growths = []
    if len(sector_data_by_year) >= 2 and trends[0]['year'] in sector_data_by_year and trends[1]['year'] in sector_data_by_year:
        latest_year_sectors = sector_data_by_year[trends[0]['year']]
        prev_year_sectors = sector_data_by_year[trends[1]['year']]
        for name, latest_val in latest_year_sectors.items():
            prev_val = prev_year_sectors.get(name, 0)
            if prev_val > 0:
                yoy = round(((latest_val - prev_val) / prev_val * 100), 1)
                sector_growths.append({"name": name, "growth": yoy})

    top_sectors_growing = sorted(sector_growths, key=lambda x: x['growth'], reverse=True)[:3]

    return {
        "source": f"Census ACS 5-Year Estimates for {geo_type.capitalize()}",
        "growth": growth,
        "total_jobs": latest_employed,
        "unemployment_rate": trends[0]['unemployment_rate'],
        "labor_force": trends[0]['labor_force'],
        "trends": [{"year": t['year'], "value": t['employed']} for t in trends],
        "top_sectors_growing": top_sectors_growing
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
            pass

    try:
        geo = await geocode_address(address)
        fips = await get_fips_codes(geo)

        county_fips_full = fips['state_fips'] + fips['county_fips'][2:]
        
        tasks = [fetch_bls_county_context(county_fips_full)]
        if geo_type in ['tract', 'zip']:
            tasks.append(fetch_census_granular_data(fips, geo_type, geo))

        results = await asyncio.gather(*tasks)

        county_context = results[0]
        granular_data = results[1] if len(results) > 1 else None

        final_result = {
            "address": address,
            "geo_type": geo_type,
            "geo": {**geo, **fips},
            "county_context": county_context,
            "granular_data": granular_data,
            "notes": []
        }
        if granular_data and 'error' not in granular_data:
            final_result['notes'].append("Granular data is based on annual Census estimates and may have a significant margin of error.")
        if county_context and 'error' not in county_context:
            final_result['notes'].append("County context provides more timely monthly and quarterly data for the broader region.")

        await redis_client.setex(cache_key, 3600, json.dumps(final_result))
        return final_result
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.exception("An unexpected error occurred")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
