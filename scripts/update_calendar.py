#!/usr/bin/env python3
"""
Update the economic data release calendar for bd-econ.com.

Fetches upcoming release dates from direct agency sources (BLS, BEA,
Census, Fed) where available, falls back to the FRED API for remaining
releases, and includes manually maintained dates for releases not
tracked by any API.

Sources:
  BLS:    ICS calendar (bls.gov/schedule/news_release/bls.ics)
  BEA:    JSON API (apps.bea.gov/API/signup/release_dates.json)
  Fed:    JSON (federalreserve.gov/data/statcalendar.json)
  Census: HTML table (census.gov/economic-indicators/calendar-listview.html)
  FRED:   REST API (api.stlouisfed.org) — for releases without direct sources

Requires FRED_API_KEY environment variable.

Usage:
    python scripts/update_calendar.py
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

SITE_ROOT = Path(__file__).parent.parent
FILES_DIR = SITE_ROOT / 'files'
FRED_BASE = 'https://api.stlouisfed.org/fred'
ET = ZoneInfo('America/New_York')
UA = 'Mozilla/5.0 (compatible; bd-econ-calendar/1.0)'

# ── HTTP helpers ──────────────────────────────────────────────────────

def fetch_url(url, max_retries=3, delay=2, decode='utf-8'):
    """Fetch raw text from a URL with retries."""
    last_err = None
    for attempt in range(max_retries):
        try:
            req = Request(url, headers={'User-Agent': UA})
            with urlopen(req, timeout=30) as resp:
                return resp.read().decode(decode)
        except HTTPError as e:
            last_err = e
            if e.code == 429:
                wait = delay * (2 ** attempt)
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
            elif attempt == max_retries - 1:
                raise
            else:
                time.sleep(delay)
        except Exception as e:
            last_err = e
            if attempt == max_retries - 1:
                raise
            time.sleep(delay)
    raise last_err or RuntimeError(f"Failed to fetch {url}")


def fetch_json(url, **kwargs):
    """Fetch and parse JSON from a URL."""
    text = fetch_url(url, **kwargs)
    return json.loads(text)


# ── Time normalization ────────────────────────────────────────────────

def normalize_time(hour, minute, is_pm=False):
    """Convert hour/minute to 'H:MM AM ET' format."""
    if is_pm and hour < 12:
        hour += 12
    if not is_pm and hour == 12:
        hour = 0
    period = 'PM' if hour >= 12 else 'AM'
    display_hour = hour % 12 or 12
    return f"{display_hour}:{minute:02d} {period} ET"


# ── Direct source fetchers ───────────────────────────────────────────

def fetch_bls_ics(start, end):
    """Fetch BLS release dates from their ICS calendar."""
    url = 'https://www.bls.gov/schedule/news_release/bls.ics'
    # BLS uses Akamai bot detection; needs a full browser User-Agent
    bls_headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                       '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/calendar, */*',
    }
    last_err = None
    text = None
    for attempt in range(3):
        try:
            req = Request(url, headers=bls_headers)
            with urlopen(req, timeout=30) as resp:
                text = resp.read().decode('utf-8')
            break
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2)
    if text is None:
        raise last_err or RuntimeError("Failed to fetch BLS ICS")

    events = []
    for block in text.split('BEGIN:VEVENT'):
        if 'END:VEVENT' not in block:
            continue

        summary_m = re.search(r'SUMMARY:(.+)', block)
        dt_m = re.search(r'DTSTART[^:]*:(\d{8}T\d{6})', block)
        if not summary_m or not dt_m:
            continue

        name = summary_m.group(1).strip()
        dt_str = dt_m.group(1)
        # Parse datetime — BLS uses US-Eastern timezone
        dt = datetime.strptime(dt_str, '%Y%m%dT%H%M%S')
        dt = dt.replace(tzinfo=ET)
        date_str = dt.strftime('%Y-%m-%d')

        if date_str < start or date_str > end:
            continue

        t = normalize_time(dt.hour, dt.minute)
        events.append({'source_name': name, 'date': date_str, 'time': t})

    return events


def fetch_bea_json(start, end):
    """Fetch BEA release dates from their JSON API."""
    url = 'https://apps.bea.gov/API/signup/release_dates.json'
    data = fetch_json(url)

    events = []
    for release_name, info in data.items():
        if release_name in ('file_last_updated',):
            continue
        if not isinstance(info, dict) or 'release_dates' not in info:
            continue

        for dt_str in info['release_dates']:
            # ISO format: "2026-05-08T08:30:00-04:00" or similar
            try:
                dt = datetime.fromisoformat(dt_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=ET)
                dt_et = dt.astimezone(ET)
            except (ValueError, TypeError):
                continue

            date_str = dt_et.strftime('%Y-%m-%d')
            if date_str < start or date_str > end:
                continue

            t = normalize_time(dt_et.hour, dt_et.minute)
            events.append({
                'source_name': release_name,
                'date': date_str,
                'time': t,
            })

    return events


def fetch_fed_json(start, end):
    """Fetch Fed statistical release dates from their JSON calendar."""
    url = 'https://www.federalreserve.gov/data/statcalendar.json'
    text = fetch_url(url, decode='utf-8-sig')
    data = json.loads(text)

    events = []
    for evt in data.get('events', []):
        if not evt or not evt.get('title'):
            continue

        title = evt['title']
        month_str = evt.get('month', '')  # "2026-03"
        days_str = evt.get('days', '')    # "17" or "3, 10, 17, 24, 31"
        time_str = evt.get('time', '')    # "9:15 a.m." or ""

        if not month_str or not days_str:
            continue

        # Parse time
        t = None
        if time_str:
            tm = re.match(r'(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)', time_str, re.I)
            if tm:
                h, m = int(tm.group(1)), int(tm.group(2))
                is_pm = 'p' in tm.group(3).lower()
                t = normalize_time(h, m, is_pm)

        # Each day in the comma-separated list
        for day in days_str.split(','):
            day = day.strip()
            if not day.isdigit():
                continue
            date_str = f"{month_str}-{int(day):02d}"
            if date_str < start or date_str > end:
                continue

            events.append({
                'source_name': title,
                'date': date_str,
                'time': t,
            })

    return events


def fetch_census_html(start, end):
    """Fetch Census release dates from their calendar HTML table."""
    url = 'https://www.census.gov/economic-indicators/calendar-listview.html'
    html = fetch_url(url)

    events = []
    # Each row has a sorttable_customkey like "202601140830" (YYYYMMDDHHmm)
    # and indicator name in first column
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)

    for row in rows:
        # Extract indicator name from first <td>
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        if len(cells) < 3:
            continue

        # Name is in first cell, possibly wrapped in <a>
        name_html = cells[0]
        name_m = re.search(r'>([^<]+)<', name_html)
        if not name_m:
            name_m = re.search(r'([^<]+)', name_html)
        if not name_m:
            continue
        name = name_m.group(1).strip()

        # Date key from sorttable_customkey
        key_m = re.search(r'sorttable_customkey="(\d{12})"', row)
        if not key_m:
            continue
        key = key_m.group(1)  # "202601140830"
        year = int(key[0:4])
        month = int(key[4:6])
        day = int(key[6:8])
        hour = int(key[8:10])
        minute = int(key[10:12])

        date_str = f"{year}-{month:02d}-{day:02d}"
        if date_str < start or date_str > end:
            continue

        t = normalize_time(hour, minute)
        events.append({'source_name': name, 'date': date_str, 'time': t})

    return events


# ── Matching logic ────────────────────────────────────────────────────

def match_direct_events(raw_events, releases):
    """Match raw source events to release_map entries by source_names."""
    # Build lookup: lowercase source_name -> release entry
    name_map = {}
    for rel in releases:
        for sn in rel.get('source_names', []):
            name_map[sn.lower()] = rel

    entries = []
    matched = set()

    for evt in raw_events:
        key = evt['source_name'].lower()
        # Exact match first
        rel = name_map.get(key)
        # Substring match: source_name must be fully contained in the key
        # (not the reverse, to avoid "Price Index" matching everything)
        # Pick the longest matching source_name to avoid ambiguity
        if not rel:
            best_len = 0
            for sn_lower, r in name_map.items():
                if sn_lower in key and len(sn_lower) > best_len:
                    rel = r
                    best_len = len(sn_lower)
        if not rel:
            continue

        matched.add(rel['name'])
        entries.append({
            'name': rel['name'],
            'date': evt['date'],
            'time': evt.get('time') or rel.get('time'),
            'frequency': rel['frequency'],
            'agency': rel['agency'],
        })

    return entries, matched


# ── FRED fetcher (for remaining releases) ─────────────────────────────

def get_fred_dates(fred_id, api_key, start, end):
    """Fetch upcoming release dates for a single FRED release."""
    url = (
        f'{FRED_BASE}/release/dates?release_id={fred_id}'
        f'&include_release_dates_with_no_data=true'
        f'&realtime_start={start}&realtime_end={end}'
        f'&sort_order=asc&file_type=json'
        f'&api_key={api_key}'
    )
    data = fetch_json(url)
    if data and 'release_dates' in data:
        return [d['date'] for d in data['release_dates']]
    return []


# ── Main ──────────────────────────────────────────────────────────────

DIRECT_SOURCES = {
    'bls': ('BLS (ICS)', fetch_bls_ics),
    'bea': ('BEA (JSON)', fetch_bea_json),
    'fed': ('Fed (JSON)', fetch_fed_json),
    'census': ('Census (HTML)', fetch_census_html),
}


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

    # Group releases by source
    by_source = {}
    for rel in release_map['releases']:
        src = rel.get('source', 'fred')
        by_source.setdefault(src, []).append(rel)

    n_direct = sum(len(v) for k, v in by_source.items() if k != 'fred')
    n_fred = len(by_source.get('fred', []))
    n_manual = len(release_map.get('manual', []))
    print(f"Fetching release dates from {today} to {end}")
    print(f"Tracking {n_direct} direct + {n_fred} FRED + {n_manual} manual")
    print("=" * 50)

    calendar_entries = []
    fred_fallback = []  # Releases that failed direct fetch

    # ── Direct sources ──
    for source_key, (label, fetch_fn) in DIRECT_SOURCES.items():
        releases = by_source.get(source_key, [])
        if not releases:
            continue

        print(f"\n{label}: {len(releases)} releases")
        try:
            raw = fetch_fn(today, end)
            print(f"  Fetched {len(raw)} raw events")
            entries, matched = match_direct_events(raw, releases)
            calendar_entries.extend(entries)
            print(f"  Matched {len(entries)} entries for {len(matched)} releases")

            # Check for unmatched releases
            expected = {r['name'] for r in releases}
            missing = expected - matched
            if missing:
                print(f"  WARNING: No dates found for: {', '.join(sorted(missing))}")
                # Queue missing releases for FRED fallback
                for rel in releases:
                    if rel['name'] in missing and 'fred_id' in rel:
                        fred_fallback.append(rel)
                        print(f"    -> {rel['name']} queued for FRED fallback")

        except Exception as e:
            print(f"  ERROR: {e}")
            print(f"  Falling back to FRED for all {label} releases")
            for rel in releases:
                if 'fred_id' in rel:
                    fred_fallback.append(rel)
                else:
                    print(f"    SKIP {rel['name']} (no fred_id fallback)")

    # ── FRED releases ──
    fred_releases = by_source.get('fred', []) + fred_fallback
    if fred_releases:
        print(f"\nFRED API: {len(fred_releases)} releases")

        # Group by fred_id to avoid duplicate API calls, but emit
        # entries for every release that shares a fred_id
        by_fred_id = {}
        for rel in fred_releases:
            fid = rel.get('fred_id')
            if fid:
                by_fred_id.setdefault(fid, []).append(rel)

        for fred_id, rels in by_fred_id.items():
            names = ', '.join(r['name'] for r in rels)
            print(f"  {names} (rid={fred_id})...", end=' ')
            try:
                dates = get_fred_dates(fred_id, api_key, today, end)
                print(f"{len(dates)} dates")
            except Exception as e:
                print(f"ERROR: {e}")
                dates = []

            for rel in rels:
                for date_str in dates:
                    calendar_entries.append({
                        'name': rel['name'],
                        'date': date_str,
                        'time': rel.get('time'),
                        'frequency': rel['frequency'],
                        'agency': rel['agency'],
                    })

            time.sleep(0.6)

    # ── Manual entries ──
    print(f"\nManual: {n_manual} releases")
    for rel in release_map.get('manual', []):
        manual_dates = [d for d in rel['dates'] if today <= d <= end]
        print(f"  {rel['name']}... {len(manual_dates)} dates")
        for date_str in manual_dates:
            calendar_entries.append({
                'name': rel['name'],
                'date': date_str,
                'time': rel.get('time'),
                'frequency': rel['frequency'],
                'agency': rel['agency'],
            })

    # ── Deduplicate ──
    seen = set()
    unique_entries = []
    for entry in calendar_entries:
        key = (entry['name'], entry['date'])
        if key not in seen:
            seen.add(key)
            unique_entries.append(entry)
    calendar_entries = unique_entries

    # ── Sort and write ──
    time_sort = {
        '8:30 AM ET': 0, '9:00 AM ET': 1, '9:15 AM ET': 2,
        '10:00 AM ET': 3, '11:00 AM ET': 4, '12:00 PM ET': 5,
        '1:00 PM ET': 6, '2:00 PM ET': 7, '3:00 PM ET': 8,
        '4:00 PM ET': 9, '4:30 PM ET': 10,
    }
    calendar_entries.sort(key=lambda e: (
        e['date'],
        time_sort.get(e['time'], 99),
    ))

    # Safety check: don't overwrite good data with near-empty results
    out_path = FILES_DIR / 'calendar.json'
    if len(calendar_entries) < 20:
        print("\n" + "=" * 50)
        print(f"WARNING: Only {len(calendar_entries)} entries — likely a fetch "
              f"failure. Keeping existing {out_path.name}.")
        return 1

    output = {
        'generated': datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
        'range': {'start': today, 'end': end},
        'entries': calendar_entries,
    }

    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    print("\n" + "=" * 50)
    print(f"Wrote {len(calendar_entries)} entries to {out_path}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
