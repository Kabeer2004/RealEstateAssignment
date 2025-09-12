from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import asyncio
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
import pandas as pd
from datetime import datetime
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

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
                raise HTTPException(400, "Geocoding failed")
            data = await resp.json()
            return {"lat": float(data[0]['lat']), "lon": float(data[0]['lon'])}

async def fetch_bls_data(geo: dict) -> dict:
    # Placeholder: Fetch BLS CES data (YoY, total jobs)
    return {"yoy_growth": 2.5, "total_jobs": 100000, "top_sectors": ["Tech", "Healthcare"]}

async def fetch_census_data(geo: dict) -> dict:
    # Placeholder: Fetch ACS employment data
    return {"trends": [{"year": 2020, "value": 2.3}, {"year": 2021, "value": 2.5}]}

@app.get("/")
def read_root():
    return {"status": "Backend is running"}

@app.get("/api/job-growth")
async def get_job_growth(address: str, geo_type: str = "tract"):
    # For now, we are not using the DB session, but it's set up.
    # async with AsyncSessionLocal() as db:
    cache_key = f"{address}:{geo_type}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    geo = await geocode_address(address)
    bls_data, census_data = await asyncio.gather(fetch_bls_data(geo), fetch_census_data(geo))

    result = {"stats": bls_data, "trends": census_data["trends"], "geo": geo}

    await redis_client.setex(cache_key, 3600, json.dumps(result))
    return result