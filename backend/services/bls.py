import aiohttp
import json
from datetime import date
from collections import defaultdict

from core.config import BLS_API_KEY


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
        '11': 'Agriculture, Forestry, Fishing & Hunting',
        '21': 'Mining, Quarrying, Oil & Gas',
        '22': 'Utilities',
        '23': 'Construction',
        '31': 'Manufacturing - Food/Textiles/Apparel',
        '32': 'Manufacturing - Paper/Chemicals/Plastics',
        '33': 'Manufacturing - Metals/Machinery/Electronics',
        '42': 'Wholesale Trade',
        '44': 'Retail Trade (Vehicles, Food, Health)',
        '45': 'Retail Trade (General Merchandise, etc.)',
        '48': 'Transportation',
        '49': 'Warehousing & Couriers',
        '51': 'Information',
        '52': 'Finance and Insurance',
        '53': 'Real Estate and Rental & Leasing',
        '54': 'Professional, Scientific, & Technical Services',
        '55': 'Management of Companies & Enterprises',
        '56': 'Administrative & Waste Services',
        '61': 'Educational Services',
        '62': 'Health Care and Social Assistance',
        '71': 'Arts, Entertainment, & Recreation',
        '72': 'Accommodation and Food Services',
        '81': 'Other Services',
    }

    # Correct BLS QCEW series ID format
    # Format: ENU + county_fips + datatype + size + ownership + industry
    # DataType: 1=Employment, 4=Average Weekly Wage
    # Size: 0=All sizes
    # Ownership: 5=Private
    # Industry: 2-digit NAICS codes for sectors, "10"=All Industries

    # Employment series for sectors (datatype=1)
    sector_series_ids = [f"ENU{county_fips}105{naics}" for naics in major_sectors.keys()]

    # Average weekly wage series (datatype=4, not 11!)
    wage_series_id = f"ENU{county_fips}40510"  # datatype=4, size=0, ownership=5, industry=10

    all_series_ids = sector_series_ids + [wage_series_id]

    print(f"DEBUG: Requesting wage series: {wage_series_id}")

    current_year = date.today().year
    start_year = str(current_year - 6)
    end_year = str(current_year - 1)  # QCEW has 6-month lag

    headers = {'Content-type': 'application/json'}
    payload = json.dumps({
        "seriesid": all_series_ids,
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

                # Handle wage data
                if series_id == wage_series_id:
                    if s.get('data') and len(s['data']) > 0:
                        wage_data_raw = sorted(s.get('data', []), key=lambda d: d['year'], reverse=True)
                        print(f"DEBUG: Found wage data: {len(wage_data_raw)} records")
                    continue

                # Handle sector employment data
                if not s.get('data'):
                    continue

                # Extract industry code from series ID (last 2 digits)
                industry_code = series_id[-2:]
                industry_name = major_sectors.get(industry_code, f'Industry {industry_code}')
                data = sorted(s.get('data', []), key=lambda d: d['year'], reverse=True)

                # Calculate year-over-year growth
                if len(data) >= 2:
                    try:
                        current_val = float(data[0]['value'])
                        prior_val = float(data[1]['value'])
                        if prior_val > 0:
                            growth_rate = round(((current_val - prior_val) / prior_val) * 100, 2)
                            sector_growth.append((growth_rate, industry_name))
                    except (ValueError, KeyError):
                        continue

            top_sectors = sorted(sector_growth, key=lambda x: x[0], reverse=True)[:3]

            # Process wage data
            wage_info = {"error": "No wage data available"}
            if wage_data_raw and len(wage_data_raw) > 0:
                try:
                    latest_wage = float(wage_data_raw[0]['value'])

                    def get_wage_growth(years_back):
                        if len(wage_data_raw) > years_back:
                            try:
                                old_wage = float(wage_data_raw[years_back]['value'])
                                if old_wage > 0:
                                    return round(((latest_wage - old_wage) / old_wage) * 100, 2)
                            except (ValueError, IndexError):
                                pass
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
                    print(f"DEBUG: Wage info created successfully: ${latest_wage}/week")

                except (ValueError, KeyError) as e:
                    wage_info = {"error": f"Error processing wage data: {e}"}

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