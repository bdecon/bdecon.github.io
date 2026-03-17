#!/usr/bin/env python3
"""
Update the economic data release calendar for bd-econ.com.

Fetches upcoming release dates from the FRED API for each release
defined in files/release_map.json, then writes files/calendar.json.

Requires FRED_API_KEY environment variable.

Usage:
    python scripts/update_calendar.py
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError

SITE_ROOT = Path(__file__).parent.parent
FILES_DIR = SITE_ROOT / 'files'
FRED_BASE = 'https://api.stlouisfed.org/fred'


def fetch_json(url, max_retries=3, delay=2):
    """Fetch JSON from a URL with retries."""
    for attempt in range(max_retries):
        try:
            req = Request(url, headers={'User-Agent': 'bd-econ-calendar/1.0'})
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except HTTPError as e:
            if e.code == 429:
                wait = delay * (2 ** attempt)
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
            elif attempt == max_retries - 1:
                raise
            else:
                time.sleep(delay)
        except Exception:
            if attempt == max_retries - 1:
                raise
            time.sleep(delay)


def get_upcoming_dates(fred_id, api_key, start_date, end_date):
    """Fetch upcoming release dates for a single FRED release."""
    url = (
        f'{FRED_BASE}/release/dates?release_id={fred_id}'
        f'&include_release_dates_with_no_data=true'
        f'&realtime_start={start_date}&realtime_end={end_date}'
        f'&sort_order=asc&file_type=json'
        f'&api_key={api_key}'
    )
    data = fetch_json(url)
    if data and 'release_dates' in data:
        return [d['date'] for d in data['release_dates']]
    return []


def main():
    api_key = os.environ.get('FRED_API_KEY')
    if not api_key:
        print("ERROR: FRED_API_KEY environment variable not set.")
        return 1

    # Load release mapping
    map_path = FILES_DIR / 'release_map.json'
    with open(map_path) as f:
        release_map = json.load(f)

    today = datetime.now().strftime('%Y-%m-%d')
    end = (datetime.now() + timedelta(days=90)).strftime('%Y-%m-%d')

    print(f"Fetching release dates from {today} to {end}")
    n_manual = len(release_map.get('manual', []))
    print(f"Tracking {len(release_map['releases'])} FRED releases + {n_manual} manual")
    print("=" * 50)

    calendar_entries = []
    seen_fred_ids = set()

    for rel in release_map['releases']:
        fred_id = rel['fred_id']

        # Skip duplicates (e.g., multiple entries sharing a fred_id)
        if fred_id in seen_fred_ids:
            # Still need dates for this release name, fetch from cache
            pass
        seen_fred_ids.add(fred_id)

        print(f"  {rel['name']} (rid={fred_id})...", end=' ')

        try:
            dates = get_upcoming_dates(fred_id, api_key, today, end)
            print(f"{len(dates)} dates")
        except Exception as e:
            print(f"ERROR: {e}")
            dates = []

        for date_str in dates:
            calendar_entries.append({
                'name': rel['name'],
                'date': date_str,
                'time': rel.get('time'),
                'frequency': rel['frequency'],
                'agency': rel['agency'],
                'link': rel.get('link'),
            })

        # Respect FRED rate limits (~1 req/sec on free tier)
        time.sleep(0.6)

    # Add manual entries (releases not tracked by FRED)
    for rel in release_map.get('manual', []):
        manual_dates = [d for d in rel['dates'] if today <= d <= end]
        print(f"  {rel['name']} (manual)... {len(manual_dates)} dates")
        for date_str in manual_dates:
            calendar_entries.append({
                'name': rel['name'],
                'date': date_str,
                'time': rel.get('time'),
                'frequency': rel['frequency'],
                'agency': rel['agency'],
                'link': rel.get('link'),
            })

    # Sort by date, then by time
    time_sort = {'8:30 AM ET': 0, '9:00 AM ET': 1, '9:15 AM ET': 2,
                 '10:00 AM ET': 3, '11:00 AM ET': 4, '12:00 PM ET': 5,
                 '1:00 PM ET': 6, '2:00 PM ET': 7, '4:00 PM ET': 8,
                 '4:30 PM ET': 9}
    calendar_entries.sort(key=lambda e: (
        e['date'],
        time_sort.get(e['time'], 99),
    ))

    output = {
        'generated': datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
        'range': {'start': today, 'end': end},
        'entries': calendar_entries,
    }

    out_path = FILES_DIR / 'calendar.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    print("=" * 50)
    print(f"Wrote {len(calendar_entries)} entries to {out_path}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
