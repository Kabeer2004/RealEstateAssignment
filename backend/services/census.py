import aiohttp

from core.config import CENSUS_API_KEY


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
    elif geo_type == "county":
        for_clause = f"county:{county}"
        in_clause = f"state:{state}"
    else: # Invalid
        return {"error": f"Unsupported geo_type for ACS data: {geo_type}"}

    year = 2023 # Latest reliable ACS 5-year data
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