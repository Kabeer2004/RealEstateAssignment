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