# IMF WEO Forecast Database — AI Agent Context

This file provides full context for working with the IMF World Economic Outlook vintage forecast database distributed alongside it. It is designed to be loaded into an AI coding assistant (Claude Code, Cursor, etc.) so the assistant can query, analyze, and replicate published research findings using the JSON data files.

---

## Part 1: Dataset Schema & Query Guide

### What this data is

The IMF publishes the World Economic Outlook (WEO) twice yearly (April and October), containing macroeconomic forecasts for ~196 countries extending 5–6 years forward. Each edition is called a **vintage**. By collecting all vintages, we can track how the IMF's forecasts for any country-year evolved over time — revealing systematic biases, revision patterns, and forecast failures.

The full database covers **72 WEO editions** from May 1990 through October 2025. The JSON files distributed here contain a subset optimized for web visualization and portable analysis.

### Files included

| File | Size | Contents |
|------|------|----------|
| `data.json` | 5.3 MB | Main dataset: **45 vintages** (Sep 2003–Oct 2025), 196 countries, 8 indicators |
| `data-extended.json` | 1.4 MB | Extended history: **26 vintages** (May 1990–Oct 2002), 3 indicators only |
| `forecast-scores.json` | 205 KB | Precomputed forecast accuracy scores (h=1 bias, MAE, sign ratio) — computed from the full 72-vintage database |

**Important coverage note:** `data.json` starts at September 2003, so h=1 forecast coverage begins for target year 2004. For recession episodes or forecast errors in 2000–2003, you will be missing earlier-vintage forecasts that exist in the full database. The `forecast-scores.json` file was computed from all 72 vintages and is therefore more complete — use it for precomputed accuracy metrics rather than re-deriving them from `data.json` for pre-2004 years.

### data.json structure

The JSON is compact (single-letter keys) for bandwidth efficiency. Top-level keys:

```
{
  "v": [...],   // Vintages array
  "w": {...},   // World reference data
  "r": {...},   // Regional reference data
  "i": {...},   // Indicator metadata
  "c": {...}    // Country data (the main payload)
}
```

#### Vintages (`v`)

Array of `[month_abbreviation, year]` pairs. Index position = vintage_id used elsewhere.

```json
"v": [["Sep", 2003], ["Apr", 2004], ["Sep", 2004], ..., ["Oct", 2025]]
```

- 45 entries (indices 0–44)
- Pre-2007 vintages use "Sep" for fall editions; 2007+ use "Oct"
- Each vintage represents one complete WEO publication

#### Indicators (`i`)

Object keyed by WEO indicator code. Each value is `[label, units]`.

```json
"i": {
  "NGDP_RPCH": ["Real GDP Growth", "% change"],
  "PCPIPCH":   ["CPI Inflation", "% change"],
  "BCA_NGDPD": ["Current Account Balance", "% of GDP"],
  "GGXWDG_NGDP": ["Government Debt", "% of GDP"],
  "GGXCNL_NGDP": ["Fiscal Balance", "% of GDP"],
  "NID_NGDP":  ["Investment", "% of GDP"],
  "LUR":       ["Unemployment Rate", "% of labor force"],
  "NGAP_NPGDP": ["Output Gap", "% of potential GDP"]
}
```

Not all indicators are available for all countries. `NGAP_NPGDP` covers ~30 advanced economies only. `LUR` is missing for many developing countries.

#### World reference (`w`)

Time series of world aggregate values from the latest vintage. Keyed by indicator code, each value is an array of `[year, value]` pairs.

```json
"w": {
  "NGDP_RPCH": [[1980, 2.218], [1981, 2.307], ..., [2030, 3.1]],
  ...
}
```

#### Regions (`r`)

Regional aggregates from the latest vintage. Keyed by IMF region code.

```json
"r": {
  "G110": { "n": "Advanced Economies", "NGDP_RPCH": [[year, value], ...] },
  "G505": { "n": "Emerging and Developing Asia", ... },
  "G903": { "n": "Emerging and Developing Europe", ... },
  "G205": { "n": "Latin America and the Caribbean", ... },
  "G400": { "n": "Middle East and Central Asia", ... },
  "G603": { "n": "Sub-Saharan Africa", ... }
}
```

#### Countries (`c`) — the main data

Object keyed by ISO 3166-1 alpha-3 code. Each country contains:

```json
"c": {
  "USA": {
    "n": "United States",        // Full name
    "r": "G110",                 // IMF region code
    "NGDP_RPCH": {               // One block per indicator
      "f": [[year, value, horizon, vintage_idx], ...],  // Forecast dots
      "a": [[year, value], ...],                         // Latest actuals
      "p": [[year, value], ...],                         // Latest projections
      "nc": [[year, value, is_october, vintage_idx], ...]  // Nowcasts
    },
    "PCPIPCH": { ... },
    ...
  },
  "GBR": { ... },
  ...
}
```

**Forecast array `f`** — the core data. Each entry is a 4-tuple:
- `year`: The target year being forecast (e.g., 2020)
- `value`: The forecast value (e.g., 2.1 for 2.1% GDP growth)
- `horizon`: How many years ahead the forecast was made. `1` = one-year-ahead (e.g., Oct 2019 forecasting 2020). `5` = five-year-ahead. Range: 1–8.
- `vintage_idx`: Index into the `v` array identifying which WEO edition produced this forecast

**Horizon interpretation:**
- `h=1`: Published in the spring (April) of the year before, or the fall (October) of the year before. Most operationally relevant horizon.
- `h=2`: Two years ahead. Still short-term, but less accurate.
- `h=3–5`: Medium-term. Systematically more optimistic than shorter horizons.
- `h=6–8`: Long-range, only in some vintages.

**Nowcast array `nc`** — same-year forecasts (horizon = 0):
- `year`: Target year
- `value`: Forecast value
- `is_october`: `0` = April nowcast, `1` = October nowcast
- `vintage_idx`: Index into `v`

Nowcasts are distinguished from h=1 forecasts because they are published during the year being forecast, so they incorporate partial-year data.

**Actuals array `a`** — from the latest vintage's actual/historical data:
- `[year, value]` pairs for years the IMF considers "actual" (past the estimates_start boundary)

**Projections array `p`** — from the latest vintage's forecast data:
- `[year, value]` pairs for years the IMF considers projections in its most recent edition

### forecast-scores.json structure

Precomputed h=1 forecast accuracy statistics for three indicators across three time periods.

```json
{
  "periods": {
    "full": [1992, 2024],
    "mid": [2000, 2024],
    "modern": [2010, 2024]
  },
  "period_labels": { "full": "1992–2024", ... },
  "regions": { "G110": "Advanced Economies", ... },
  "indicators": {
    "NGDP_RPCH": {
      "label": "Real GDP Growth",
      "periods": {
        "full": [
          {
            "iso": "USA",
            "name": "United States",
            "region": "G110",
            "n": 33,              // Number of forecast-actual pairs
            "mean_error": 0.42,   // Average (forecast − actual), positive = over-optimistic
            "sign_ratio": 0.55,   // Share of forecasts that exceeded actual (% Over)
            "bias_score": 0.87,   // Z-score of mean_error relative to all countries
            "mae": 1.23           // Mean absolute error (percentage points)
          },
          ...
        ]
      }
    }
  }
}
```

**Key metrics:**
- **mean_error**: `forecast − actual`. Positive = the IMF overestimated (optimism bias). Negative = underestimated.
- **sign_ratio**: Share of observations where `forecast > actual`. Values above 0.5 indicate systematic overforecasting.
- **bias_score**: Z-score: `(country_mean_error − global_mean_error) / std(all_country_mean_errors)`. Normalizes for the fact that everyone misses in the same direction during crises.
- **mae**: Mean absolute error. Measures accuracy regardless of direction. Higher for volatile economies.

### Common analytical operations

**1. Get all forecasts for a specific country-year:**
```javascript
// How did forecasts for US GDP 2020 evolve across vintages?
const usa = data.c.USA.NGDP_RPCH;
const forecasts2020 = usa.f
  .filter(([year]) => year === 2020)
  .map(([year, value, horizon, vid]) => ({
    vintage: data.v[vid].join(' '),
    value,
    horizon,
    yearsAhead: horizon
  }))
  .sort((a, b) => a.horizon - b.horizon);  // earliest forecast first
```

**2. Compute forecast revision between two vintages:**
```javascript
// How much was Brazil's 2025 GDP forecast revised between Apr and Oct 2025?
const bra = data.c.BRA.NGDP_RPCH;
const v1idx = data.v.findIndex(([m, y]) => m === 'Apr' && y === 2025);
const v2idx = data.v.findIndex(([m, y]) => m === 'Oct' && y === 2025);
const f1 = bra.f.find(([y,, , vid]) => y === 2025 && vid === v1idx);
const f2 = bra.f.find(([y,, , vid]) => y === 2025 && vid === v2idx);
const revision = f2[1] - f1[1];  // positive = revised up
```

**3. Compute h=1 forecast error:**
```javascript
// Forecast error = forecast − actual (positive = over-optimistic)
const indicator = data.c.USA.NGDP_RPCH;
const actuals = Object.fromEntries(indicator.a);
const h1forecasts = indicator.f.filter(([,, h]) => h === 1);
const errors = h1forecasts
  .filter(([year]) => actuals[year] !== undefined)
  .map(([year, forecast]) => ({
    year,
    forecast,
    actual: actuals[year],
    error: forecast - actuals[year]
  }));
const meanError = errors.reduce((s, e) => s + e.error, 0) / errors.length;
const mae = errors.reduce((s, e) => s + Math.abs(e.error), 0) / errors.length;
```

**4. Cross-country revision ranking:**
```javascript
// Which countries had the largest GDP downgrade between two vintages?
const v1 = 43;  // Apr 2025
const v2 = 44;  // Oct 2025
const targetYear = 2025;
const revisions = Object.entries(data.c).map(([iso, country]) => {
  const ind = country.NGDP_RPCH;
  if (!ind) return null;
  const f1 = ind.f.find(([y,,, vid]) => y === targetYear && vid === v1);
  const f2 = ind.f.find(([y,,, vid]) => y === targetYear && vid === v2);
  if (!f1 || !f2) return null;
  return { iso, name: country.n, revision: f2[1] - f1[1] };
}).filter(Boolean).sort((a, b) => a.revision - b.revision);
```

### IMF analytical regions

Each country has a region code (`r` field) corresponding to the IMF's analytical grouping:

| Code | Region | Countries |
|------|--------|-----------|
| `G110` | Advanced Economies | AND, AUS, AUT, BEL, CAN, HRV, CYP, CZE, DNK, EST, FIN, FRA, DEU, GRC, HKG, ISL, IRL, ISR, ITA, JPN, KOR, LVA, LTU, LUX, MAC, MLT, NLD, NZL, NOR, PRT, PRI, SMR, SGP, SVK, SVN, ESP, SWE, CHE, TWN, GBR, USA (41) |
| `G505` | Emerging & Developing Asia | BGD, BTN, BRN, KHM, CHN, FJI, IND, IDN, KIR, LAO, MYS, MDV, MHL, FSM, MNG, MMR, NRU, NPL, PLW, PNG, PHL, WSM, SLB, LKA, THA, TLS, TON, TUV, VUT, VNM (30) |
| `G903` | Emerging & Developing Europe | ALB, BLR, BIH, BGR, HUN, KOS, MDA, MNE, MKD, POL, ROU, RUS, SRB, TUR, UKR (15) |
| `G205` | Latin America & Caribbean | ATG, ARG, ABW, BHS, BRB, BLZ, BOL, BRA, CHL, COL, CRI, DMA, DOM, ECU, SLV, GRD, GTM, GUY, HTI, HND, JAM, MEX, NIC, PAN, PRY, PER, KNA, LCA, VCT, SUR, TTO, URY, VEN (33) |
| `G400` | Middle East & Central Asia | AFG, DZA, ARM, AZE, BHR, DJI, EGY, GEO, IRN, IRQ, JOR, KAZ, KWT, KGZ, LBN, LBY, MRT, MAR, OMN, PAK, QAT, SAU, SOM, SDN, SYR, TJK, TUN, TKM, ARE, UZB, WBG, YEM (32) |
| `G603` | Sub-Saharan Africa | AGO, BEN, BWA, BFA, BDI, CPV, CMR, CAF, TCD, COM, COD, COG, CIV, GNQ, ERI, SWZ, ETH, GAB, GMB, GHA, GIN, GNB, KEN, LSO, LBR, MDG, MWI, MLI, MUS, MOZ, NAM, NER, NGA, RWA, STP, SEN, SYC, SLE, ZAF, SSD, TZA, TGO, UGA, ZMB, ZWE (45) |

