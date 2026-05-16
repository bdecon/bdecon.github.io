---
title: "Where Did IFS Go? Accessing IMF Data After the 2025 API Restructuring"
date: 2016-08-10T18:43:36+00:00
slug: using-the-imf-data-api-data-retrieval-with-python
categories:
  - "Data & Python"
  - "Macroeconomics"
excerpt: "Update (2025): The IMF reorganized International Financial Statistics (IFS) data into topic-specific datasets. This post explains the changes and shows how to find former IFS data in the new structure."
redirect_from:
  - /2016/08/10/using-the-imf-data-api-data-retrieval-with-python/
---

**Update (2025):** The IMF reorganized International Financial Statistics (IFS) data into topic-specific datasets. This post explains the changes and shows how to find former IFS data in the new structure.

------------------------------------------------------------------------

For decades, International Financial Statistics (IFS) was the IMF’s flagship macroeconomic database—a one-stop shop for exchange rates, interest rates, prices, production, and national accounts across 180+ countries. If you wrote code against the old IMF API, chances are you pulled from IFS.

In 2025, the IMF restructured its data access around SDMX (Statistical Data and Metadata eXchange) and reorganized IFS into topic-specific datasets. This post explains what changed and shows how to access the same data in the new system.

## What Changed

IFS data is now organized around topics, with indicators accessible via specialized datasets. Here are some of the major categories:

<figure class="wp-block-table">
<table class="has-fixed-layout">
<thead>
<tr>
<th>Old IFS Category</th>
<th>New Dataset</th>
</tr>
</thead>
<tbody>
<tr>
<td>National Accounts</td>
<td><strong>ANEA</strong> (Annual), <strong>QNEA</strong> (Quarterly)</td>
</tr>
<tr>
<td>Consumer Prices</td>
<td><strong>CPI</strong></td>
</tr>
<tr>
<td>Producer Prices</td>
<td><strong>PPI</strong></td>
</tr>
<tr>
<td>Exchange Rates</td>
<td><strong>ER</strong>, <strong>EER</strong></td>
</tr>
<tr>
<td>Interest Rates</td>
<td><strong>MFS_IR</strong></td>
</tr>
<tr>
<td>Monetary Aggregates</td>
<td><strong>MFS_MA</strong></td>
</tr>
<tr>
<td>Central Bank Data</td>
<td><strong>MFS_CBS</strong></td>
</tr>
<tr>
<td>Balance of Payments</td>
<td><strong>BOP</strong></td>
</tr>
<tr>
<td>International Investment Position</td>
<td><strong>IIP</strong></td>
</tr>
<tr>
<td>Labor Statistics</td>
<td><strong>LS</strong></td>
</tr>
</tbody>
</table>
</figure>

