#!/usr/bin/env python3
"""
Update monthly GDP estimates for bd-econ.com.

Fetches quarterly GDP from FRED, combines with Atlanta Fed GDPNow and
Cleveland Fed PCE inflation nowcast to estimate the current quarter,
then interpolates to monthly frequency.

Outputs both nominal and real GDP series to files/gdpm.csv.

Usage:
    python scripts/update_monthly_gdp.py
"""
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

# Path configuration
SITE_ROOT = Path(__file__).parent.parent
FILES_DIR = SITE_ROOT / 'files'


def fetch_with_retry(fetch_func, max_retries=3, delay=5):
    """Retry a fetch function with exponential backoff."""
    for attempt in range(max_retries):
        try:
            return fetch_func()
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            print(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
            time.sleep(delay)
            delay *= 2


def fetch_quarterly_gdp():
    """Fetch quarterly nominal and real GDP from FRED."""
    print("Fetching quarterly GDP from FRED...")

    # Nominal GDP
    url = 'https://fred.stlouisfed.org/data/GDP'
    nominal = (pd.read_html(url, converters={'DATE': lambda x: pd.to_datetime(x)})[1]
                 .set_index('DATE').rename({'VALUE': 'nominal'}, axis=1))
    q = (nominal.index[-1].month - 1) // 3 + 1
    print(f"  Nominal GDP: {nominal.index[-1].year} Q{q} = ${nominal.iloc[-1, 0]:,.1f}B")

    # Real GDP (GDPC1)
    url = 'https://fred.stlouisfed.org/data/GDPC1'
    real = (pd.read_html(url, converters={'DATE': lambda x: pd.to_datetime(x)})[1]
              .set_index('DATE').rename({'VALUE': 'real'}, axis=1))
    q = (real.index[-1].month - 1) // 3 + 1
    print(f"  Real GDP: {real.index[-1].year} Q{q} = ${real.iloc[-1, 0]:,.1f}B")

    # Combine
    gdp = nominal.join(real, how='inner')
    return gdp


def fetch_gdpnow():
    """Fetch real GDP nowcast from Atlanta Fed."""
    print("Fetching GDPNow from Atlanta Fed...")
    url = ('https://www.atlantafed.org/-/media/documents/cqer/researchcq/'
           'gdpnow/GDPTrackingModelDataAndForecasts.xlsx')
    df = pd.read_excel(url, sheet_name='ContribHistory', header=0,
                       skipfooter=9, index_col=1)
    gdpnow = df.iloc[-1:, -1]
    nowcast_value = float(gdpnow['GDP Nowcast'])
    nowcast_date = gdpnow.index[0]
    print(f"  GDPNow real GDP growth: {nowcast_value:.1f}%")
    return nowcast_value, nowcast_date


def fetch_pce_nowcast():
    """Fetch PCE inflation nowcast from Cleveland Fed."""
    print("Fetching PCE nowcast from Cleveland Fed...")
    url = 'https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting'
    df = pd.read_html(url)[2]

    pce_value = float(df.set_index('Quarter')['PCE'].iloc[0])
    quarter_str = df.set_index('Quarter')['PCE'].index[0]
    dt = pd.to_datetime(quarter_str.replace(':', '-'))
    print(f"  PCE inflation nowcast for {dt.year} Q{dt.quarter}: {pce_value:.1f}%")
    return pce_value, dt


def calculate_monthly_gdp(gdp, gdpnow_value, pce_value, nowcast_date):
    """Calculate monthly GDP estimates from quarterly data and nowcasts.

    Returns:
        tuple: (gdpm, gdpq_chart) - monthly interpolated series and quarterly data for chart
    """
    print("Calculating monthly GDP estimates...")

    # Calculate growth rates for current quarter
    nominal_growth = gdpnow_value + pce_value
    real_growth = gdpnow_value
    print(f"  Nominal GDP growth estimate: {nominal_growth:.1f}%")
    print(f"  Real GDP growth estimate: {real_growth:.1f}%")

    # Save quarterly data for comparison chart BEFORE any modifications
    # Uses original dates (start of quarter) and only published data (no nowcast)
    gdpq_chart = gdp[['nominal']].iloc[-5:].copy()  # Last 5 quarters of published data
    gdpq_chart.index.name = 'date'

    # Estimate GDP for current quarter
    gdpq = gdp.copy()
    nominal_mult = ((nominal_growth / 4) / 100) + 1
    real_mult = ((real_growth / 4) / 100) + 1

    # Add nowcast quarter estimates
    nowcast_nominal = gdpq['nominal'].iloc[-1] * nominal_mult
    nowcast_real = gdpq['real'].iloc[-1] * real_mult
    gdpq.loc[nowcast_date] = [nowcast_nominal, nowcast_real]
    gdpq = gdpq.sort_index()

    print(f"  Q4 nominal estimate: ${nowcast_nominal:,.1f}B")
    print(f"  Q4 real estimate: ${nowcast_real:,.1f}B")

    # Prepare dates for interpolation (shift to end of quarter)
    gdpq.index = pd.to_datetime((gdpq.index + pd.DateOffset(months=2)))

    # Interpolate to create monthly series
    gdpm = gdpq.resample('MS').interpolate()
    gdpm.index.name = 'date'

    # Rebase real GDP to latest period dollars (latest nominal = latest real)
    rebase_factor = gdpm['nominal'].iloc[-1] / gdpm['real'].iloc[-1]
    gdpm['real'] = gdpm['real'] * rebase_factor

    print(f"  Monthly series: {gdpm.index[0].strftime('%Y-%m')} to {gdpm.index[-1].strftime('%Y-%m')}")
    print(f"  Latest nominal: ${gdpm['nominal'].iloc[-1]:,.1f}B")
    print(f"  Latest real: ${gdpm['real'].iloc[-1]:,.1f}B (in latest period dollars)")

    return gdpm, gdpq_chart


def main():
    """Main function to update monthly GDP data."""
    print("=" * 60)
    print("Monthly GDP Update")
    print("=" * 60)

    try:
        # Fetch all data sources with retries
        gdp = fetch_with_retry(fetch_quarterly_gdp)
        gdpnow_value, gdpnow_date = fetch_with_retry(fetch_gdpnow)
        pce_value, pce_date = fetch_with_retry(fetch_pce_nowcast)

        # Calculate monthly estimates
        gdpm, gdpq_recent = calculate_monthly_gdp(gdp, gdpnow_value, pce_value, pce_date)

        # Save monthly CSV (rounded to 3 decimal places)
        filepath = FILES_DIR / 'gdpm.csv'
        gdpm.round(3).to_csv(filepath, date_format='%Y-%m-%d')
        print(f"\nData saved: {filepath}")

        # Save quarterly CSV for comparison chart (last 12 quarters)
        filepath_q = FILES_DIR / 'gdpq.csv'
        gdpq_recent.round(3).to_csv(filepath_q, date_format='%Y-%m-%d')
        print(f"Quarterly data saved: {filepath_q}")

        # Save timestamp
        timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
        (FILES_DIR / 'gdpm_updated.txt').write_text(timestamp)
        print(f"Timestamp saved: {timestamp}")

        print("\n" + "=" * 60)
        print("Update complete!")
        print("=" * 60)
        return 0

    except Exception as e:
        print(f"\nERROR: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
