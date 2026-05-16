---
title: "Higher employment rates mean higher wages for low-wage workers"
date: 2019-01-24T03:56:26+00:00
slug: higher-employment-rates-mean-higher-wages-for-low-wage-workers
categories:
  - "Labor Market"
  - "Wages & Income"
tags:
  - "Employment"
  - "Wages"
excerpt: "Low-wage jobs pay better when the local labor market is tight. This is because an employer who can’t easily replace one worker with another will tend to pay current workers more to incentivize them to stay and also will tend to invest more…"
redirect_from:
  - /2019/01/24/higher-employment-rates-mean-higher-wages-for-low-wage-workers/
---

Low-wage jobs pay better when the local labor market is tight. This is because an employer who can’t easily replace one worker with another will tend to pay current workers more to incentivize them to stay and also will tend to invest more in equipment and training that make workers more productive and grows the economy.

One way to see this relationship is to look at what percent of people living in an area have a job and the wages near the bottom of the area’s wage distribution. For example, for workers between the ages of 25 and 54 in the ~100 largest metro areas, a one percentage point increase in the share of the age group with a job results in \$0.13 an hour in additional wages for the first decile full-time wage earner in the metro area, equivalent to more than \$200 extra per worker per year (in November 2018 dollars).

Employment rates (the share of the age group with a job) have been rapidly increasing since 2012 and show no sign of slowing (and perhaps even show signs of accelerating, as higher wages pull more people off the sidelines). If the trend is allowed to continue until the employment rate returns to its late 1990s rate, the employment-rate-related real wage boost for low-wage full-time workers would be between \$500 and \$600 a year.

<img src="/assets/blog/2019/01/cbsa_p10wage_epop.png" class="alignnone size-full wp-image-3297" loading="lazy" width="432" height="432" alt="cbsa_p10wage_epop" />

**Data source**

This relationship has been pointed out countless times, for example by Dean Baker, but it worth reiterating, using the latest data. I’ve calculated these figures from the Current Population Survey public use microdata, using the latest two years of monthly data (December 2016-November 2018). The results are stored [here](https://github.com/bdecon/econ_data/blob/master/micro/CBSA_2YR_Indicators.csv) in csv file, for those curious about which dot is which metro area. I’ve also added the union membership rate and the unemployment rate for the area to the file. Wages are in November 2018 dollars, adjusted for inflation within the 2-year period by the regional CPI-U. The largest metro areas are the 97 center-based statistical areas (CBSAs) with at least 300 valid wage observations during the 2-year period. The python code that generates the results is available [here](https://github.com/bdecon/econ_data/blob/master/micro/CPS_EPOP_P10wage_CBSA.ipynb). I use a set of programs called the bd CPS to standardize the CPS data from 1994 to present, which are available as a [GitHub repo](https://github.com/bdecon/econ_data/tree/master/bd_CPS).