The restructuring reorganized how IFS data is accessed—the same indicators are now distributed across topic-specific datasets. See the [official IMF guidance](https://data.imf.org/en/news/accessing%20international%20financial%20statistics) for a complete list.

## Finding Former IFS Data

If you have old code that referenced IFS series, there’s no direct lookup from old codes to new ones. The practical approach:

1.  **Identify the category** — Determine what type of data you need (prices, interest rates, GDP, etc.) and find the corresponding dataset from the table above.
2.  **Explore the new dataset** — Use the [IMF Data Portal](https://data.imf.org/) to browse interactively, or explore codelists programmatically:

```python
import sdmx

IMF_DATA = sdmx.Client('IMF_DATA')

# Example: Find interest rate indicators in MFS_IR
ir_flow = IMF_DATA.dataflow('MFS_IR')
indicators = sdmx.to_pandas(ir_flow.codelist['CL_MFS_IR_INDICATOR'])
print(indicators)
```

3.  **Verify with IFS_FLAG** — Once you’ve found the data, you can confirm it was part of the original IFS by checking the `IFS_FLAG` attribute in the returned data:

```python
data_msg = IMF_DATA.data('MFS_IR', key='USA.MFS135_RT_PT_A_PT.M')
df = sdmx.to_pandas(data_msg).reset_index()
print(df['IFS_FLAG'].unique())  # ['true'] confirms this was in IFS
```

## Quick Reference: Retrieving Data

If you already know the dataset and key you need (see the [BD Economics IMF API Guide](/imfapi1.html) for finding keys), retrieval is straightforward:

```python
import sdmx
import pandas as pd

IMF_DATA = sdmx.Client('IMF_DATA')

# Fetch data
data_msg = IMF_DATA.data('DATASET', key='YOUR.KEY.HERE')
df = sdmx.to_pandas(data_msg).reset_index()
df = df.set_index('TIME_PERIOD')['value']
```

The `sdmx.to_pandas()` function returns a Series with a MultiIndex (one level per dimension). Calling `.reset_index()` converts this to a flat DataFrame with dimensions as columns, which is easier to filter and reshape. The key format varies by dataset—check dimension order with `dataflow('DATASET').structure['DSD_...'].dimensions.components`. For details on exploring datasets and finding codes, see [Part 2 of the BD Economics guide](/imfapi2.html).

## Example 1: Banking Spreads Across 80+ Countries

Where the IMF data truly shines is its *breadth*—comparable data across dozens of countries. For timely data on any single country, you’d go to that country’s central bank. But for cross-country comparisons, the IMF is unmatched.

The **MFS_IR** dataset contains interest rate data for nearly 100 countries. Let’s compare deposit rates (what banks pay savers) to lending rates (what banks charge borrowers). The spread between them reveals banking sector margins—and varies dramatically across countries.

A few syntax notes for the code below:

- The key format is `COUNTRY.INDICATOR.FREQUENCY`—a leading `.` means “all countries”
- Use `+` to request multiple codes in one dimension (e.g., two indicators in a single call)
- The `params` dictionary filters by time period

```python
import pandas as pd
import sdmx
import matplotlib.pyplot as plt

IMF_DATA = sdmx.Client('IMF_DATA')

msg = IMF_DATA.data('MFS_IR', key='.MFS135_RT_PT_A_PT+MFS162_RT_PT_A_PT.M',
                    params={'startPeriod': '2023-12', 'endPeriod': '2023-12'})
df = sdmx.to_pandas(msg).reset_index()

# Pivot to wide format: one row per country, indicators as columns
rates = df.pivot(index='COUNTRY', columns='INDICATOR', values='value')
rates.columns = ['deposit_rate', 'lending_rate']
rates = rates.dropna()

# Plot (excluding extreme outliers)
df_plot = rates[(rates['deposit_rate'] < 50) & (rates['lending_rate'] < 60)]

plt.figure(figsize=(7, 5))
plt.scatter(df_plot['deposit_rate'], df_plot['lending_rate'],
            s=50, alpha=0.6, c='steelblue')

# Add 45° line (points on this line have zero spread)
max_val = max(df_plot['deposit_rate'].max(), df_plot['lending_rate'].max())
plt.plot([0, max_val], [0, max_val], 'k--', alpha=0.3, linewidth=1)

plt.xlabel('Deposit Rate (%)')
plt.ylabel('Lending Rate (%)')
plt.title(f'Bank Deposit vs Lending Rates ({len(df_plot)} Economies, Dec 2023)')
plt.grid(True, alpha=0.3)
plt.show()
```

<figure class="wp-block-image size-large">
<img src="/assets/blog/2016/08/deposit_lending_scatter.png" class="wp-image-4274" loading="lazy" width="1024" height="727" alt="Scatter plot of bank deposit rate vs lending rate for 83 economies in December 2023, with a dashed 45° reference line. Most points sit above the line — lending rates exceed deposit rates by the spread (a few percentage points in developed economies, up to ~30 percentage points in outliers like Brazil)." />
</figure>

With a single dataset (**MFS_IR**), we get a global view of banking sector margins. The vertical distance from the 45° line shows the spread—how much more banks charge borrowers than they pay depositors. Brazil stands out with a 30% spread (11% deposit, 41% lending), while developed economies cluster near the bottom with spreads of 2-4%.

**Key codes for MFS_IR:**

- `MFS135_RT_PT_A_PT` — Deposit rate (% per annum)
- `MFS162_RT_PT_A_PT` — Lending rate (% per annum)
- `MFS166_RT_PT_A_PT` — Policy/central bank rate (% per annum)

## Example 2: Quarterly GDP Growth (QNEA)

The old IFS “National Accounts” data is now split between **ANEA** (annual) and **QNEA** (quarterly). QNEA is particularly useful for tracking business cycles and comparing growth across countries.

Let’s compare year-over-year GDP growth for four major emerging markets.

The key format for QNEA is `COUNTRY.INDICATOR.PRICE_TYPE.S_ADJUSTMENT.TYPE_OF_TRANSFORMATION.FREQUENCY`. In our key:

- `IND+CHN+BRA+MEX` — four countries in one request
- `B1GQ` — GDP indicator
- `Q` — constant prices (real GDP, not nominal)
- Empty dimensions (`..`) mean “all values”—we’ll filter afterward
- `XDC` — domestic currency
- `Q` — quarterly frequency

```python
import pandas as pd
import sdmx
import matplotlib.pyplot as plt

IMF_DATA = sdmx.Client('IMF_DATA')

msg = IMF_DATA.data('QNEA', key='IND+CHN+BRA+MEX.B1GQ.Q..XDC.Q',
                    params={'startPeriod': '2020'})
df = sdmx.to_pandas(msg).reset_index()
df = df[df['S_ADJUSTMENT'] == 'NSA']  # Use NSA for consistency

# Convert quarters to dates and pivot to wide format
df['date'] = pd.PeriodIndex(df['TIME_PERIOD'], freq='Q').to_timestamp()
pivot = df.pivot(index='date', columns='COUNTRY', values='value')

# Calculate year-over-year growth (4 quarters back)
growth = pivot.pct_change(periods=4, fill_method=None) * 100
growth = growth[growth.index >= '2022-07-01']

# Plot
growth.rename(columns={'IND': 'India', 'CHN': 'China', 'BRA': 'Brazil', 'MEX': 'Mexico'}).plot(
    figsize=(5, 5), linewidth=2)
plt.axhline(y=0, color='black', linewidth=0.5)
plt.ylabel('Year-over-Year Growth (%)')
plt.title('Quarterly Real GDP Growth')
plt.grid(True, alpha=0.3)

# Add padding to y-axis so legend doesn't overlap data
ymin, ymax = plt.ylim()
plt.ylim(ymin - (ymax - ymin) * 0.1, ymax + (ymax - ymin) * 0.2)
plt.show()
```

<figure class="wp-block-image size-large">
<img src="/assets/blog/2016/08/gdp_growth_comparison.png" class="wp-image-4275" loading="lazy" width="733" height="732" alt="Line chart of quarterly year-over-year real GDP growth for India, China, Brazil, and Mexico, Q3 2022 through Q3 2025. India runs the highest (5-10%); China sits in the 5% range; Brazil drifts from 4% down to about 2%; Mexico slows from ~4.5% to near 0%." />
</figure>

The chart shows how quarterly GDP growth has evolved across these four economies. India consistently posts the strongest growth, while the others show more volatility. This kind of cross-country comparison—using standardized definitions across dozens of economies—is where IMF data is most valuable.

**Key codes for QNEA:**

- `B1GQ` — Gross Domestic Product
- `B1G` — Gross Value Added
- `P3` — Final Consumption Expenditure
- `P51G` — Gross Fixed Capital Formation
- `P6` — Exports of Goods and Services
- `P7` — Imports of Goods and Services

**Price types:** `V` (current prices), `Q` (constant/real prices), `PD` (deflator)

**Seasonal adjustment:** `SA` (seasonally adjusted), `NSA` (not adjusted)

## Summary

The IFS restructuring means:

1.  **Same data, new organization** — Former IFS series are now in topic-specific datasets
2.  **IFS_FLAG identifies legacy data** — Check this attribute to find former IFS series
3.  **Key formats vary by dataset** — Use `dimensions.components` to find the order
4.  **SDMX is the new standard** — The `sdmx1` library works with IMF, World Bank, ECB, and OECD

For detailed guidance on exploring datasets and finding codes, see:

- [BD Economics IMF API Guide Part 1](/imfapi1.html) — Data retrieval basics
- [BD Economics IMF API Guide Part 2](/imfapi2.html) — Finding datasets and codes

## Resources

- [IMF Data Portal](https://data.imf.org/) — Browse datasets interactively
- [Accessing IFS in the New Portal](https://data.imf.org/en/news/accessing%20international%20financial%20statistics) — Official IMF guidance
- [sdmx1 documentation](https://sdmx1.readthedocs.io/) — Full library reference
- [sdmx1 on PyPI](https://pypi.org/project/sdmx1/) — Installation