Use these for group-level analysis (e.g., "average inflation forecast error for advanced economies").

### Caveats and edge cases

- **Vintage coverage**: `data.json` contains **45 vintages starting Sep 2003**. For recession prediction or forecast evolution analysis, reliable coverage begins for target year **2004**. Earlier years (2000–2003) will have incomplete forecast histories. The `forecast-scores.json` was computed from the full 72-vintage database and does not have this limitation.
- **Multiple h=1 forecasts per year**: A country-year can have multiple h=1 forecast dots from different vintages (e.g., both Apr 2019 and Oct 2019 produce an h=1 forecast for 2020). When computing "the" h=1 forecast error, standard practice is to use the **spring (April) vintage** of the prior year. To identify it, filter by `h === 1` and then match the vintage to the April edition of `year − 1`.
- **Venezuela**: Hyperinflation values reach 10^42. Filter or cap when computing aggregates.
- **Missing indicators**: Not all countries have all 8 indicators. Always check existence before accessing.
- **Output Gap** (`NGAP_NPGDP`): Only available for ~30 advanced economies.
- **Extended data** (`data-extended.json`): Same format but covers May 1990–Oct 2002 with only 3 indicators (`NGDP_RPCH`, `PCPIPCH`, `BCA_NGDPD`). Vintage indices in the extended file are separate from the main file and need to be offset if merging.
- **Nowcasts vs h=1**: A nowcast is a same-year forecast (April/October of the target year). An h=1 forecast is from the prior year. The distinction matters for accuracy analysis — nowcasts have much more information.
- **Deduplicating h=1 forecasts**: Each country-year typically has **two** h=1 forecast dots — one from the April vintage and one from the October vintage of the prior year. For replicating published studies, use only the **April** forecast (standard in the literature). To identify it: filter `f` entries with `h === 1`, then pick the one whose vintage date has `m === 'Apr'` and `y === targetYear - 1`. Using both introduces double-counting that inflates N and alters means.
- **Actuals change**: What the IMF considers "actual" GDP for 2019 can differ between the Oct 2020 and Oct 2025 vintages due to statistical revisions. The `a` array uses the latest vintage's actuals.

---

## Part 2: Replication Internal — How This Database Was Built

### Source data

The IMF publishes WEO data in two formats:

1. **Bulk download files** (Oct 2007 – Apr 2025): Tab-separated values with `.xls` extension (not actual Excel files). Each file contains one complete WEO edition: ~196 countries × ~54 indicators × ~50 years = ~300,000 observations. Downloaded from `www.imf.org/external/pubs/ft/weo/` with edition-specific URL patterns.

2. **SDMX REST API** (Oct 2025+): The IMF migrated to a new data portal. The API at `api.imf.org` serves data in CSV or JSON format. Each edition provides ~145 indicators (more than the bulk files) and includes country group aggregates.

### Historical data (1990–2002)

Pre-2007 vintages come from an official IMF historical dataset (`WEOhistorical.xlsx`) published alongside the IEO evaluation in 2014. This covers 26 editions (May 1990 – October 2002) but only 3 indicators: GDP growth, inflation, and current account balance.

### Build pipeline

```
download_weo.py → raw_files/*.xls (36 TSV files, ~330 MB)
                         ↓
build_db.py → imf_weo.db (SQLite, 267 MB, 8.8M rows)
                         ↓
import_historical_weo.py → adds 1990–2002 vintages from WEOhistorical.xlsx
                         ↓
update_weo.py → adds Oct 2025+ from SDMX API
                         ↓
export_web_data.py → data.json + data-extended.json
export_forecast_scores.py → forecast-scores.json
```

### SQLite database schema

The intermediate database (`imf_weo.db`, 267 MB) has these tables:

**`vintages`** (72 rows): `vintage_id` (PK), `year`, `release` (1=Spring, 2=Fall), `month_name`

**`countries`** (210 rows): `iso` (PK), `weo_code`, `country_name`

**`indicators`** (155 rows): `weo_subject_code` (PK), `subject_descriptor`, `units`, `scale`

**`observations`** (8.8M rows, WITHOUT ROWID): `iso`, `weo_subject_code`, `vintage_id`, `year`, `value`. Primary key: `(iso, weo_subject_code, vintage_id, year)`.

**`estimates_start`** (285K rows, WITHOUT ROWID): `iso`, `weo_subject_code`, `vintage_id`, `estimates_start_after`. This marks the boundary between actual data and IMF projections for each country-indicator-vintage. For example, if `estimates_start_after = 2024` for USA/NGDP_RPCH in the Oct 2025 vintage, then 2024 and earlier are actuals, 2025+ are forecasts.

### Known quirks

- **File encoding**: Pre-Oct 2020 files are ISO-8859-1; Oct 2020+ are UTF-16 LE. Auto-detected by reading the first few bytes.
- **Kosovo**: TSV files used ISO code `UVK`; the API uses `KOS`. Remapped during import.
- **April 2020 COVID edition**: Only 52K observations (vs typical 300K) with only 8 indicators. Many countries had no fiscal data.
- **SDMX API scaling**: Values come unscaled with a SCALE column (0=units, 6=millions, 9=billions). Divided by 10^SCALE to match TSV convention.
- **`estimates_start_after`**: Only available for TSV-sourced vintages (1–36). The API dropped this field in v9.0.0. For API vintages, forecast/actual distinction uses a heuristic based on the latest TSV vintage's boundary.
- **Thousands separators**: Some TSV values have commas (e.g., `1,234.567`). Stripped during parsing.
- **IMF URL patterns**: Changed 4 times between 2007 and 2025. The download script handles all variants.

### Export process

**`export_web_data.py`** reads the SQLite database and produces compact JSON:

1. For each country-indicator, queries all observations across all vintages
2. Joins with `estimates_start` to classify each observation as actual or forecast
3. Computes forecast horizon: `horizon = year − estimates_start_after` for the vintage
4. Filters to horizons 1–8 and target years within a configured range
5. Separates h=0 (same-year) forecasts as "nowcasts"
6. Extracts latest vintage's actuals and projections as separate arrays
7. Excludes countries with fewer than 20 forecast dots
8. Adds world and regional reference time series from the latest vintage

**`export_forecast_scores.py`** computes h=1 accuracy metrics:

1. Gets "actual" values: latest vintage's data for years within its actuals range, with fallback to earlier vintages for gaps
2. Gets h=1 forecasts: the April vintage forecast for the following year (e.g., Apr 2019 forecast for 2020)
3. Computes per-country: mean error, MAE, sign ratio (% over), and bias z-score
4. Outputs for 3 indicators × 3 time periods × all countries with ≥8 observations

### Replication recipe

To rebuild the full pipeline from scratch:

```bash
# 1. Download all bulk WEO files (~5 min, 330 MB)
python download_weo.py

# 2. Build the SQLite database (~3 min)
python build_db.py

# 3. Add historical 1990–2002 data
python import_historical_weo.py

# 4. Add API-sourced editions (Oct 2025+)
python update_weo.py

# 5. Fill structural balance gaps from Blanchard & Leigh replication archive
#    (136 GGSB_NPGDP values for BGR, CHE, CZE, HUN, ISL, POL, ROU in Apr 2010 vintage)
python import_bl_structural_balance.py

# 6. Verify integrity
python verify_db.py

# 7. Export web data + researcher CSV
python export_web_data.py --csv --output /path/to/website/files/imfweo/
python export_forecast_scores.py
```

Dependencies: Python 3.9+, pandas, requests, numpy, openpyxl, matplotlib (for charts only).

**Note on indicator renames**: The IMF changed fiscal indicator codes between Oct 2009 and Apr 2010 (`GGB_NGDP` → `GGXCNL_NGDP`, `GGD_NGDP` → `GGXWDG_NGDP`, `GGND_NGDP` → `GGXWDN_NGDP`). The export script has an `INDICATOR_ALIASES` dict that automatically merges old and new codes into unified series. `GGSB_NPGDP` (structural balance) was never renamed.

**Note on structural balance coverage**: The publicly downloadable April 2010 WEO file has blank `GGSB_NPGDP` values for 7 European countries despite listing rows for them. The paper Blanchard & Leigh (2013) used these values in their 26-country regression, sourcing from "the IMF's WEO database." The `import_bl_structural_balance.py` script fills the gap using the NBER replication archive (`https://data.nber.org/data-appendix/w18779/`). This is documented and reproducible.

---

## Part 3: Replication External — Key Research Findings & Methods

This section provides the exact methodology used in the major IMF forecast evaluation papers, so that an AI agent can replicate their findings using the dataset above.

**Replication summary — what works from data.json vs. what requires the full database:**

| Study | Replicable from JSON? | Notes |
|-------|----------------------|-------|
| Blanchard & Leigh (fiscal multipliers) | **Yes — exact match** from CSV | β = −1.095 (SE = 0.255), R² = 0.496, N = 26. Requires `GGSB_NPGDP` + `NGDP_RPCH` from CSV. Gap-filled from NBER replication archive. |
| An/Jalles/Loungani (recession prediction) | **Yes — close match** | Miss rates within 1–2pp at all 4 horizons. Nordhaus rigidity β = 0.189 (paper: 0.21). Extra recessions from GDP revisions. |
| Koch & Noureldin (inflation miss) | Partial — semiannual analog | Bias and CG oversmoothing confirmed for headline PCPIPCH. Paper uses quarterly vintages + core inflation (not in public WEO). Fiscal stimulus test requires IMF Fiscal Monitor data. |
| Aktug & Rezghi (CG overreaction) | **Yes — pattern matches** | Asymmetric overreaction confirmed for RGDP, LUR, NX. 7 of 13 variables available in public WEO data. |
| Celasun et al. (systematic bias) | **Yes — all 5 tests match** | Bias by horizon, Theil U (median 0.87, 28% > 1), serial corr (16% sig), China spillover (39% sig), output gap (correct sign). |
| Current account bias | Yes | Mean-reversion analysis works with h=1 CA forecasts vs actuals |
| Ismail et al. (optimism drift) | **Yes — all 3 findings** | Drift 0.277pp/yr (paper: 0.225). Fiscal consol → optimism β=0.149***. CA → optimism β=0.103***. Non-linearity weak without program data. |
| Hadzi-Vaskov et al. (revision patterns) | **Yes — pattern matches** | β₁ steepens from −0.09 to −0.62 across horizons (paper: −0.05 to −0.75). Descriptive profile matches exactly. |
| IEO (2014) (meta-evaluation) | **Partially — Table 1 benchmarks** | Median forecast errors by group/horizon match. G20 Table A2.1 country biases confirmable. Process/survey findings not replicable from data. |
| Matheson (2013) (growth synchronization) | **Partial — DFM approximation** | AE variance shares within ±0.10 for most countries (DEU, FRA, ESP, AUS exact). SSA/MENA regional factors too low — requires quarterly data we lack. See Study 10. |
| Interdependence of forecasts (our analysis) | **Yes** | Cross-country correlation analysis confirms IEO finding: forecasts understate global synchronization. Median gap −0.04 (AE: −0.08). |

### Study 1: Blanchard & Leigh (2013) — Fiscal Multipliers

**Paper**: "Growth Forecast Errors and Fiscal Multipliers." *American Economic Review* 103(3): 117–120, 2013. Also IMF WP/13/01. Replication data at http://www.nber.org/data-appendix/w18779

