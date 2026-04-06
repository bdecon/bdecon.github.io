# IMF WEO Forecast Database — Agent Context

This file provides context for working with the IMF World Economic Outlook vintage forecast database. Load it into a coding assistant alongside the CSV data file so the assistant can query, analyze, and evaluate IMF forecasts.

Source: [bd-econ.com/imfweo.html](https://bd-econ.com/imfweo.html)

---

## Part 1: What This Database Contains

### Overview

The IMF publishes the World Economic Outlook (WEO) twice yearly (April and October), with macroeconomic forecasts for ~196 countries extending 5–6 years forward. Each edition is a **vintage**. This database collects **72 vintages** from May 1990 through October 2025, so you can see how the IMF's forecast for any country-year evolved over time.

That matters because the IMF's forecasts shape policy. When the IMF projects 4% growth, governments borrow and spend accordingly. When those projections turn out to be systematically optimistic — as research shows they often are during downturns — the real-world consequences are significant. This database lets you measure that directly.

### Files

| File | What it contains |
|------|-----------------|
| `imfweo-data.csv.gz` | The forecast database as a CSV. 3.6M rows, 21 indicators, 72 vintages, 196 countries. One row per (country, indicator, vintage, year). |
| `data.json` | Web chart data: 45 vintages (2003–2025), 10 indicators, nested format. Powers the interactive chart. |
| `data-extended.json` | Early history: 26 vintages (1990–2002), 3 indicators only. |
| `forecast-scores.json` | Precomputed h=1 forecast accuracy by country (bias, MAE, sign ratio) for 5 indicators × 3 periods. |
| `imfweo-context.md` | This file. |

### CSV schema (`imfweo-data.csv.gz`)

The CSV is the primary format for analysis. Columns:

| Column | Type | Description |
|--------|------|-------------|
| `iso` | string | ISO 3166-1 alpha-3 country code (e.g., `USA`, `GRC`, `BRA`) |
| `indicator` | string | WEO indicator code (e.g., `NGDP_RPCH`) |
| `vintage` | string | WEO edition label (e.g., `Oct 2025`, `Apr 2010`) |
| `year` | integer | The year being forecast or observed (e.g., 2020) |
| `value` | float | The numeric value (e.g., 2.1 for 2.1% GDP growth) |
| `is_forecast` | 0 or 1 | 1 = this value is a forecast/projection; 0 = actual/historical in this vintage |
| `horizon` | integer or blank | How many years ahead (or behind). Positive = forecast (1 = year-ahead). Zero = same-year estimate. Negative = post-hoc (−1 = one year after). See below. |
| `region` | string | IMF analytical region code (e.g., `G110` for Advanced Economies). |
| `imf_program` | 0 or 1 | 1 = country had an active IMF arrangement (SBA/EFF/ECF/PRGF, non-precautionary) in this year. Source: IMF MONA database. |

The CSV is sorted by `iso, indicator, year, vintage` — so for any country-indicator-year, you can read down to see how the forecast evolved across editions.

**Key concept — `is_forecast`**: Each vintage draws a line between "actual" and "forecast" years. In the October 2025 WEO, US GDP growth for 2024 is actual data, but 2025 is a forecast. The `is_forecast` flag marks this boundary. The same year can be a forecast in one vintage and actual in the next — that transition is the revision process.

**Key concept — `horizon`**: Positive values are forecasts: horizon 1 means this was made roughly one year before the target year (e.g., Oct 2019 forecasting 2020). Horizon 0 is a same-year estimate. **Negative values are post-hoc**: horizon −1 means the vintage was published one year *after* the target year. This matters because GDP data gets revised for years after first publication — US 2020 GDP growth was initially reported as −3.4% but has since been revised to −2.1%. Researchers use the **h=−1 value** (the Fall(t+1) WEO) as the "actual" because it's the first settled estimate, before years of statistical revisions distort the picture. To get this, filter to `horizon == -1` and Fall vintages (`Oct` or `Sep`).

### Indicators

21 indicators covering growth, prices, fiscal, external, and labor:

| Code | Name | Units | Coverage |
|------|------|-------|----------|
| `NGDP_RPCH` | Real GDP growth | % change | All countries, all vintages |
| `PCPIPCH` | CPI inflation | % change | All countries, all vintages |
| `BCA_NGDPD` | Current account balance | % of GDP | All countries, all vintages |
| `GGXWDG_NGDP` | Government gross debt | % of GDP | Most countries, Apr 2010+ |
| `GGD_NGDP` | Government gross debt (old code) | % of GDP | Pre-Apr 2010 |
| `GGXCNL_NGDP` | Fiscal balance (net lending) | % of GDP | Most countries, Apr 2010+ |
| `GGB_NGDP` | Fiscal balance (old code) | % of GDP | Pre-Apr 2010 |
| `GGXWDN_NGDP` | Government net debt | % of GDP | Apr 2010+ |
| `GGND_NGDP` | Government net debt (old code) | % of GDP | Pre-Apr 2010 |
| `GGSB_NPGDP` | Structural fiscal balance | % of potential GDP | ~30 advanced economies |
| `GGXONLB_NGDP` | Primary fiscal balance | % of GDP | Most countries |
| `GGR_NGDP` | Government revenue | % of GDP | Most countries |
| `GGX_NGDP` | Government expenditure | % of GDP | Most countries |
| `LUR` | Unemployment rate | % of labor force | ~120 countries |
| `NGAP_NPGDP` | Output gap | % of potential GDP | ~30 advanced economies |
| `NID_NGDP` | Investment | % of GDP | Most countries |
| `NGSD_NGDP` | Gross national savings | % of GDP | Most countries |
| `TX_RPCH` | Export volume growth | % change | Most countries |
| `TM_RPCH` | Import volume growth | % change | Most countries |
| `NGDPD` | Nominal GDP | Billions USD | All countries |
| `PPPSH` | PPP share of world GDP | % | All countries |

**Indicator renames**: The IMF changed fiscal indicator codes between Oct 2009 and Apr 2010. `GGD_NGDP` became `GGXWDG_NGDP`, `GGB_NGDP` became `GGXCNL_NGDP`, etc. Both old and new codes are in the CSV. To build a continuous series, combine them (e.g., use `GGXWDG_NGDP` for Apr 2010+, `GGD_NGDP` for earlier).

### IMF analytical regions

Each country belongs to one of 6 IMF analytical regions (available in the `region` column):

| Code | Region | N |
|------|--------|---|
| `G110` | Advanced Economies | 41 |
| `G505` | Emerging & Developing Asia | 30 |
| `G903` | Emerging & Developing Europe | 15 |
| `G205` | Latin America & Caribbean | 33 |
| `G400` | Middle East & Central Asia | 32 |
| `G603` | Sub-Saharan Africa | 45 |

### data.json structure (for web/JS use)

The JSON uses compact single-letter keys. Top-level: `v` (vintages array), `w` (world aggregates), `r` (regional aggregates), `i` (indicator metadata), `c` (country data). Each country's data per indicator has:

- `f`: Forecast dots — `[year, value, horizon, vintage_idx]` tuples. Horizon = years ahead (1–8).
- `a`: Actuals from latest vintage — `[year, value]` pairs
- `p`: Projections from latest vintage — `[year, value]` pairs
- `nc`: Nowcasts (same-year estimates) — `[year, value, is_october, vintage_idx]`

The CSV is easier to work with for analysis. Use JSON for building visualizations.

---

## Part 2: How This Database Was Built

### Sources

1. **Bulk download files** (Oct 2007 – Apr 2025): Tab-separated values with `.xls` extension (not actual Excel). ~196 countries × ~54 indicators × ~50 years per file.

2. **SDMX REST API** (Oct 2025+): The IMF's new data portal. ~145 indicators per vintage but only keeps ~2 recent editions online at any time.

3. **WEOhistorical.xlsx** (May 1990 – Oct 2002): An official IMF historical file covering 26 early editions, but only 3 indicators (GDP growth, inflation, current account).

### Pipeline

```
download_weo.py       → 36 bulk TSV files
build_db.py           → SQLite database (imf_weo.db)
import_historical_weo.py → adds 1990–2002 vintages
update_weo.py         → adds latest editions from SDMX API
export_web_data.py    → data.json + data-extended.json + CSV
```

### Known data quirks

- **Indicator renames** (Oct 2009 → Apr 2010): `GGD_NGDP` → `GGXWDG_NGDP`, `GGB_NGDP` → `GGXCNL_NGDP`. Both codes are in the CSV.
- **Venezuela hyperinflation**: Values reach 10^42. Filter or cap when computing aggregates.
- **April 2020 COVID edition**: Abbreviated — only 52K observations (vs typical 300K), only 8 indicators.
- **Output gap and structural balance**: Only available for ~30 advanced economies.
- **Early vintages** (1990–2002): Only 3 indicators (GDP growth, inflation, current account).
- **Kosovo**: Uses `UVK` in some vintages, `KOS` in others. The CSV normalizes to `KOS`.
- **Structural balance gap-fill**: The April 2010 WEO has blank `GGSB_NPGDP` for 7 European countries (BGR, CHE, CZE, HUN, ISL, POL, ROU). These were filled from the Blanchard & Leigh (2013) NBER replication archive. Documented and reproducible, but these 136 values come from an external archive, not the published WEO file.

### What "actual" means

The IMF's "actual" GDP growth for 2020 can differ between the Oct 2021 and Oct 2025 vintages because statistical offices revise their data for years. US 2020 GDP growth was initially reported as −3.4% but has since been revised to −2.1% — a 1.3pp difference that has nothing to do with forecast quality.

When evaluating forecast accuracy, there are two conventions:

1. **Fall(t+1) actual** (Celasun convention): Use the value from the October WEO published one year after the target year — i.e., `horizon == -1` with a Fall vintage. This is the first settled estimate, avoiding contamination from years of subsequent data revisions. Used in most academic papers.

2. **Latest actual**: Use the most recent vintage's value. Simpler but mixes forecast errors with data revisions that happened long after the forecast.

We recommend the Fall(t+1) convention. The `horizon` column makes this easy: filter to `horizon == -1` and Fall vintages (`Oct` or `Sep`).

---

## Part 3: Working with the Data

### Loading and basic queries

```python
import pandas as pd
df = pd.read_csv('imfweo-data.csv.gz')
df['vintage_season'] = df.vintage.str.extract(r'(Apr|Oct|May|Sep)')[0]
```

**Get the latest forecast for a country:**
```python
usa_gdp = df[(df.iso == 'USA') & (df.indicator == 'NGDP_RPCH') 
             & (df.vintage == 'Oct 2025')]
```

**Track how a forecast evolved:**
```python
# All forecasts for US GDP 2020, across all vintages
us2020 = df[(df.iso == 'USA') & (df.indicator == 'NGDP_RPCH') & (df.year == 2020)]
us2020 = us2020.sort_values('vintage')
```

**Compute the latest revision (between two vintages):**
```python
v1 = df[df.vintage == 'Apr 2025']
v2 = df[df.vintage == 'Oct 2025']
merged = v1.merge(v2, on=['iso', 'indicator', 'year'], suffixes=('_apr', '_oct'))
merged['revision'] = merged.value_oct - merged.value_apr
# Largest downgrades:
gdp_rev = merged[merged.indicator == 'NGDP_RPCH']
gdp_rev.nsmallest(10, 'revision')[['iso', 'year', 'value_apr', 'value_oct', 'revision']]
```

### Building forecast errors

```python
# Step 1: Get "actuals" — Fall(t+1) convention
fall = df[df.vintage_season.isin(['Oct', 'Sep'])]
actuals = fall[fall.horizon == -1][['iso', 'indicator', 'year', 'value']].copy()
actuals.rename(columns={'value': 'actual'}, inplace=True)
actuals = actuals.drop_duplicates(subset=['iso', 'indicator', 'year'])

# Step 2: Get h=1 forecasts (October of prior year)
h1 = fall[fall.horizon == 1][['iso', 'indicator', 'year', 'value']].copy()
h1.rename(columns={'value': 'forecast'}, inplace=True)

# Step 3: Merge and compute error (negative = over-optimistic)
errors = h1.merge(actuals, on=['iso', 'indicator', 'year'])
errors['fe'] = errors.actual - errors.forecast

# Add region for group analysis
errors = errors.merge(
    df[['iso', 'region']].drop_duplicates(), on='iso', how='left')
```

### Comparing country groups

The `region` column enables group-level analysis using the IMF's standard classification. You can also define custom groups:

```python
# Custom groups
my_groups = {
    'USA': 'Group A', 'GBR': 'Group A', 'DEU': 'Group A',
    'CHN': 'Group B', 'RUS': 'Group B', 'IRN': 'Group B',
}
errors['group'] = errors.iso.map(my_groups)
grouped = errors.dropna(subset=['group'])

# Bias by group
for g, gdf in grouped.groupby('group'):
    me = gdf.fe.mean()
    mae = gdf.fe.abs().mean()
    pct_over = (gdf.fe < 0).mean()
    n = len(gdf)
    t_stat = me / (gdf.fe.std() / np.sqrt(n))
    print(f'{g}: mean error={me:.2f}pp, MAE={mae:.2f}, '
          f'% over-forecast={pct_over:.0%}, N={n}, t={t_stat:.2f}')
```

**Controlling for confounders**: If your groups differ systematically in income level or economic structure (e.g., one group is mostly advanced economies, the other mostly developing), raw bias comparisons may reflect that rather than the grouping itself. Advanced economies have smaller forecast errors for mechanical reasons — they're more stable and better measured. To isolate the group effect:

```python
import statsmodels.formula.api as smf

# Add controls
errors['is_ae'] = (errors.region == 'G110').astype(int)
errors['gdp_vol'] = errors.groupby('iso').fe.transform('std')  # country volatility

# Regression with controls
model = smf.ols('fe ~ C(group) + is_ae + gdp_vol', data=grouped).fit()
print(model.summary())
```

This tells you whether the group difference survives after accounting for the fact that different kinds of economies have different baseline forecast accuracy.

### Extending with additional indicators

The CSV includes 21 indicators. The underlying SQLite database has 156. If you need others (e.g., nominal GDP per capita, trade balance in USD), you can work with the raw WEO bulk files:

1. Download from `https://www.imf.org/en/Publications/WEO` (under "Databases" → "Entire Dataset")
2. The files are tab-separated despite the `.xls` extension
3. Each file has one row per country-indicator, with year columns (1980–2029)
4. Pre-Oct 2020 files are encoded ISO-8859-1; Oct 2020+ are UTF-16 LE

---

## Part 4: Forecast Evaluation Toolkit

These techniques are how the IMF and academic researchers measure forecast quality. Each has been validated against published papers and cross-checked across multiple indicators. Use them to evaluate any group of countries or time period.

### Convention

Throughout this section:
- **FE = actual − forecast** (negative = the IMF was too optimistic)
- **"Actual"** = Fall(t+1) WEO value unless noted otherwise
- **h=1** = one-year-ahead forecast (October of the prior year)

### 1. Bias by horizon

**What it measures**: Whether the IMF systematically over- or under-predicts at each forecast horizon.

**Method**: For each country, compute the mean forecast error across all target years. Test whether it differs from zero using a one-sided t-test with Newey-West standard errors (to handle serial correlation). Count the share of countries with statistically significant upward or downward bias.

**Calibration (GDP growth, 2004–2017)**:

| Horizon | % with significant optimism | Mean FE |
|---------|---------------------------|---------|
| h=0 (current year) | 3–6% | ~0 |
| h=1 (year-ahead) | 10–13% | −0.15pp |
| h=2 | 21–23% | −0.40pp |
| h=3 | 26–28% | −0.50pp |
| h=5 | 26–30% | −0.55pp |

**Interpretation**: Near-zero bias at short horizons. At h=2+, a growing share of countries show statistically significant over-optimism. The bias is driven heavily by recession years — remove recessions and it nearly vanishes.

*Source: Celasun, Lee, Mrkaic & Timmermann (2021), Table 2.*

### 2. Theil U-statistic

**What it measures**: Whether the IMF forecast beats a naive benchmark (the historical average).

**Method**: `U = RMSE(WEO forecast) / RMSE(naive forecast)`. The naive forecast is the recursive mean of all prior actual growth rates (expanding window from 1990). U < 1 means the WEO adds value over simply predicting the historical average.

**Calibration (GDP growth)**:
- h=1: Median U ≈ 0.87, 27% of countries above 1.0
- h=0 (nowcast): Median U ≈ 0.20 (WEO clearly dominates)
- h=3+: Median U ≈ 1.0 (WEO roughly matches naive)

**Interpretation**: The IMF adds clear value at short horizons. By 3+ years out, the WEO is roughly as good as just guessing the historical average.

*Source: Celasun et al. (2021), Figure 4; Timmermann (2007).*

### 3. Overreaction test (Coibion-Gorodnichenko)

**What it measures**: Whether forecast revisions overshoot or undershoot.

**Method**: Regress forecast errors on forecast revisions:

```
FE_t = α + β × FR_t + country_FE + year_FE + ε
```

Where FR = current forecast − previous forecast (same target year, consecutive vintages).

- β < 0 → **overreaction** (revisions go too far)
- β > 0 → **underreaction** (revisions don't go far enough)
- β = 0 → efficient

**Calibration (GDP growth, pooled)**:
- h=1: β ≈ −0.19 (significant overreaction)
- h=2: β ≈ −0.43 (stronger overreaction)

**Asymmetric version**: Split revisions into good news (FR⁺) and bad news (FR⁻). Research shows overreaction to good news is consistently stronger than overreaction to bad news — the IMF chases upside more aggressively than it corrects on the downside.

*Source: Aktug & Rezghi (2025), Table 2; Coibion & Gorodnichenko (2015).*

### 4. Revision responsiveness

**What it measures**: How much of the forecast error gets corrected at each revision step.

**Method**: For Fall-to-Fall vintage pairs, regress the revision on the previous forecast error:

```
REV(F_i → F_{i+1}) = β₀ + β₁ × FE(F_{i-1}) + country_FE + ε
```

**Calibration (GDP growth)**:

| Revision step | β₁ | Interpretation |
|--------------|-----|---------------|
| F0→F1 (year of to year after) | −0.61 | 61% of error corrected |
| F1→F2 | −0.19 | 19% corrected |
| F2→F3 | −0.09 | 9% corrected |
| F3→F4 | −0.07 | 7% corrected |

**Interpretation**: Most learning happens in the final year. Long-horizon forecasts are sticky — only 7–9% of the error gets corrected per year at h=3+.

*Source: Hadzi-Vaskov, Ricci, Werner & Zamarripa (2021), Figure 8.*

### 5. Recession prediction

**What it measures**: How often the IMF correctly calls a recession in advance.

**Method**: A recession is defined as actual GDP growth < 0. At each vintage, check whether the forecast was also negative. If forecast ≥ 0, the recession was "missed."

**Calibration**:
- Apr(t−1): 96% of recessions missed
- Oct(t−1): 89% missed
- Apr(t): 47% missed
- Oct(t): 26% missed

**The famous quote**: "The record of failure to predict recessions is virtually unblemished" — Loungani et al. (2018). This is not unique to the IMF; private-sector forecasters have a nearly identical miss rate.

*Source: An, Jalles & Loungani (2018), Table 2.*

### 6. Country-level summary scores

**What it measures**: Per-country forecast accuracy in a compact form.

For each country, compute over a chosen period:
- **Mean error** (bias direction and magnitude)
- **MAE** (accuracy regardless of direction)
- **% over-forecast** (share of years where forecast > actual)
- **Bias z-score** (country's mean error relative to the global distribution)

These are the metrics in `forecast-scores.json`.

### 7. Mincer-Zarnowitz efficiency test

**What it measures**: Whether forecasts are "efficient" — i.e., the best possible given available information.

**Method**: Regress actuals on forecasts: `actual = α + β × forecast + ε`. Under efficiency, α = 0 and β = 1. If β < 1, forecasts overreact to variation. If β > 1, forecasts are too flat.

**Calibration**: GDP growth pooled β ≈ 0.77 (slightly too flat). For inflation, β ≈ 2.75 after country-demeaning — within-country inflation forecasts are much too flat.

*Source: Mincer & Zarnowitz (1969); Timmermann (2007).*

---

## Part 5: What the Research Says

### The big picture

A large academic literature evaluates IMF forecasts. The key findings, consistent across papers:

1. **Short-term forecasts are roughly unbiased.** At h=0 and h=1, the median bias across countries is near zero. The IMF is about as accurate as private-sector consensus forecasts.

2. **Medium-term forecasts are systematically optimistic.** At h=2+, a growing share of countries show statistically significant over-prediction of growth. The bias reaches ~0.5pp at h=3–5.

3. **The bias is driven by recessions.** Remove recession years and the optimism nearly vanishes (IEO 2014, Table 1). The IMF's inability to predict downturns — not systematic institutional optimism — accounts for most of the measured bias.

4. **Recessions are almost never predicted in advance.** 96% of recessions are missed at the April t−1 horizon. This is not unique to the IMF — Consensus Economics has a nearly identical failure rate.

5. **Forecasts overreact to good news more than bad news.** When revising upward (good news), the IMF tends to overshoot. When revising downward (bad news), it's more cautious.

6. **Fiscal consolidation optimism.** Countries planning fiscal tightening tend to have growth forecasts that are too optimistic — the IMF underestimates fiscal multipliers. Most acute during European austerity (2010–2012), where Blanchard & Leigh showed actual multipliers were ~1.5–2.0× versus the ~0.5× assumed in models.

7. **Forecasts underweight global linkages.** Cross-country correlations in IMF forecasts are systematically lower than in actual outcomes. The bottom-up forecasting process doesn't fully capture how much economies move together.

### Limitations and caveats

**Data limitations:**
- **Semiannual only.** The IMF also publishes January and July WEO Updates. This database has only the main April and October editions.
- **Actuals change.** The Fall(t+1) convention mitigates this, but it's still an approximation.
- **Not all indicators start in 1990.** GDP growth, inflation, and current account go back to 1990. Fiscal indicators only go back to ~2002. Output gap and structural balance cover only ~30 advanced economies.
- **Venezuela** hyperinflation values (reaching 10^42%) require filtering when computing aggregates.

**Analytical caveats:**
- **Don't use the latest vintage as "actual."** This mixes forecast errors with 20+ years of GDP revisions. Use Fall(t+1) — the `horizon == -1` filter.
- **Watch for multiple h=1 forecasts per year.** Each target year has two potential h=1 forecasts (April and October of the prior year). Pick one convention and stick with it.
- **Control for income level in cross-group comparisons.** Advanced economies have smaller forecast errors for mechanical reasons — they're more stable and better measured. If your country groups differ in composition (e.g., one group is mostly AEs, the other mostly EMDEs), control for the `region` column or GDP volatility before attributing differences to the grouping itself.
- **Exclude 2009 for GDP analysis** (or control for it). The GFC dominates aggregate statistics.
- **Sign conventions vary across papers.** Some define FE = forecast − actual (positive = optimistic). This file uses `actual − forecast` throughout (negative = optimistic).
- **Per-country regressions need ≥8 observations** to be meaningful.

---

## References

Core forecast evaluation papers, ordered by theme:

**Bias and efficiency:**
1. Timmermann (2007). "An Evaluation of the World Economic Outlook Forecasts." IMF WP/06/59.
2. Celasun, Lee, Mrkaic & Timmermann (2021). "An Evaluation of WEO Growth Forecasts, 2004–17." IMF WP/21/216.
3. IEO (2014). "IMF Forecasts: Process, Quality, and Country Perspectives."

**Overreaction and asymmetry:**
4. Aktug & Rezghi (2025). "Evidence of Asymmetry in WEO Forecasts." IMF WP/25/031.
5. Coibion & Gorodnichenko (2015). "Information Rigidity and the Expectations Formation Process." *AER* 105(8).

**Revision patterns:**
6. Hadzi-Vaskov, Ricci, Werner & Zamarripa (2021). "Patterns in IMF Growth Forecast Revisions." IMF WP/21/136.

**Recession prediction:**
7. An, Jalles & Loungani (2018). "How Well Do Economists Forecast Recessions?" IMF WP/18/39.

**Fiscal multipliers:**
8. Blanchard & Leigh (2013). "Growth Forecast Errors and Fiscal Multipliers." *AER* 103(3).

**Optimism and policy:**
9. Ismail, Perrelli & Yang (2020). "Optimism Bias in Growth Forecasts." IMF WP/20/229.

**Inflation:**
10. Koch & Noureldin (2023). "How We Missed the Inflation Surge." IMF WP/23/102.

**Prediction intervals:**
11. Becker, Kruger & Schienle (2024). "Simple Macroeconomic Forecast Distributions for G7." IMF WP/24/206.

**Efficiency testing:**
12. Mincer & Zarnowitz (1969). "The Evaluation of Economic Forecasts."
13. Nordhaus (1987). "Forecasting Efficiency: Concepts and Applications." *REStat* 69(4).

Interactive tracker and source code: [bd-econ.com/imfweo.html](https://bd-econ.com/imfweo.html)
