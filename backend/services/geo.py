import aiohttp
from fastapi import HTTPException


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