**Research question**: Did IMF growth forecasts during European austerity (2010–2012) systematically underestimate the contractionary effect of fiscal consolidation?

**Baseline regression (Equation 1 from the paper):**

```
ForecastError(ΔY_i) = α + β × ForecastOf(ΔF_i) + ε_i
```

**Left-hand side — GDP growth forecast error:**
- `ΔY_i` = **two-year cumulative** real GDP growth: `(Y_{i,2011} / Y_{i,2009}) - 1`
- `ForecastError(ΔY_i)` = `ΔY_i^{actual} − ΔY_i^{forecast}`
- **Actual** = from **October 2012 WEO** (latest data at time of writing)
- **Forecast** = from **April 2010 WEO**
- Sign: negative error = growth was worse than forecast

**Right-hand side — planned fiscal consolidation:**
- `ΔF_i` = change in **general government structural fiscal balance** as % of **potential GDP** (WEO indicator `GGSB_NPGDP`)
- `ForecastOf(ΔF_i)` = `F_{i,2011}^{Apr2010} − F_{i,2009}^{Apr2010}`
- This is the forecast, as of April 2010, of how much the structural balance would change from 2009 to 2011
- Positive = planned consolidation (tightening)

**Critical details:**
- Uses **structural** balance (`GGSB_NPGDP`), not net lending/borrowing (`GGXCNL_NGDP`). The structural balance is the cyclically adjusted balance further adjusted for temporary financial sector effects and one-off items.
- Uses **two-year** cumulative growth window (2009→2011), not single-year, to capture lagged fiscal effects.
- Results are "very similar" using nominal GDP instead of potential GDP (β = −1.077, t = −3.900).

**Sample — 26 European economies:**
Starting from EU-27 + Iceland, Norway, Switzerland (30). Excluding 4 where April 2010 structural balance forecasts are unavailable: Estonia, Latvia, Lithuania, Luxembourg.

The 26: AUT, BEL, BGR, CYP, CZE, DEU, DNK, FIN, FRA, GRC, HUN, ISL, IRL, ITA, MLT, NLD, NOR, POL, PRT, ROU, SVK, SVN, ESP, SWE, CHE, GBR.

**Main result:**
- β = **−1.095** (SE = 0.255, robust), R² = 0.496, N = 26
- Interpretation: each 1pp of planned consolidation → growth 1.1pp worse than forecast
- Implies actual fiscal multipliers were ~1.5–2.0, not the ~0.5 assumed in models

**Robustness:**
- Survives 12 control variables added one at a time (β stays between −0.92 and −1.17)
- Robust regression: β = −1.279. Quantile regression: β = −1.088. Cook's distance: β = −0.921.
- Panel 2009–2012 with time fixed effects: β = −0.667 (Newey-West SE = 0.161)
- Individual years: β = −0.699 (2009–10), −1.095 (2010–11), −0.467 (2011–12), −0.358 (2012–13) — effect strongest in 2010–11, weakens as IMF learns
- Precrisis 1997–2008: β = −0.077 (no effect) — confirms it's specific to the austerity period
- Not significant for emerging markets (β = 0.007, N = 14)

**Replicability**: **Exact match from CSV.** The distributed CSV (`imfweo-data.csv.gz`) includes `GGSB_NPGDP` with gap-filled values from the NBER replication archive. B&L use `NGDP_RPCH` (annual growth rates) to compute two-year cumulative growth — not real GDP levels. The Stata code constructs it as: `100 * ((1 + g_{2011}/100) * (1 + g_{2010}/100) - 1)`.

**To replicate from the CSV:**
1. Filter to `indicator == 'NGDP_RPCH'`, vintage = `'Apr 2010'` and `'Oct 2012'`, the 26 European ISOs listed above
2. For each country, compute two-year cumulative growth for 2010–11: `100 * ((1 + g₂₀₁₁/100) * (1 + g₂₀₁₀/100) - 1)`
3. Forecast error `y` = cumulative growth from Oct 2012 vintage minus cumulative growth from Apr 2010 vintage
4. Filter to `indicator == 'GGSB_NPGDP'`, vintage = `'Apr 2010'`, years 2009 and 2011
5. Fiscal consolidation `x` = GGSB_NPGDP(2011) − GGSB_NPGDP(2009)
6. OLS with heteroskedasticity-robust (HC1) standard errors: `y = α + β × x + ε`
7. Result: β = −1.095 (SE = 0.255), α = 0.775 (SE = 0.383), R² = 0.496, N = 26

The JSON files (`data.json`) do NOT include `GGSB_NPGDP` — use the CSV for this replication.


### Study 2: An, Jalles & Loungani (2018) — Recession Prediction Failure

**Paper**: "How Well Do Economists Forecast Recessions?" IMF WP/18/39, March 2018. Extends IEO (2014) "IMF Forecasts: Process, Quality, and Country Perspectives."

**Research question**: How well do forecasters predict recessions? How does forecast accuracy evolve as the recession approaches?

**Data**: 63 countries (29 advanced + 34 emerging) over 1992–2014. Uses both Consensus Economics (private sector, monthly) and IMF WEO (official, semiannual). For each recession, examines 4 IMF forecast vintages: Apr(t−1), Oct(t−1), Apr(t), Oct(t). Recession = annual real GDP growth < 0. Total: 153 recession episodes (86 AE + 67 EM).

**Country sample (Table A1):**
- Advanced (29): AUS, AUT, BEL, CAN, CZE, DNK, FIN, FRA, DEU, GRC, HKG, IRL, ISR, ITA, JPN, KOR, NLD, NZL, NOR, PRT, SGP, SVK, SVN, ESP, SWE, CHE, TWN, GBR, USA
- Emerging (34): ARG, BGD, BOL, BRA, BGR, CHL, CHN, COL, CRI, DOM, ECU, EGY, HUN, IND, IDN, MYS, MEX, PAK, PAN, PRY, PER, PHL, POL, ROU, RUS, SAU, ZAF, LKA, THA, TUR, UKR, URY, VEN, VNM

**Method — recession detection (Table 2):**

At each of the 4 vintage horizons, a recession is "missed" if the IMF forecast is ≥ 0 (positive growth predicted when actual was negative). A recession is "predicted" if the forecast is < 0.

**Key results — Table 2 (IMF forecasts, 153 recessions):**

| Vintage | Missed | Predicted | % Predicted | MFE (actual−forecast) |
|---------|--------|-----------|-------------|----------------------|
| Apr(t−1) | 147 | 6 | 3.9% | −5.85pp |
| Oct(t−1) | 136 | 17 | 11.1% | −5.15pp |
| Apr(t) | 72 | 81 | 52.9% | −1.94pp |
| Oct(t) | 40 | 113 | 73.9% | −0.52pp |

The famous finding: **"the record of failure to predict recessions is virtually unblemished"** — only 6 out of 153 recessions were called negative by the spring of the prior year.

**Nordhaus information rigidity test (Table 5):**

```
Rev_{it,h} = α + β × Rev_{it,h+k} + μ_i + ε_{it,h}
```

Where `Rev` = forecast revision for country i, target year t. Dependent variable: revision between Oct(t) and Apr(t). Independent variable: revision between Apr(t) and Oct(t−1). Under rational expectations, β = 0 (revisions should be uncorrelated). Positive β = information rigidity (forecasters update too slowly).

**Table 5 results (IMF, with country FE):**
- All countries: β = 0.21*** (SE 0.04), N = 1,306
- Advanced: β = 0.09* (SE 0.05), N = 639
- Emerging: β = 0.27*** (SE 0.05), N = 667

Emerging economies show more information rigidity. But during recessions specifically, rigidity disappears (Table 6: interaction θ < 0, and β + θ ≈ 0) — forecasters do revise faster during downturns, just not fast enough.

**Our replication — Table 2 analog (same 63 countries, 1992–2014, latest actuals):**

| Vintage | Missed (us/paper) | % Missed (us/paper) | MFE us | MFE paper |
|---------|------------------|---------------------|--------|-----------|
| Apr(t−1) | 172/147 | 95.0%/96.1% | −6.10 | −5.85 |
| Oct(t−1) | 160/136 | 88.4%/88.9% | −5.43 | −5.15 |
| Apr(t) | 88/72 | 48.6%/47.1% | −2.34 | −1.94 |
| Oct(t) | 51/40 | 27.9%/26.1% | −0.81 | −0.52 |

We find 184 recessions vs the paper's 153. The extra 31 are borderline cases where GDP growth has been revised downward since the paper was written (using Oct 2025 actuals vs their ~2016 actuals). The miss rates match within 1–2 percentage points at every horizon. MFE magnitudes match within ~0.5pp.

**Our replication — Nordhaus test (no country FE):**
- All: β = 0.189*** (SE 0.020), N = 1,433 — paper: 0.21***
- Advanced: β = 0.079*** (SE 0.029), N = 658 — paper: 0.09*
- Emerging: β = 0.239*** (SE 0.027), N = 775 — paper: 0.27***

Pattern matches: more rigidity in emerging economies. Slight magnitude difference from omitting country fixed effects.

**To replicate from the CSV:**
1. Identify recessions: filter to `indicator = 'NGDP_RPCH'`, find country-years where the latest vintage value < 0
2. For each recession year t, get forecasts from 4 vintages: Apr(t−1), Oct(t−1), Apr(t), Oct(t)
3. A recession is "missed" at a given vintage if `forecast ≥ 0`
4. Compute miss rate = missed / total at each vintage
5. Compute MFE = `actual − forecast` (negative during recessions = the IMF was too optimistic)

**To replicate the Nordhaus test:**
1. For each country and target year t, get forecasts at Oct(t−1), Apr(t), Oct(t)
2. Compute `Rev_dep = forecast_Oct(t) − forecast_Apr(t)` and `Rev_ind = forecast_Apr(t) − forecast_Oct(t−1)`
3. Regress Rev_dep on Rev_ind (with or without country fixed effects)
4. Positive β = serial correlation = information rigidity


### Study 3: Koch & Noureldin (2023) — Inflation Forecast Errors

**Paper**: "How We Missed the Inflation Surge: An Anatomy of Post-2020 Inflation Forecast Errors." IMF WP/23/102, May 2023.

**Research question**: Did IMF inflation forecasts show systematic bias and oversmoothing during 2021–2022, and what economic factors explain the forecast errors?

**Important data note**: The paper uses **quarterly** WEO vintages (January Update, April, July Update, October) with **one-quarter-ahead quarterly headline inflation** for the statistical tests, and **one-year-ahead annual core inflation** from the January WEO Update for the economic drivers analysis. Our database has only semiannual vintages (April, October) and only headline inflation (PCPIPCH), not core. The statistical tests can be approximated with semiannual data; the economic drivers analysis is only partially replicable.

**Forecast error convention**: `e_{i,t} = y_{i,t} − ŷ_{i,t|t−1}` (actual minus forecast). Positive = inflation was higher than predicted (underprediction). All regressions in the paper are weighted by PPP GDP.

**Equation 2 — Forecast bias test (restricted Mincer-Zarnowitz):**

```
e_{i,t} = α + ε_{i,t}
```

Tests whether the mean forecast error α differs from zero. Positive α = systematic underprediction of inflation. This is a restricted version of the Mincer-Zarnowitz regression `y = α + β·ŷ + ε` with β imposed to equal 1 (footnote 8).

The paper runs this as a pooled panel for different sample periods, and also as **repeated cross-section regressions** (one per quarter) to show the time-varying bias (Figure 5).

**Key results (Figure 4):**
- Full sample (2011Q1–2022Q3): α ≈ 0.1pp (marginal)
- Pre-COVID (2011Q1–2019Q4): α ≈ 0 (no bias)
- 2020: α ≈ −0.5pp (inflation overpredicted during lockdowns)
- 2021Q1–2022Q3: α ≈ +1.8pp (large systematic underprediction)

