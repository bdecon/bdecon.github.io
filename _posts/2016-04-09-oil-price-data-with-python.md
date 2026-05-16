---
title: "Oil Price Data with Python"
date: 2016-04-09T04:30:46+00:00
slug: oil-price-data-with-python
categories:
  - "Data & Python"
excerpt: "This example shows how Python can be used to take a look at oil prices. The script gathers daily oil price data from Quandl and plots how the price has changed over the past few months."
redirect_from:
  - /2016/04/09/oil-price-data-with-python/
---

This example shows how Python can be used to take a look at oil prices. The script gathers daily oil price data from [Quandl](https://www.quandl.com/) and plots how the price has changed over the past few months.

<div id="notebook-container" class="container">

<div class="cell border-box-sizing text_cell rendered">

<div class="inner_cell">

### Gathering data

First, we import pandas, numpy, and matplotlib and give them conventional short names.

</div>

<div class="inner_cell">

</div>

<div class="inner_cell">

In \[1\]:

</div>

</div>

<div class="cell border-box-sizing code_cell rendered">

<div class="input">

<div class="inner_cell">

<div class="input_area">

<div class="highlight hl-ipython2">

    # Import libraries
    import pandas as pd
    import numpy as np
    import matplotlib as mpl
    import matplotlib.pyplot as plt
    %matplotlib inline

</div>

</div>

</div>

</div>

</div>

</div>

Next, we identify the url for our data. In this case, the data is provided by Quandl and the url can be obtained by clicking ‘csv’ under the API for any series on the right-hand side of the page. We read the CHRIS CME_CL1 csv file provided by Quandl into a pandas dataframe.

<div id="notebook-container" class="container">

<div class="cell border-box-sizing code_cell rendered">

<div class="input">

<div class="prompt input_prompt">

In \[2\]:

</div>

<div class="inner_cell">

<div class="input_area">

<div class="highlight hl-ipython2">

    # Import from Quandl WTI crude oil price data
    url = "https://www.quandl.com/api/v3/datasets/CHRIS/CME_CL1.csv"
    wticl1 = pd.read_csv(url, index_col=0, parse_dates=True)
    wticl1.sort_index(inplace=True)
    wticl1_last = wticl1['Last']
    wticl1['PctCh'] = wticl1.Last.pct_change()

</div>

</div>

</div>

</div>

</div>

<div class="cell border-box-sizing text_cell rendered">

<div class="prompt input_prompt">

</div>

<div class="inner_cell">

<div class="text_cell_render border-box-sizing rendered_html">

### Line plot of oil price

Lastly, we can use matplotlib to generate a line plot showing the most recent 68 days worth of closing prices for WTI crude front month contracts. The past week has seen this measure of oil prices reach nearly \$40 per barrel.

</div>

</div>

</div>

<div class="cell border-box-sizing code_cell rendered">

<div class="input">

<div class="prompt input_prompt">

In \[3\]:

</div>

<div class="inner_cell">

<div class="input_area">

<div class="highlight hl-ipython2">

    fig = plt.figure(figsize=[7,5])
    ax1 = plt.subplot(111)
    line = wticl1_last.tail(68).plot(color='red',linewidth=3)
    ax1.set_ylabel('USD per barrel')
    ax1.set_xlabel('')
    ax1.set_title('WTI Crude Oil Price', fontsize=18)
    ax1.spines["top"].set_visible(False)  
    ax1.spines["right"].set_visible(False)  
    ax1.get_xaxis().tick_bottom()
    ax1.get_yaxis().tick_left()
    ax1.tick_params(axis='x', which='major', labelsize=8)
    fig.text(0.15, 0.85,'Last: $' + str(wticl1.Last[-1])\
             + ' (as of: ' \
             + str(wticl1.index[-1].strftime('%Y-%m-%d'))\
             + ')');
    fig.text(0.15, 0.80,'Change: $' + str(wticl1.Change[-1])\
             + '; ' \
             + str((np.round((wticl1.PctCh[-1] * 100), \
             decimals=2))) + '%')
    fig.text(0.1, 0.06, 'Source: ' + url)
    fig.text(0.1, 0.02, 'briandew.wordpress.com')
    plt.savefig('oil.png', dpi=1000)

</div>

</div>

</div>

</div>

<div class="output_wrapper">

<div class="output">

<div class="output_area">

<div class="prompt">

</div>

<div class="output_png output_subarea">

<img src="/assets/blog/2016/04/oil.png" class="alignnone size-full wp-image-1050" loading="lazy" width="7000" height="5000" alt="oil" />

</div>

</div>

</div>

</div>

</div>

</div>
