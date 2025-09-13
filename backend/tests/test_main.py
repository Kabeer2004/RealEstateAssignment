import json

import pytest
import respx
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.database import Base, get_db
from main import app

# Use an in-memory SQLite database for testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL)
TestingSessionLocal = async_sessionmaker(
    autocommit=False, autoflush=False, bind=test_engine)


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# Mock data for external APIs
GEOCODE_URL = "https://nominatim.openstreetmap.org/search"
FIPS_URL = "https://geo.fcc.gov/api/census/block/find"
BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"

mock_geocode_response = [{
    "lat": "37.7749", "lon": "-122.4194",
    "address": {"postcode": "94102"}
}]

mock_fips_response = {
    "State": {"FIPS": "06"},
    "County": {"FIPS": "06075"},
    "Block": {"FIPS": "060750179011004"}
}

mock_bls_lau_response = {
    "status": "REQUEST_SUCCEEDED",
    "Results": {"series": [
        {"seriesID": "LAUCN060750000000005", "data": [
            {"year": "2023", "period": "M01", "value": "500000"}]},
        {"seriesID": "LAUCN060750000000003", "data": [
            {"year": "2023", "period": "M01", "value": "3.5"}]},
        {"seriesID": "LAUCN060750000000006", "data": [
            {"year": "2023", "period": "M01", "value": "520000"}]}
    ]}
}

mock_bls_qcew_response = {
    "status": "REQUEST_SUCCEEDED", "Results": {"series": []}}

mock_bls_national_response = {
    "status": "REQUEST_SUCCEEDED",
    "Results": {"series": [{"data": [{"year": "2023", "period": "M01", "value": "150000"}]}]}
}

mock_bls_resilience_response = {
    "status": "REQUEST_SUCCEEDED",
    "Results": {"series": [{"data": [
        {"year": "2019", "value": "490000"}, {"year": "2020", "value": "450000"},
        {"year": "2007", "value": "480000"}, {"year": "2009", "value": "460000"}
    ]}]}
}

mock_census_response = [
    ["B23025_004E", "B23025_005E", "B23025_003E", "state", "county", "tract"],
    ["1000", "50", "1050", "06", "075", "017901"]
]

mock_acs_response = [
    ["B19013_001E", "B23025_001E", "B23025_002E", "B15003_001E", "B15003_022E",
        "B15003_023E", "B15003_024E", "B15003_025E", "state", "county", "tract"],
    ["90000", "2000", "1500", "1800", "500", "200", "50", "10", "06", "075", "017901"]
]


def mock_bls_api(request):
    payload = json.loads(request.content)
    series_id = payload['seriesid'][0]
    if series_id.startswith("LAUCN"):
        if payload.get('startyear') == '2007':
            return Response(200, json=mock_bls_resilience_response)
        return Response(200, json=mock_bls_lau_response)
    elif series_id.startswith("ENU"):
        return Response(200, json=mock_bls_qcew_response)
    elif series_id.startswith("LNS"):
        return Response(200, json=mock_bls_national_response)
    return Response(404)


@pytest.mark.asyncio
@respx.mock
async def test_get_job_growth_success():
    # Mock external service calls
    respx.get(GEOCODE_URL).mock(return_value=Response(200, json=mock_geocode_response))
    respx.get(FIPS_URL).mock(return_value=Response(200, json=mock_fips_response))
    respx.post(BLS_URL).mock(side_effect=mock_bls_api)

    # Mock Census calls (one for ACS, rest for yearly employment)
    census_router = respx.get(url__regex=r"https://api.census.gov/data/.*")
    census_router.side_effect = [
        Response(200, json=mock_census_response),
        Response(200, json=mock_census_response),
        Response(200, json=mock_census_response),
        Response(200, json=mock_census_response),
        Response(200, json=mock_census_response),
        Response(200, json=mock_census_response),
        Response(200, json=mock_acs_response),
    ]

    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/job-growth?address=123 Main St")

    assert response.status_code == 200
    data = response.json()
    assert "geo" in data
    assert "county_context" in data
    assert "granular_data" in data
    assert "cre_summary" in data
    assert data["geo"]["lat"] == 37.7749
    assert data["geo"]["county_fips"] == "06075"