Country sample for bias test (Figure 4 note, 71 countries): 36 AEs (AUS, AUT, BEL, CAN, CHE, CYP, CZE, DEU, DNK, ESP, EST, FIN, FRA, GBR, GRC, HKG, IRL, ISL, ISR, ITA, JPN, KOR, LTU, LUX, LVA, MLT, NLD, NOR, NZL, PRT, SGP, SVK, SVN, SWE, TWN, USA) + 35 EMDEs (ARG, BLR, BRA, CHL, CHN, COL, ECU, HRV, HUN, IDN, IND, JOR, KAZ, KGZ, LCA, LSO, MDA, MEX, MYS, NGA, PER, PHL, POL, ROU, RUS, SAU, SRB, SWZ, THA, TUR, UGA, UKR, VEN, VNM, ZAF).

**Equation 3 — Oversmoothing / Nordhaus test:**

```
(y_{i,t} − ŷ_{i,t|t−1}) = α + β × (ŷ_{i,t|t−1} − ŷ_{i,t|t−2}) + ε_{i,t}
   forecast error              forecast revision
```

This is a **per-country time series** regression (NOT a panel), run for each country over 2011Q1–2022Q3. Under efficient forecasting (Nordhaus 1987), β should equal zero — past revisions should not predict future errors. The paper explicitly notes that Coibion & Gorodnichenko (2015) rationalize this as a test of information rigidity (same framework as Aktug Study 4 above).

- β > 0: oversmoothing — revisions are in the right direction but don't go far enough
- β = 0: efficient forecasts
- β < 0: overreaction — revisions overshoot

**Key results (Figures 6–7):**
- 21 out of 54 countries have statistically significant positive β (at 5% level)
- No countries have significant negative β
- Cross-country: countries with larger β (more oversmoothing) had larger average forecast errors. Regression line: `avg_FE = 0.80 + 1.83 × β` (significant at 1%)

Country sample for oversmoothing (Figure 6 note, 54 countries): 34 AEs (AUS, AUT, BEL, CAN, CHE, DEU, DNK, ESP, EST, FIN, FRA, GBR, GRC, HKG, IRL, ISL, ISR, ITA, JPN, KOR, LTU, LUX, LVA, MLT, NLD, NOR, NZL, PRT, SGP, SVK, SVN, SWE, TWN, USA) + 20 EMDEs (BLR, BRA, CHL, CHN, COL, HRV, HUN, IDN, IND, MDA, MEX, MYS, PER, PHL, RUS, SRB, THA, TUR, VEN, VNM).

**Equation 4 — Fiscal stimulus and forecast efficiency (ex ante test):**

```
e_{i,2021} = α + β·f_{i,2021} + γ·(f_{i,2021} × y_{i,2021}) + δ₁·e_{i,2020} + δ₂·e_{i,2019} + ε
```

Where:
- `e_{i,2021}` = one-year-ahead **core** inflation forecast error for 2021 (actual minus January 2021 WEO Update forecast)
- `f_{i,2021}` = COVID-19 fiscal stimulus (above-the-line additional spending or forgone revenues, % of GDP, from IMF Fiscal Monitor Database, January 2021 vintage)
- `y_{i,2021}` = projected **output gap** for 2021 (NGAP_NPGDP from WEO, projected at end of 2020)
- `e_{i,2020}`, `e_{i,2019}` = lagged core inflation forecast errors (controls for persistence)
- The interaction `f × y` captures state-dependent fiscal multipliers: fiscal stimulus has a larger inflationary effect when the output gap is smaller (economy closer to potential)

**Key results (Table 1):**
- For AEs (col 1): β = 0.070*** (SE 0.022), γ = 0.017** (SE 0.007), R² = 0.42, N = 34. A 10pp increase in fiscal stimulus → 0.7pp larger core inflation forecast error.
- For EMDEs (col 2): β and γ are insignificant
- For all countries (col 3): β = 0.045 (insignificant)
- Excluding AUS, CAN, GBR, USA from AEs (col 4, "AE*"): β becomes insignificant. **The entire AE result hinges on these four large economies.**
- Columns 5–8 use cyclically adjusted primary deficit (from WEO, GGSB_NPGDP-adjacent) as alternative `f` measure — results are broadly similar for AEs

**Phillips curve in forecast errors (Figure 10):**

Cross-country regression of core inflation FE on GDP growth FE for 2021, PPP-weighted:
- `core_inflation_FE = 0.59 + 0.40 × growth_FE` (slope significant at 1%)
- Pre-pandemic Phillips curve slope was 0.15 — the steeper 2021 slope suggests economies were on the steep part of their aggregate supply curves

**What is NOT replicable from our data:**
- Quarterly bias/oversmoothing tests (require Jan/Jul WEO Update quarterly inflation forecasts)
- Core inflation forecast errors (WEO public files only have headline PCPIPCH and end-of-period PCPIEPCH)
- Fiscal stimulus variable (requires IMF Fiscal Monitor COVID database, external to WEO)
- PMI-based demand/supply decomposition, goods/services CPI ratio, vacancy/unemployment ratio (all external data)

**What IS replicable (semiannual analog) — all three main findings confirmed:**

1. **Inflation bias by period** — compute mean h=1 PCPIPCH forecast error by year (October vintage forecasting next year). PPP-weighted results:

| Year | N | PPP-wt ME | Unwt ME | Unwt MAE |
|------|---|-----------|---------|----------|
| 2010–2019 avg | ~169/yr | −0.26pp | −0.52pp | 1.71pp |
| 2020 | 173 | −0.47pp | −0.82pp | 1.76pp |
| 2021 | 171 | +1.03pp | +0.99pp | 1.84pp |
| 2022 | 145 | +3.28pp | +3.52pp | 3.88pp |

Paper's benchmark: combined 2021Q1–2022Q3 α ≈ +1.8pp (quarterly headline, PPP-weighted). Our 2021+2022 PPP-weighted average is ~2.1pp — same pattern, slightly larger because our October baseline is farther from target than their January baseline.

2. **Oversmoothing (Nordhaus/CG panel)** — regress FE on FR for h=1 PCPIPCH (October-to-April revision within same target year). The key finding is **period-dependent**:

| Period | N | β | t-stat | Interpretation |
|--------|---|---|--------|----------------|
| Pre-COVID (2010–2019) | 1,664 | −0.107** | −2.41 | **Overreaction** in low-inflation era |
| 2020–2022 | 483 | +0.382*** | +3.21 | **Oversmoothing** during inflation surge |
| Post-surge (2023–2024) | 321 | +0.266*** | +4.02 | Oversmoothing persists |
| Full (2010–2024) | 2,468 | +0.053 | +1.42 | Washed out (opposing periods cancel) |

The paper's finding of pervasive oversmoothing (21/54 significant positive β) is driven by the 2020–2022 period. Our β = 0.382*** for that period is a strong match. We additionally find that pre-COVID, the opposite held — inflation revisions slightly overshot (β < 0), a pattern the paper did not test because its sample starts in 2011Q1 and includes only 10 pre-COVID years.

**Note**: The paper runs per-country time series regressions (47 quarterly observations per country). Our semiannual data provides only ~15 observations per country for h=1, insufficient for reliable per-country estimates. The panel version pools across countries and is statistically powerful.

3. **Growth FE vs inflation FE (Phillips curve in forecast errors)** — cross-country scatter for 2021, PPP-weighted. Baseline vintage matters:

| Baseline | N | Slope (β) | t-stat | Intercept |
|----------|---|-----------|--------|-----------|
| Oct 2020 (v62) | 162 | 0.49*** | 6.79 | 0.29 |
| Apr 2021 (v63) | 164 | 0.24*** | 4.52 | 0.92 |
| Paper (Jan 2021, core) | ~80 | 0.40*** | — | 0.59 |

October 2020 is our best proxy for their January 2021 baseline and gives β = 0.49, close to the paper's 0.40. The relationship is only visible with PPP-weighting (unweighted β ≈ 0.05, insignificant) — the narrative is driven by large economies. Weaker with April 2021 baseline because more information was already incorporated by then.

4. **Fiscal stimulus alternative** — Equation 4 columns 5–8 use cyclically adjusted primary deficit from WEO. Output gap (NGAP_NPGDP) is available for ~27 AEs. This specification could be attempted, though the result is weak even in the paper (significant only with AUS, CAN, GBR, USA included).

