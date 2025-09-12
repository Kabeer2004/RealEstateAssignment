from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import asyncio
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from datetime import date
import os
import json
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Make sure .env is loaded from the same directory as this script
load_dotenv()

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

BLS_API_KEY = os.getenv("BLS_API_KEY")
CENSUS_API_KEY = os.getenv("CENSUS_API_KEY")

print (f"BLS_API_KEY: {BLS_API_KEY}")
print (f"CENSUS_API_KEY: {CENSUS_API_KEY}")

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
if not redis_password:
    redis_password = None

redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True, password=redis_password)
engine = create_async_engine(os.getenv('DATABASE_URL'), echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession)

class AddressInput(BaseModel):
    address: str
    geo_type: str = "tract"

async def geocode_address(address: str) -> dict:
    async with aiohttp.ClientSession() as session:
        url = f"https://nominatim.openstreetmap.org/search?q={address}&format=json"
        async with session.get(url) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="Geocoding failed")
            data = await resp.json()
            if not data:
                raise HTTPException(status_code=404, detail="Address not found by geocoder.")
            return {"lat": float(data[0]['lat']), "lon": float(data[0]['lon'])}

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
                "tract_code": data['Block']['FIPS'][5:11] if data.get('Block') else None
            }

async def fetch_bls_data(county_fips: str) -> dict:
    BLS_API_KEY = os.getenv("BLS_API_KEY")
    print (f"Using BLS_API_KEY for fetch_bls_data.")
       
    series_id = f"SMU{county_fips}00000000001" # Total Nonfarm

    current_year = date.today().year
    start_year = str(current_year - 2)
    end_year = str(current_year)

    headers = {'Content-type': 'application/json'}
    payload = json.dumps({
        "seriesid": [series_id],
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
                return {"yoy_growth": 2.5, "total_jobs": 100000, "top_sectors": ["Tech", "Healthcare"], "error": f"BLS API request failed with status {resp.status}"}

            result = await resp.json()

            if result.get('status') != 'REQUEST_SUCCEEDED':
                error_message = result.get('message', ["Unknown error"])[0]
                return {"yoy_growth": 2.5, "total_jobs": 100000, "top_sectors": ["Tech", "Healthcare"], "error": error_message}

            series = result.get('Results', {}).get('series')
            if not series or not series[0].get('data'):
                 return {"yoy_growth": 0, "total_jobs": 0, "top_sectors": [], "error": "No data found for this location in BLS dataset."}

            series_data = series[0]['data']
            if len(series_data) < 13:
                 return {"yoy_growth": 0, "total_jobs": int(series_data[0]['value']), "top_sectors": [], "error": "Not enough data for YoY calculation."}

            latest_month_data = series_data[0]
            prior_year_data = next((d for d in series_data if d['year'] == str(int(latest_month_data['year']) - 1) and d['period'] == latest_month_data['period']), None)

            if not prior_year_data:
                prior_year_data = series_data[12]

            latest_jobs = int(latest_month_data['value'])
            prior_year_jobs = int(prior_year_data['value'])

            if prior_year_jobs == 0:
                yoy_growth = float('inf') if latest_jobs > 0 else 0
            else:
                yoy_growth = round(((latest_jobs - prior_year_jobs) / prior_year_jobs) * 100, 2)

            # For top sectors, we'd need more series IDs. For now, returning placeholder.
            return {"yoy_growth": yoy_growth, "total_jobs": latest_jobs, "top_sectors": ["Tech", "Healthcare"]}


async def fetch_census_data(fips: dict, geo_type: str) -> dict:
    # Placeholder: Fetch ACS employment data
    # A real implementation would be complex, involving looping years and parsing.
    return {"trends": [{"year": 2020, "value": 2.3}, {"year": 2021, "value": 2.5}]}

@app.get("/")
def read_root():
    return {"status": "Backend is running"}

@app.get("/api/job-growth")
@limiter.limit("10/minute")
async def get_job_growth(request: Request, address: str, geo_type: str = "tract", flush_cache: bool = False):
    # For now, we are not using the DB session, but it's set up.
    # async with AsyncSessionLocal() as db:
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

        # The FCC county_fips is state+county (5 digits), which is what BLS needs.
        county_fips_for_bls = fips['county_fips']

        bls_data, census_data = await asyncio.gather(
            fetch_bls_data(county_fips_for_bls),
            fetch_census_data(fips, geo_type)
        )

        # Combine geo and fips data for the frontend
        geo_data = {**geo, **fips}

        # If BLS fetch returned an error, include it in the response
        if 'error' in bls_data:
            geo_data['error'] = bls_data['error']

        result = {"stats": bls_data, "trends": census_data["trends"], "geo": geo_data}

        await redis_client.setex(cache_key, 3600, json.dumps(result))
        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