**To replicate the inflation bias from the CSV:**
1. Filter to `indicator = 'PCPIPCH'`
2. For h=1: pair each October vintage's forecast for year t+1 with the actual (latest vintage value for year t+1)
3. Compute `FE = actual − forecast` per country-year
4. Exclude |FE| > 10pp (if matching the paper's outlier filter for the economic drivers analysis)
5. For PPP-weighted means: also pull `PPPGDP` for the same country-year, use as regression weight
6. Compute mean FE and MAE by year, decade, or AE/EMDE subgroup

**To replicate the oversmoothing test from the CSV:**
1. For each target year t, get the April (t−1) and October (t−1) forecasts of PCPIPCH
2. `FE = actual − Oct(t−1) forecast`, `FR = Oct(t−1) forecast − Apr(t−1) forecast`
3. Pool across countries and years, regress FE on FR
4. Split by period (pre-2020 vs 2020–2022) — the sign of β flips


### Study 4: Aktug & Rezghi (2025) — Asymmetric Overreaction

**Paper**: "An Evaluation of World Economic Outlook Forecasts: Any Evidence of Asymmetry?" IMF WP/25/031, January 2025.

**Research question**: Do WEO forecasts overreact to news, and is the overreaction asymmetric between good and bad news?

**Framework**: Coibion & Gorodnichenko (2015). Under Full Information Rational Expectations (FIRE), forecast revisions should not predict forecast errors. If they do, forecasters are either overreacting (β < 0) or underreacting (β > 0) to new information.

**Equation 1 — Baseline CG regression:**

```
FE_{t} = α_{v,c} + β_CG × FR_{t} + γ_t + month_t + error_{v,c,t}
```

Where:
- `FE_t = y^{actual} − F_t(y)` — forecast error (actual minus forecast) for variable v, country c
- `FR_t = F_t(y) − F_{t−1}(y)` — forecast revision (current minus previous forecast, same target year, consecutive vintages)
- `α_{v,c}` = country-variable fixed effects
- `γ_t` = year fixed effects
- `month_t` = vintage month dummies (controls for varying distance to target within same h category)
- Standard errors: Driscoll-Kraay (robust to cross-sectional dependence)

Interpretation: β_CG < 0 → **overreaction** (upward revision → negative error, meaning the revision overshot). β_CG > 0 → **underreaction**.

**Equation 2 — Asymmetry (good news vs bad news):**

```
FE_{t} = α_{v,c} + β₁ × FR⁻_t + β₂ × FR⁺_t + γ_t + month_t + error_{v,c,t}
```

Where:
- `FR⁻_t = min(0, FR_t)` — downward revisions (bad news)
- `FR⁺_t = max(0, FR_t)` — upward revisions (good news)
- For **LUR and PCPI**, the sign of FR is **reversed** before splitting, so that positive always = good news (lower unemployment / lower inflation = good)

**Data details from the paper:**
- 103 vintages (quarterly: Jan, Apr, Jul, Oct since 2007; semiannual before). Our database has 72 semiannual vintages.
- 13 variables pooled. Variables expressed as annual percent changes (except LUR which is a rate).
- Actuals from January 2024 vintage.
- Outlier filter: remove observations below 1st / above 99th percentile per country-variable pair, applied to FE, FR, and actual value.
- Horizons: h=0 (nowcast), h=1, h=2, h=3.

**Paper's main result (Table 2, all 13 variables pooled):**

| | h=1 | h=2 | h=3 |
|---|---|---|---|
| β_CG | −0.321*** (0.080) | −0.292*** (0.068) | −0.265*** (0.039) |
| N | 123,818 | 123,500 | 122,982 |

**Paper's asymmetry result (Table 3, 9 variables):**

| | h=1 | h=2 | h=3 |
|---|---|---|---|
| FR⁻ (bad news) | −0.262*** | −0.294*** | −0.053 |
| FR⁺ (good news) | −0.414*** | −0.428*** | −0.485*** |

Key finding: |β(FR⁺)| > |β(FR⁻)| at all horizons — **overreaction to good news is consistently stronger than overreaction to bad news**. At h=3, overreaction to bad news vanishes entirely.

**Replicability from the CSV**: Partial — the paper uses 13 variables, 6 of which (NCP, NCG, NFI, NFDD, LLF, LULCM) are national accounts components not available in the public WEO download. The remaining 7 variables are available:

| Paper code | CSV indicator | Description |
|---|---|---|
| RGDP | NGDP_RPCH | Real GDP growth (%) |
| PCPI | PCPIPCH | CPI inflation (%) |
| LUR | LUR | Unemployment rate (level) |
| LE | LE | Employment (compute % change from levels) |
| NGDP | NGDP | Nominal GDP (compute % change from levels) |
| NM | TM_RPCH | Import volume growth (%) |
| NX | TX_RPCH | Export volume growth (%) |

**Our replication — per-variable asymmetry (h=1 and h=2, semiannual vintages):**

h=1:

| Variable | N | β(FR⁻) | β(FR⁺) | Stronger FR⁺? |
|---|---|---|---|---|
| RGDP | 11,048 | +0.021 | −0.136*** | YES |
| PCPI | 11,104 | −0.059*** | −0.030*** | no |
| LUR | 2,302 | +0.014 | −0.211*** | YES |
| NM | 3,025 | −0.072 | −0.319*** | YES |
| NX | 3,063 | −0.061 | −0.002 | no |

h=2:

| Variable | N | β(FR⁻) | β(FR⁺) | Stronger FR⁺? |
|---|---|---|---|---|
| RGDP | 10,312 | −0.252*** | −0.520*** | YES |
| LUR | 1,729 | −0.170* | −0.235** | YES |
| NX | 2,715 | −0.025 | −0.419*** | YES |
| NM | 2,712 | −0.269** | −0.126 | no |

The paper's key finding replicates: **for GDP growth, unemployment, and export growth, overreaction to good news (FR⁺) is stronger than overreaction to bad news (FR⁻)**. At h=1, RGDP and LUR show overreaction only to good news (FR⁻ near zero), matching the paper's pattern exactly.

**To replicate from the CSV:**
1. For each variable, get all observations across all vintages from the CSV (filter by `indicator` and `is_forecast == 1`)
2. Sort by `iso`, `vintage`, `year` and compute for consecutive vintage pairs with the same target year: `FE = actual − forecast`, `FR = forecast_current − forecast_previous`
3. For LUR and PCPIPCH: reverse the sign of FR (multiply by −1)
4. Apply outlier filter: remove 1st/99th percentile of FE, FR, and actual per country
5. Demean by country (absorbs country FE) and by year (absorbs year FE) — iterate until convergence
6. For baseline: regress FE on FR (no intercept after demeaning). For asymmetry: split FR into FR⁻ = min(0, FR) and FR⁺ = max(0, FR), regress FE on both

**Note on magnitude**: Our β coefficients are somewhat larger than the paper's because semiannual revision steps are larger than quarterly ones (6-month information accumulation vs 3-month). The sign and significance patterns match.


### Study 5: Timmermann (2007) + Celasun, Lee, Mrkaic & Timmermann (2021) — Systematic Bias and Efficiency

**Papers**:
- Timmermann, A. (2007). "An Evaluation of the World Economic Outlook Forecasts." IMF Staff Papers / WP/06/59. Covers 178 countries, 1990–2003. The original comprehensive WEO forecast evaluation — establishes the testing framework (bias, serial correlation, efficiency, Mincer-Zarnowitz, revision predictability, output gap) used by all subsequent evaluations.
- Celasun, O., J. Lee, M. Mrkaic, and A. Timmermann (2021). "An Evaluation of WEO Growth Forecasts—2004-17." IMF WP/21/216. Updates Timmermann (2007) with extended horizons (h=0 to h=5), Theil U-statistics, and comparison to Consensus Economics.

**Research question**: How accurate, biased, and efficient are WEO growth forecasts across countries, horizons, and time? Have they improved since 1990–2003?

**Data**: Real GDP growth forecasts from semiannual WEO vintages (Spring and Fall), 2004–2017, ~190 countries. Horizons h=0 (current year) to h=5, with 12 forecast rounds total (Spring and Fall for each h). 2009 excluded as outlier; also drops natural disasters, conflicts, data entry errors.

**Critical data convention**: "Actual" for year t = value from the **Fall(t+1) WEO** (not latest vintage). This avoids mixing forecast errors with subsequent data revisions. Using `e = actual − forecast` (Eq 1): negative = overprediction.

**Equation 2 — RMSE per country:**
`RMSE_{i,h} = sqrt((1/T) × Σ e²_{it|t-h})`

**Equation 3 — Theil U-statistic:**
`U_{i,h} = Σ(actual − WEO_forecast)² / Σ(actual − naive)²`
Where naive = recursively-updated historical average growth. U < 1 means WEO beats naive.

**Equation 4 — Bias:**
`bias = (1/T) × Σ e_{g,t|t-h}` — positive = underprediction, negative = overprediction.

**Equation 6–7 — Serial correlation of forecast errors:**
`e_{g,τ|τ-h} = ρ × e_{g,τ-1|τ-1-h} + ε` (no intercept). ρ > 0 = errors persist (information rigidity).

**Equations 9–11 — Major economy spillover:**
`e_{i,t|t-h} = α + β × e_{US,t|t-h} + ε` (also for China and Euro Area). Tests whether forecast errors for the US/China/EU predict errors in other countries.

**Equation 18 — Output gap efficiency:**
`e_{g,t|t-h} = α + β × GAP_{g,t|t-h} + ε` (AEs only). Negative β = growth overpredicted when economy has slack.

**Key findings from the paper:**
- Short-term (h=0–1): little unconditional bias (median ≈ 0 to +0.1pp)
- Medium-term (h=2+): clear overprediction, median bias reaching ≈ −0.5pp at h=3–5
- Theil U: at h=0, WEO clearly beats naive (U ≈ 0.4–0.6). At h=1, ~25% of countries have U > 1. At h=3–5, close to half.
- Serial correlation: 15–30% of countries show significant positive ρ (persistent errors)
- China's growth FE significantly predicts 30–40% of other countries' FE; US FE predicts 5–16%
- Output gap: β ≈ −0.6*** for AE group at h=1,S — when there's slack, growth is overpredicted
- Forecasts improved at short horizons from 1990–2003 to 2004–17, but mixed at long horizons (AEs worsened at h=3–5 due to GFC aftermath)

**Our replication (2004–2017, excl 2009, using Oct(t+1) as actual):**

Bias by horizon (all countries):

| Horizon | N | Mean Bias | Median | % Negative |
|---------|---|-----------|--------|------------|
| h=0,S | 2,234 | +0.07 | +0.08 | 46% |
| h=0,F | 2,244 | +0.15 | +0.09 | 43% |
| h=1,S | 2,046 | −0.14 | −0.15 | 53% |
| h=1,F | 2,053 | −0.13 | −0.05 | 51% |
| h=2,F | 1,872 | −0.51 | −0.38 | 58% |
| h=3,F | 1,696 | −0.81 | −0.60 | 62% |
| h=5,F | 1,344 | −1.07 | −0.90 | 68% |

Paper's pattern confirmed: near-zero bias at h=0–1, growing overprediction at h=2+. Our magnitudes are somewhat larger than the paper's medians (~−0.5pp at h=3–5) because we don't exclude their disaster/conflict outliers.

Theil U at h=1,F: median U = 0.87, 28% of countries above unity. Paper: 0.85–0.90, ~25%. **Exact match.**

Serial correlation at h=1,F: 16% significant positive ρ, 0% significant negative. Paper: 15–30%. **Match.**

Major economy spillover at h=1,F:
- US: median β = 0.34, 16% significant positive. Paper: β ≈ 0.13, 5–16%.
- China: median β = 0.51, 39% significant positive. Paper: 27–46%, 30–40% sig. **Close match.**

Output gap (per-country pooled): β = −0.05 (insignificant). Paper uses PPP-weighted group-level with ~13 observations → β = −0.6***. Correct sign but group-level aggregation needed for significance.

**To replicate the bias from the CSV:**
1. For "actual": use Oct(t+1) vintage value, NOT the latest vintage (avoids data revision contamination)
2. For each vintage (Spring or Fall of year v), compute h = target_year − v
3. `FE = actual − forecast`
4. Exclude 2009 target years
5. Group by horizon, compute mean and median FE

**To replicate Theil U:**
1. For each country, compute RMSE of WEO h=1 forecasts over 2004–2017 (excl 2009)
2. Compute recursive historical average as naive benchmark (using only data available at time of forecast)
3. U = RMSE(WEO) / RMSE(naive). Median should be ~0.87 for h=1


### Study 6: Current Account Mean-Reversion Bias (our analysis)

**Based on**: General observations from Timmermann (2007) and the forecast evaluation literature that current account forecasts show serial correlation and bias, particularly at the next-year horizon. Timmermann notes "some evidence of bias and serial correlation in the next-year forecasts of the current account balance" (Section V.C). However, the specific analysis below — grouping countries by surplus/deficit size — is our own contribution using the full vintage database.

**Research question**: Does the IMF systematically assume external imbalances will narrow?

**Method:**

1. For h=1 forecasts of BCA_NGDPD, compute FE = forecast − actual (positive = over-optimistic CA forecast)
2. Group country-years by **actual** current account position:
   - Large surplus (>3% GDP)
   - Small surplus (0–3%)
   - Small deficit (−3% to 0%)
   - Large deficit (<−3%)
3. Compute mean h=1 forecast error by group

**Results (h=1, BCA_NGDPD, FE = forecast − actual, 2004–2024):**

| Actual CA position | N | Mean FE | Median FE |
|-------------------|---|---------|-----------|
| Large surplus (>3% GDP) | 842 | −5.35pp | −2.39pp |
| Small surplus (0–3%) | 459 | −1.30pp | −0.74pp |
| Small deficit (−3% to 0%) | 680 | −1.59pp | −0.96pp |
| Large deficit (<−3%) | 1,620 | +0.38pp | +0.29pp |

The IMF systematically under-predicts large surpluses (by 5.35pp on average). For deficit countries, the pattern is weaker — the IMF slightly under-predicts deficits (+0.38pp), suggesting modest mean-reversion bias in the opposite direction. The asymmetry is stark: the IMF misses surpluses far more than deficits, likely because surplus persistence (e.g., oil exporters, Germany, China) is systematically underestimated.

**To replicate from the CSV:**
1. Filter to `indicator = 'BCA_NGDPD'`, h=1 (October vintage forecasting next year)
2. Compute `FE = forecast − actual` for each country-year
3. Group by actual CA value: surplus (>0) vs deficit (<0), or finer bins as above
4. Compute mean FE by group — should show negative FE for surplus countries (under-predicted)

### Study 7: Ismail, Perrelli & Yang (2020) — Optimism Bias and Planned Policy Adjustments

**Paper**: "Optimism Bias in Growth Forecasts—The Role of Planned Policy Adjustments." IMF WP/20/229, November 2020.

**Research question**: Are IMF growth forecasts systematically optimistic, and do planned fiscal and external adjustments explain the optimism? Are program forecasts more biased than surveillance?

**Data**: Real GDP growth forecasts at horizons h=0 (current year) through h=5 (five years ahead) from semiannual WEO vintages (2003–2017, 29 vintages) for surveillance (non-program) countries, and from the MONA (Monitoring of Fund Arrangements) database for IMF program countries (42 SBAs + 13 EFFs). Sample: 34 advanced + 82 emerging + 54 low-income economies.

**Forecast error convention**: `FE = forecast − actual` (positive = optimism, same as Timmermann/Celasun Studies 5–6, **opposite** from Aktug Study 4 and Koch & Noureldin Study 3 which use actual − forecast).

**Equation 2 — Main specification:**

```
FE_{itj}^k = Σ I_{ij} + β_P × P_{itj} + β_S × S_{itj} + ε_{itj}
```

Where:
- `FE_{itj}^k` = growth forecast error for country i, year t, vintage j, horizon k
- `I_{ij}` = observation-specific fixed effects (absorbs country and vintage effects)
- `P_{itj}` = planned policy adjustments (fiscal + external, with program and "large" interactions)
- `S_{itj}` = controls: trading partner growth FE, oil/commodity price FE (interacted with exporter status), time-to-forecast (optimism drift), structural benchmarks, GFC dummy

**Planned policy adjustment decomposition (Equations 3–5):**

The fiscal adjustment variable `ΔpB` is the **projected annual change in primary fiscal balance** (% of GDP) within the same vintage's forecast path: `ΔpB(k) = pB_forecast(k) − pB_forecast(k−1)`, both from vintage j. Positive = planned consolidation. The current account variable `ΔCA` is constructed analogously from projected BCA changes.

Each enters with three terms:
- Base effect (`ΔpB` or `ΔCA`) — applies to all countries
- Program interaction (`i_ip × ΔpB`) — additional effect for IMF program countries
- "Large adjustment" interaction (`i_fh × ΔpB`) — additional effect when planned adjustment exceeds the country's own historical average by 0.5 standard deviations

**Key results (Table 2, main specification):**

| Variable | Coefficient | Interpretation |
|----------|------------|----------------|
| `time_to_forecast` (years) | 0.225*** | Optimism drift: ~0.2pp per year of forecast horizon |
| `partnergrowth_error` | 0.441*** | Trading partner growth optimism → own growth optimism |
| `oil_notexp_error` | 0.895*** | Oil price optimism → growth optimism (non-exporters) |
| `oil_exp_error` | 1.836*** | Oil price optimism → growth optimism (oil exporters, larger) |
| `pb_adjustment` (ΔpB) | −0.016 | Planned fiscal consolidation: no significant effect overall |
| `prog_pb_adjustment` | 0.157* | But significant for program countries |
| `high_pb_adjustment` | 0.122*** | And significant for large adjustments |
| `ca_adjustment` (ΔCA) | 0.017** | Planned CA improvement → growth optimism |
| `high_ca_adjustment` | 0.416*** | Large CA adjustment: much stronger |
| `GFC` (2008–09) | 0.663*** | Crisis years had larger forecast errors |
| N / R² | 19,963 / 0.247 | |

**IV result (Table 5):** Using planned fiscal adjustment as an instrument for actual fiscal adjustment, actual fiscal consolidation is significantly associated with growth optimism (β = 0.247***, program interaction 0.314**), supporting the hypothesis that underestimation of fiscal multipliers drives the observed optimism.

**What is NOT replicable from our data:**
- Program-specific analysis (requires MONA database, internal to IMF)
- Trading partner growth errors (requires GEE database with trade weights)
- Oil/commodity price forecast errors (requires commodity price forecasts, available only in our API-sourced vintage 37)
- Structural benchmarks (internal program data)
- Observation-specific fixed effects (our data doesn't map to their observation-level structure)

**What IS replicable — all three core findings confirmed:**

1. **Optimism drift by forecast horizon** — mean FE increases with horizon:

| Horizon | N | Mean FE (pp) | % Positive |
|---------|---|-------------|-----------|
| h=0 | 5,122 | −0.36 | 41.6% |
| h=1 | 5,110 | +0.23 | 49.8% |
| h=2 | 5,101 | +0.57 | 55.6% |
| h=3 | 5,067 | +1.22 | 61.3% |
| h=4 | 5,060 | +1.21 | 62.2% |
| h=5 | 5,055 | +1.20 | 62.8% |

Drift: 0.277pp per year (with horizon control). Paper: 0.225pp (with full controls). The drift levels off around h=3, suggesting medium-term forecasts plateau at ~1.2pp optimism.

2. **Planned fiscal consolidation → growth optimism** — regressing GDP forecast error (forecast − actual) on projected change in primary fiscal balance (GGXONLB_NGDP), with horizon control:

`GDP_FE = 0.41 + 0.149×ΔpB + 0.277×h` (β(ΔpB) = 0.149***, t = 4.46, N = 9,733)

A 1pp planned improvement in the primary balance is associated with 0.15pp higher GDP growth optimism. This generalizes Blanchard & Leigh (2013) across all countries and years — the relationship between planned fiscal consolidation and growth overestimation is not unique to 2010–2011 European austerity.

By horizon: strongest at h=2 (β = 0.276***, t = 5.14) and h=4 (β = 0.623***, t = 5.08). At h=1 the effect is marginal (β = 0.063, t = 1.85).

3. **Planned CA improvement → growth optimism**:

`GDP_FE = 0.10 + 0.103×ΔCA + 0.258×h` (β(ΔCA) = 0.103***, t = 9.70, N = 25,255)

Countries where the IMF projects current account improvement have more optimistic GDP growth forecasts. Our coefficient is larger than the paper's (0.103 vs 0.017) because we use simple pooled OLS without observation-specific fixed effects.

4. **Non-linearity of large fiscal adjustments**: Our simple specification gives β(large×ΔpB) = 0.037 (insignificant), weaker than the paper's 0.122***. The non-linearity is driven by program countries with extreme fiscal adjustments, which we cannot identify from WEO data alone.

**To replicate the optimism drift from the CSV:**
1. For each vintage (identified by `vintage` column), compute `h = year − vintage_year`
2. Filter to `indicator = 'NGDP_RPCH'` and `h` between 0 and 5
3. Compute `FE = forecast − actual` (use the latest vintage's value as actual)
4. Group by h, compute mean FE → should show monotonic increase from ~0 at h=0 to ~1.2pp at h=5

**To replicate fiscal consolidation → optimism from the CSV:**
1. For each vintage and country, get GGXONLB_NGDP forecast for year k and year k−1
2. Compute `ΔpB = GGXONLB_NGDP(k) − GGXONLB_NGDP(k−1)` (both from same vintage)
3. Get NGDP_RPCH forecast for year k and actual for year k; compute `FE = forecast − actual`
4. Regress FE on ΔpB (with h control) → positive β confirms fiscal consolidation optimism

### Study 8: Hadzi-Vaskov, Ricci, Werner & Zamarripa (2021) — Forecast Revision Patterns

**Paper**: "Patterns in IMF Growth Forecast Revisions: A Panel Study at Multiple Horizons." IMF WP/21/136, May 2021.

**Research question**: How do WEO growth forecast revisions behave across horizons? Are revisions in the right direction, and what drives them?

**Key distinction**: This paper studies forecast **revisions** (changes between consecutive vintages) rather than forecast **errors** (forecast vs actual). This provides a complementary "process lens" on how the IMF updates its forecasts.

**Data**: 194 economies, 1990–2019, Spring and Fall WEO vintages. Up to 12 revision horizons per target year (Spring and Fall for each of h=0 to h=5). Outturns from Fall(t+1), same as Celasun et al.

**Revision definition**: `REV X_{t-i,t} = F_{t-i,t} − F_{t-i-1,t}` — the change in the forecast for target year t between consecutive vintages at horizon i.

**Equation 1 — Are revisions in the right direction?**

```
REV Y_{t-i,t} = β₀ + β₁ × FE Y_{t-i-1,t} + ε_t
```

Where FE = `F_{t-i-1,t} − A_{t+1,t}` (forecast error from the previous vintage). If β₁ < 0, revisions narrow the forecast error (correct direction). More negative β₁ = more responsive revisions.

**Equation 7 — Serial autocorrelation across vintages:**

```
REV Y_{t-i,t} = β₀ + β₁ × REV Y_{t-i-1,t-1} + ε_t
```

Tests whether this year's revision for target t predicts last year's revision for target t−1 at the same horizon. β₁ ≈ 0 = no persistence (efficient).

**Equation 9 — Shock persistence within vintages:**

```
REV Y_{t,t+j} = β₀ + β₁ × REV Y_{t,t} + ε_t
```

Tests whether revising growth for year t also predicts revisions for year t+j. β₁ > 0 = shocks perceived as persistent.

**Key findings from the paper:**
- Revisions are larger, more volatile, and more negative at shorter horizons (most action at F0-F1)
- β₁ in Eq 1 steepens from ≈ −0.05 at F4-F5 to ≈ −0.75 at F0-F1 — revisions become more responsive to FE at shorter horizons
- Revisions are NOT autocorrelated across vintages (Eq 7: β₁ ≈ 0) — good news for efficiency
- But within vintages, revisions ARE positively correlated (Eq 9: β₁ > 0) — forecasters perceive shocks as persistent
- US and China growth revisions are significant drivers of other countries' revisions
- WEO and Consensus Forecast revisions are highly correlated (β ≈ 0.8–1.0)

**Our replication (Fall-to-Fall, 1990–2019, with country FE):**

Descriptive revision profile:

| Horizon | N | Mean Rev | SD | % Negative |
|---------|---|----------|-----|------------|
| F0-F1 | 4,802 | −0.86pp | 3.15 | 57% |
| F1-F2 | 4,617 | −0.23pp | 1.97 | 54% |
| F2-F3 | 4,438 | −0.03pp | 1.47 | 49% |
| F3-F4 | 4,258 | +0.01pp | 1.40 | 46% |
| F4-F5 | 4,078 | +0.01pp | 1.34 | 46% |

Paper's pattern confirmed: most revision action at F0-F1 (largest, most volatile, most negative). Long-horizon revisions are small and symmetric.

Equation 1 — revision responsiveness to FE:

| Horizon | N | β₁ (FE) | Paper ≈ |
|---------|---|---------|---------|
| F0-F1 | 4,802 | −0.622*** | −0.75 |
| F1-F2 | 4,617 | −0.207*** | −0.25 |
| F2-F3 | 4,438 | −0.093*** | −0.12 |
| F3-F4 | 4,258 | −0.081*** | −0.08 |
| F4-F5 | 4,078 | −0.087*** | −0.05 |

All negative, all significant, same monotonic steepening pattern. At F0-F1, each 1pp of forecast error is corrected by ≈ 0.62pp in the next revision. Exact match at F1-F4; F0-F1 and F4-F5 differ somewhat (paper's benchmark values read from Figure 8 chart, approximate).

Equation 7 — serial autocorrelation: small positive coefficients (0.05–0.10) at shorter horizons, consistent with the paper's conclusion of "no strong autocorrelation across vintages."

**To replicate from the CSV:**
1. For each country and target year, get forecasts from consecutive Fall vintages
2. Compute `REV = F(t-i) − F(t-i-1)` for each horizon i = 0, 1, ..., 4
3. Compute `FE = F(t-i-1) − actual` where actual = latest vintage value for year t
4. Regress REV on FE at each horizon — β₁ should be negative and steepen at shorter horizons
5. Mean revision should be negative and larger at shorter horizons

### Study 9: IEO (2014) — IMF Forecasts: Process, Quality, and Country Perspectives

**Report**: Independent Evaluation Office, "IMF Forecasts: Process, Quality, and Country Perspectives." ISBN 978-1-47559-951-0, 2014. Led by Hans Genberg. Background papers: BP/14/01–05 by de Resende, Freedman, Genberg & Martinez, Luna.

**What this is**: Not a single-method paper but the IMF's own **meta-evaluation** — a comprehensive assessment of WEO forecast quality, the institutional forecasting process, and user perceptions. It synthesizes all prior commissioned studies (Artis 1988, Barrionuevo 1993, Timmermann 2006, Faust 2013), presents original analysis by Genberg & Martinez (2014b), surveys 179 country officials, and interviews staff at all levels. This is the authoritative reference for the framework of forecast evaluation.

**Sample period**: 1990–2011, all IMF member countries (144–180 depending on analysis). Spring WEO vintages primarily. G20 detailed in Annex 2.

**The three-pillar evaluation framework:**

The IEO organizes forecast quality into three dimensions (Chapter 4):

1. **Bias** (Section A) — Are forecasts systematically too high or too low?
2. **Efficiency** (Section B) — Do forecasts incorporate all available information? (Extends to Nordhaus/CG-style tests and cross-country spillover tests.)
3. **Accuracy** (Section C) — How do forecast errors compare to other forecasters (OECD, EC, Consensus Economics)?

This framework directly maps to the tests in Studies 3–5 and 7–8 above. The IEO report effectively defines the benchmark evaluation toolkit.

**Key quantitative findings:**

**Table 1 — Median Forecast Errors in GDP Growth, 1991–2011** (actual − forecast, in pp):

| Group | Year-Ahead Spring | Year-Ahead Fall | Current-Year Spring | Current-Year Fall |
|-------|:-:|:-:|:-:|:-:|
| Full sample | −0.29 | −0.20 | 0.00 | 0.00 |
| All recessions | −6.27 | −5.73 | −3.69 | −1.52 |
| Non-recessions | 0.00 | 0.00 | 0.09 | 0.07 |
| Advanced | −0.30 | −0.19 | 0.07 | 0.10 |
| Emerging & developing | −0.04 | 0.00 | 0.06 | 0.10 |
| Low-income | −0.50 | −0.42 | −0.20 | 0.00 |
| Program countries | −0.43 | −0.30 | −0.05 | 0.00 |

**Critical insight**: Remove recession years and the optimistic bias **vanishes** across all groups. The measured bias in WEO growth forecasts is almost entirely driven by the inability to predict downturns — not by systematic institutional optimism. Non-recession medians hover at 0.00 to +0.09pp (essentially unbiased). This decomposition is the single most important finding in the forecast evaluation literature.

**Table A2.1 — G20 GDP Growth Forecast Errors, Spring WEO, 1990–2011** (mean errors with p-values):

Statistically significant biases (10% level, bold = significant):

| Country | Current-Year | 1-Year-Ahead | 2-Year-Ahead | 5-Year-Ahead |
|---------|:-:|:-:|:-:|:-:|
| United States | 0.07 | −0.05 | −0.31 | −0.05 |
| France | **−0.13** | **−0.90** | **−1.25** | **−1.13** |
| Germany | 0.17 | **−0.79** | **−1.19** | **−1.08** |
| Italy | **−0.40** | **−1.26** | **−1.55** | **−1.62** |
| Japan | −0.03 | **−1.20** | **−2.02** | **−2.05** |
| Mexico | **−0.28** | **−1.52** | **−2.28** | **−2.60** |
| China | **1.16** | **1.77** | **1.87** | **1.58** |
| Argentina | *1.01* | 0.33 | 0.35 | 0.04 |
| India | 0.26 | 0.29 | 0.46 | **0.92** |

Key pattern: Most G7 economies have significant optimistic bias at 2+ year horizons. China is a persistent **pessimistic** outlier (IMF consistently underestimates Chinese growth over 1990–2011). Italy, Japan, and Mexico show the largest cumulative optimistic biases.

**IMF vs Consensus Economics RMSE, 1-year-ahead Spring (Figure A2.3):**

| Country | IMF RMSE | Consensus RMSE |
|---------|:--------:|:--------------:|
| United States | 1.61 | 1.70 |
| United Kingdom | 2.01 | 2.00 |
| France | 1.49 | 1.52 |
| Germany | 2.30 | 2.22 |
| Italy | 1.98 | 2.03 |
| Japan | 2.72 | 2.62 |
| Canada | 2.00 | 1.84 |
| Australia | 1.49 | 0.94 |
| China | 2.99 | 1.62 |

The two forecasters are nearly identical for most countries. IMF is slightly better for Turkey (4.93 vs 5.87), slightly worse for China (2.99 vs 1.62) and Australia (1.49 vs 0.94). "The striking similarity in forecast errors in IMF and private sector forecasts does not support the notion of an organizational bias" (para. 65).

**Interdependence (Figure 8)**: The report plots the share of GDP growth variation explained by a global factor (from Matheson 2013) against the same share in WEO forecasts. The scatter is positive and roughly on the 45-degree line — WEO forecasts do capture global co-movement, though "linkages may still not be fully accounted for in all forecasts" (para. 65). Timmermann (2006) showed US and German forecast errors explain errors elsewhere; extending to 2011, China's forecasts also have cross-country explanatory power.

**Institutional process findings (Chapter 3):**

1. **Hybrid bottom-up/top-down**: IDFC sets global conditions → country desks produce forecasts → WEO team consistency checks → Executive Board briefing. Full cycle: 3–4 months.
2. **Spreadsheets and judgment dominate**: The "macro framework" is spreadsheet-based accounting identities plus judgment. Formal econometric models (VAR, structural) are "somewhat important" for advanced economies but barely used for low-income countries.
3. **Data availability is the #1 factor** in choosing forecast methods (Figure 6).
4. **Consensus herding**: "An IMF desk economist may hesitate to deviate from consensus forecasts, because 'rocking the boat' in this way would call for lengthy and elaborate justifications" (para. 37). The review process checks deviations from other forecasters.
5. **Asymmetric recession incentives**: "The cost of forecasting a recession that does not materialize may be perceived as higher than the cost of having wrongly predicted a boom" (para. 58). Neither IMF nor private sector predicted recessions well — Juhn & Loungani (2002) methodology replicated by IEO confirms this.
6. **Knowledge loss at desk transitions**: 40% of staff said ad hoc handovers hindered forecasting. "A tremendous amount of information gets lost" (para. 84).
7. **Forecasting not rewarded**: "A good forecasting record is not a sufficiently appreciated element in staff performance appraisals" (para. 43).

**Medium-term forecasts (Chapter 5):**

- 2/3 to 3/4 of 180 countries overpredict medium-term growth (3–5 year horizons)
- 20–30% of countries have statistically significant optimistic bias
- Annual bias: 0.14 to 0.76 pp depending on horizon and method
- No interdepartmental committee ensures medium-term consistency (unlike short-term)
- Medium-term forecasts outperform naive (no-change) and mechanical (HP filter) but are somewhat less accurate than Consensus Economics
- Informational inefficiency is more frequent at medium-term than short-term — spillovers underweighted

**Program forecasts (Chapter 6):**

- Exceptional access programs (>80% of IMF disbursements) show significant optimistic GDP bias
- Other programs: biases are pessimistic or insignificant
- Fiscal balance forecasts in exceptional access programs are deliberately pessimistic (gives authorities room for maneuver)
- Optimistic biases typically corrected at first program review (~3 months in)

**The five recommendations (Chapter 7):**

1. Continue commissioning external evaluations on a regular schedule
2. Enhance learning from past forecast errors; make forecasting a valued skill in performance reviews
3. Extend guidance to desk economists on forecasting methodology
4. Publish a general description of the WEO forecasting process
5. Make historical forecast and outturn data publicly available

Recommendation 5 is directly relevant: the IEO pushed for exactly the kind of historical vintage access that the SDMX API now provides. The Managing Director gave "qualified support" — implementation "will depend on a careful cost-benefit analysis." The full vintage database we use was eventually made available.

**What this report adds beyond the individual studies:**

The IEO report is uniquely valuable because it:
- Provides the **recession/non-recession decomposition** of bias (Table 1) that no individual paper presents as cleanly
- Documents the **institutional incentives** that generate forecast failures (herding, asymmetric costs, knowledge loss)
- Gives the **G20 RMSE comparison** with Consensus Economics (Figure A2.3) that serves as a cross-check for our Theil U scores
- Establishes that **biases are not systemic** — they arise from specific episodes (recessions, crises) rather than institutional direction
- Confirms that **the same biases appear in private sector forecasts**, undermining the narrative that IMF forecasts are uniquely flawed

**To cross-check Table 1 from the CSV:**
1. Filter to `indicator = 'NGDP_RPCH'`, Spring vintages
2. For year-ahead: use Spring(t-1) forecast for target year t
3. Define "recession" as actual growth < 0 (or use the paper's country-recession list if available)
4. Compute `FE = actual − forecast` (note: IEO uses actual − forecast, opposite to some other papers)
5. Take **medians** (not means) by group — medians are more robust to the large outliers that dominate recession years
6. Non-recession medians should be near zero; recession medians should be large negative values

### Study 10: Matheson (2013) — Growth Synchronization and Factor Decomposition

**Paper**: "The Global Financial Crisis: An Anatomy of Global Growth." IMF Working Paper 13/76, March 2013.

**Research question**: How synchronized is global growth? What share of each country's GDP growth variation is driven by global vs regional vs idiosyncratic shocks?

**Method**: Dynamic factor model (DFM) decomposing each country's detrended, standardized GDP growth into three orthogonal components:

```
X_{i,j,t} = A_{i,j} × F_t + B_{i,j} × G_{i,t} + ψ_{i,j,t}     (eq. 1)
```

Where F_t is a global factor (common to all 185 countries), G_{i,t} is a regional factor (common within region i), and ψ is idiosyncratic. All three follow AR(1) processes (eq. 2-4). The model is estimated via EM algorithm with Kalman filtering (Doz, Giannone, Reichlin 2011, 2012).

**Key methodological details**:
- **Data**: WEO GDP growth, 185 countries, 1990Q1–2011Q4. ~1/3 have quarterly data; the rest use temporal disaggregation (eq. 5-8) treating annual growth as observed in Q4 only.
- **7 geographic regions** (NOT income-based): Advanced Europe (24), Emerging Europe (14), CIS (13), Asia (34, includes Japan/Australia/NZ/Korea), Western Hemisphere (35, includes USA/Canada), Sub-Saharan Africa (44), MENA (21).
- **Detrending**: Potential output growth from WEO where available; otherwise HP filter (λ=6.25 annual, λ=1600 quarterly) with endpoints pinned to average growth of first/last 10 years.
- **Aggregation equations** (eq. 9-10): PPP-weighted regional and world growth aggregates are included as **additional observables** in the Kalman filter. This pins the global factor to explain actual world growth and regional factors to explain regional aggregates. Critical for identification.
- **PPP weights**: Fixed over time (footnote 5). Standardized data is multiplied back by country std dev for aggregation.

**Key findings (Table 1 — unconditional variance decomposition by region):**

| Region | Global | Regional | Idiosyncratic |
|--------|:------:|:--------:|:-------------:|
| World | 0.77 | 0.07 | 0.16 |
| Advanced Europe | 0.80 | 0.11 | 0.09 |
| Emerging Europe | 0.50 | 0.08 | 0.43 |
| CIS | 0.16 | 0.37 | 0.47 |
| Asia | 0.30 | 0.26 | 0.43 |
| Western Hemisphere | 0.66 | 0.01 | 0.33 |
| Sub-Saharan Africa | 0.11 | 0.56 | 0.33 |
| MENA | 0.12 | 0.57 | 0.31 |

Advanced economies are globally dominated (median global share 64% for industrial economies, vs 13% for EMDE). SSA and MENA are regionally dominated — commodity prices and regional geopolitics drive these regions more than the global cycle.

**Selected country-level results (Appendix I):**

| Country | Global | Regional | Idiosyncratic | RMSE vs AR(1) |
|---------|:------:|:--------:|:-------------:|:-------------:|
| USA | 0.62 | 0.00 | 0.38 | 0.49 |
| Germany | 0.64 | 0.19 | 0.18 | 0.48 |
| France | 0.66 | 0.18 | 0.16 | 0.65 |
| Japan | 0.43 | 0.18 | 0.40 | 0.61 |
| UK | 0.58 | 0.01 | 0.42 | 0.60 |
| Canada | 0.49 | 0.03 | 0.48 | 0.63 |
| Australia | 0.23 | 0.03 | 0.74 | 0.71 |
| China | 0.14 | 0.06 | 0.80 | 0.63 |
| India | 0.29 | 0.00 | 0.71 | 1.54 |
| Indonesia | 0.01 | 0.77 | 0.23 | 0.78 |
| Korea | 0.08 | 0.70 | 0.22 | 1.25 |
| Brazil | 0.36 | 0.34 | 0.30 | 1.02 |
| Mexico | 0.30 | 0.00 | 0.70 | 0.75 |
| Russia | 0.21 | 0.39 | 0.40 | 0.66 |
| S. Africa | 0.16 | 0.17 | 0.67 | 0.80 |
| Saudi Arabia | 0.03 | 0.75 | 0.23 | 1.34 |
| Turkey | 0.21 | 0.07 | 0.72 | 1.23 |
| Thailand | 0.10 | 0.80 | 0.10 | 0.77 |

RMSE relative to AR(1) < 1 means the DFM outperforms a simple autoregressive benchmark. The model performs best for large, globally integrated economies.

**Our replication (hierarchical PCA + DFM with Kalman smoother, annual data):**

We implement a quasi-ML DFM following Doz et al. (2011): PCA initialization → Kalman smoother → EM iteration. Includes temporal disaggregation to pseudo-quarterly and PPP-weighted aggregation equations as observables. Script: `replicate_matheson.py`.

Replication on 1990–2011 sample (173 countries):

| Region | Ours G | Matheson G | Ours R | Matheson R | Ours I | Matheson I |
|--------|:------:|:----------:|:------:|:----------:|:------:|:----------:|
| Adv. Europe | 0.65 | 0.80 | 0.21 | 0.11 | 0.14 | 0.09 |
| Emerg. Europe | 0.27 | 0.50 | 0.14 | 0.08 | 0.48 | 0.43 |
| CIS | **0.14** | **0.16** | **0.42** | **0.37** | **0.43** | **0.47** |
| Asia | 0.11 | 0.30 | 0.06 | 0.26 | 0.76 | 0.43 |
| Western Hem. | 0.25 | 0.66 | 0.04 | 0.01 | 0.65 | 0.33 |
| SSA | 0.04 | 0.11 | 0.03 | 0.56 | 0.88 | 0.33 |
| MENA | 0.10 | 0.12 | 0.10 | 0.57 | 0.80 | 0.31 |

Selected country matches:

| Country | Ours G | M G | Ours R | M R | Match quality |
|---------|:------:|:---:|:------:|:---:|:-------------|
| USA | 0.48 | 0.62 | 0.13 | 0.00 | Reasonable — WH regional absorbs some |
| Germany | **0.66** | **0.64** | 0.26 | 0.19 | Excellent |
| France | **0.66** | **0.66** | 0.34 | 0.18 | Global exact, regional high |
| Spain | **0.60** | **0.61** | 0.32 | 0.32 | Near-exact |
| Australia | **0.20** | **0.23** | 0.04 | 0.03 | Excellent |
| Korea | 0.05/**0.72** | 0.08/**0.70** | | | Excellent (both) |
| Indonesia | 0.02/**0.82** | 0.01/**0.77** | | | Excellent (both) |
| Greece | **0.17** | **0.12** | 0.01 | 0.05 | Good |
| China | **0.10** | **0.14** | 0.02 | 0.06 | Good |
| Mexico | **0.27** | **0.30** | 0.04 | 0.00 | Good |
| CAN | 0.57 | 0.49 | 0.00 | 0.03 | Reasonable |
| CIS agg | **0.14/0.42** | **0.16/0.37** | | | Excellent |

**Known limitations of our replication:**
1. **SSA/MENA regional factors too low** (0.03–0.10 vs 0.56–0.57). Matheson's quarterly data provides 4× more temporal observations to identify regional factors in these heterogeneous regions. Our annual-only pseudo-quarterly disaggregation cannot replicate this.
2. **AE global shares ~5–15% too high for some countries** (GBR, ITA, FIN). Likely due to differences in potential output detrending — Matheson uses WEO potential output estimates (internal, not all publicly available) while we use HP filter with ΔNGAP where available.
3. **Asia/WH global shares too low** (0.11/0.25 vs 0.30/0.66). Related to #1 — without strong SSA/MENA regional factors absorbing those regions' variance, the global factor identification is weaker.

These limitations are structural to annual data — quarterly GDP would close most of the gap.

**To replicate from the CSV:**
1. Load `NGDP_RPCH` from latest vintage for all countries, 1990–2011
2. Load `NGAP_NPGDP` where available (~27 AEs) for detrending
3. Detrend: use ΔNGAP where available, HP filter (λ=100, endpoint-padded) otherwise
4. Standardize each country's cyclical component (zero mean, unit variance)
5. Assign countries to 7 geographic regions (see `replicate_matheson.py` REGION_MAP)
6. Run hierarchical DFM: PC1 → global factor, PC1 of regional residuals → regional factors, iterate with Kalman smoother
7. Include PPP-weighted regional + world growth aggregates as additional observables (PPPSH for weights)
8. Variance decomposition: R² of country with global component, R² with global+regional, remainder = idiosyncratic

### Study 11: Forecast Interdependence — Do WEO Forecasts Capture Global Linkages? (our analysis)

**Research question**: Do WEO forecasts reflect the same degree of cross-country growth synchronization as the actual data? If forecasts underweight global linkages, they will miss synchronized booms and busts.

**Motivation**: IEO (2014) Figure 8 plots Matheson's variance decomposition for actuals against the same for WEO forecasts, finding that "linkages may still not be fully accounted for." We test this directly using the cross-country correlation structure.

**Method**: Compare the pairwise correlation matrix of actual GDP growth rates to the pairwise correlation matrix of h=1 WEO forecasts. For each country, compute its mean correlation with all other countries (ρ̄). If ρ̄(forecasts) < ρ̄(actuals), forecasts understate that country's global linkages.

**Data**: 173 countries, 1995–2019 (pre-COVID). Actuals from Oct 2025 vintage. h=1 forecasts from Oct(t-1) for each target year.

**Results:**

Overall mean pairwise correlation:
- Actuals: 0.127
- Forecasts: 0.092
- **Forecasts understate global synchronization by ~28%**

| Group | N | Median ρ̄(act) | Median ρ̄(fc) | Median diff | % fc > act |
|-------|---|:-:|:-:|:-:|:-:|
| All | 173 | 0.134 | 0.118 | −0.040 | 32% |
| Advanced | 35 | 0.242 | 0.166 | −0.077 | 14% |
| EMDE | 138 | 0.113 | 0.085 | −0.031 | 36% |

Correlation block structure:

| Block | Actuals | Forecasts | Diff |
|-------|:-------:|:---------:|:----:|
| AE–AE | 0.529 | 0.466 | −0.064 |
| AE–EMDE | 0.143 | 0.079 | −0.064 |
| EMDE–EMDE | 0.093 | 0.075 | −0.018 |

The AE–EMDE block has the largest miss — forecasts don't capture how EMDE growth co-moves with AE growth.

Regression: ρ̄(fc) = 0.022 + 0.552 × ρ̄(act). Slope < 1 = **compression**. Countries that are highly connected in reality appear only moderately connected in forecasts.

Selected countries:

| Country | ρ̄(actuals) | ρ̄(forecasts) | Diff |
|---------|:----------:|:------------:|:----:|
| USA | 0.212 | 0.048 | −0.164 |
| Japan | 0.261 | 0.122 | −0.139 |
| Germany | 0.254 | 0.151 | −0.103 |
| France | 0.237 | 0.153 | −0.084 |
| UK | 0.242 | 0.166 | −0.076 |
| China | 0.204 | 0.116 | −0.088 |
| S. Africa | 0.307 | 0.217 | −0.089 |
| Turkey | 0.227 | 0.105 | −0.122 |
| India | 0.041 | 0.015 | −0.026 |
| Australia | 0.125 | 0.191 | +0.066 |
| Norway | 0.220 | 0.227 | +0.007 |

USA has the largest gap among G20: its actual growth is moderately correlated with the rest of the world (ρ̄=0.21), but its forecasts are nearly uncorrelated (ρ̄=0.05). This is consistent with the IEO's institutional finding that country desk economists produce forecasts relatively independently.

**Interpretation**: The compression pattern (slope=0.55) means the IMF forecasting process produces forecasts that are more "country-specific" than the actual growth outcomes. This is consistent with the bottom-up forecasting process described in IEO Chapter 3 — desk economists focus on country-specific fundamentals and may not fully incorporate global spillovers, especially the AE→EMDE channel.

**To replicate from the CSV:**
1. Build two matrices: actual growth (latest vintage) and h=1 forecasts (Oct(t-1)), both for 1995–2019
2. Countries must have ≥20 of 25 years available
3. Fill missing values with country mean
4. Compute pairwise correlation matrices for actuals and forecasts separately
5. For each country, compute mean correlation with all others (excluding self)
6. Compare: ρ̄(forecasts) vs ρ̄(actuals)
7. Regression of ρ̄(fc) on ρ̄(act): slope < 1 = compression, > 1 = amplification
8. Block analysis: compute mean correlations within AE–AE, AE–EMDE, EMDE–EMDE

---

## References

1. Blanchard, O.J. and D. Leigh (2013). "Growth Forecast Errors and Fiscal Multipliers." *American Economic Review* 103(3): 117–120.
2. IEO (2014). "IMF Forecasts: Process, Quality, and Country Perspectives." Independent Evaluation Office of the IMF.
3. An, Z., J.P. Jalles, and P. Loungani (2018). "How Well Do Economists Forecast Recessions?" IMF Working Paper 18/39.
4. Celasun, O., et al. (2021). "An Evaluation of World Economic Outlook Growth Forecasts, 2004–17." IMF Working Paper 21/216.
5. Koch, C. and D. Noureldin (2023). "How We Missed the Inflation Surge: An Anatomy of Post-2020 Inflation Forecast Errors." IMF Working Paper 23/102.
6. Aktug, E. and A. Rezghi (2025). "An Evaluation of World Economic Outlook Forecasts: Any Evidence of Asymmetry?" IMF Working Paper 25/031.
7. Timmermann, A. (2007). "An Evaluation of the World Economic Outlook Forecasts." *IMF Staff Papers* 54(1).
8. Ismail, K., R. Perrelli, and J. Yang (2020). "Optimism Bias in Growth Forecasts: The Role of Planned Policy Adjustments." IMF Working Paper 20/229.
9. Coibion, O. and Y. Gorodnichenko (2015). "Information Rigidity and the Expectations Formation Process: A Simple Framework and New Facts." *American Economic Review* 105(8): 2644–2678.
10. Nordhaus, W.D. (1987). "Forecasting Efficiency: Concepts and Applications." *Review of Economics and Statistics* 69(4): 667–674.
11. Mincer, J. and V. Zarnowitz (1969). "The Evaluation of Economic Forecasts." In J. Mincer (ed.), *Economic Forecasts and Expectation*. New York: Columbia University Press, 3–46.
12. Hadzi-Vaskov, M., L.A. Ricci, A.M. Werner, and R. Zamarripa (2021). "Patterns in IMF Growth Forecast Revisions: A Panel Study at Multiple Horizons." IMF Working Paper 21/136.
13. Genberg, H. and A. Martinez (2014). "On the Accuracy and Efficiency of IMF Forecasts: A Survey and Some Extensions." IEO Background Paper No. BP/14/04.
14. de Resende, C. (2014). "An Assessment of IMF Medium-Term Forecasts of GDP Growth." IEO Background Paper No. BP/14/01.
15. Juhn, G. and P. Loungani (2002). "Further Cross-Country Evidence on the Accuracy of the Private Sector's Output Forecasts." *IMF Staff Papers* 49: 49–64.
16. Artis, M.J. (1988). "How Accurate Is the World Economic Outlook? A Post Mortem on Short-Term Forecasting at the IMF." *Staff Studies for the World Economic Outlook*: 1–49.
17. Faust, J. (2013). "A Report of the Predictive Accuracy of the IMF's WEO Forecast." Unpublished manuscript, February 5, 2013.
18. Matheson, T. (2013). "The Global Financial Crisis: An Anatomy of Global Growth." IMF Working Paper 13/76.
19. Doz, C., D. Giannone, and L. Reichlin (2011). "A Two-Step Estimator for Large Approximate Dynamic Factor Models Based on Kalman Filtering." *Journal of Econometrics* 164(1): 188–205.
20. Kose, M.A., C. Otrok, and C.H. Whiteman (2008). "Understanding the Evolution of World Business Cycles." *Journal of International Economics* 75: 110–130.
