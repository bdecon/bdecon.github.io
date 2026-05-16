---
title: "Do regional inflation differences affect nationwide real wage estimates?"
date: 2019-01-30T19:39:52+00:00
slug: do-regional-inflation-differences-affect-nationwide-real-wage-estimates
categories:
  - "Data & Python"
  - "Prices & Inflation"
  - "Wages & Income"
excerpt: "Some basic facts about the US economy point to the possibility that inflation is overstated in measures of real wage growth for workers at the very bottom of the wage distribution. If this is true, it would mean that low-wage earners have a…"
redirect_from:
  - /2019/01/30/do-regional-inflation-differences-affect-nationwide-real-wage-estimates/
---

Some basic facts about the US economy point to the possibility that inflation is overstated in measures of real wage growth for workers at the very bottom of the wage distribution. If this is true, it would mean that low-wage earners have actually seen more wage growth than published estimates suggest.

First, the places that have a higher state or local minimum wage than the federal minimum wage tend to be in the west region of the US, and sometimes in the northeast or midwest regions, but rarely in the south. The regional differences in minimum wage create large differences in the regional distribution of low wage earners. In November 2018, the population (including children) is divided by region as follows: midwest: 20.8%, northeast: 17.6%, south: 37.8%, and west: 23.8%. In contrast, people earning $8.00 per hour or less are distributed as follows: midwest: 19.2%, northeast: 16.3%, south: 51.3%, and west: 13.2%. In other words, low wage earners are disproportionately in the south and disproportionately not in the west.

Second, in recent years inflation has been higher in the west region, compared to the south or midwest regions. This is largely <a href="https://www.kansascityfed.org/~/media/files/publicat/research/macrobulletins/mb16rappaportredmond1219.pdf" target="_blank" rel="noopener noreferrer">because</a> inflation has recently been driven by housing shortages, which are particularly severe in the west region. Price growth from December 2017 to December 2018 was 1.9% nationwide, 1.3% in the midwest, 1.7% in the northeast, 1.5% in the south, and 3.1% in the west.

The above creates a potential issue for estimates of real wage growth for low wage earners. This is because nearly all such estimates apply the nationwide rate of inflation (for all urban consumers) to workers who disproportionately live in the south, which has less inflation than the nation as a whole. Likewise, low-wage workers are not nearly as likely to live in the west, which has higher inflation than the nation as a whole.

To test this, I used CPS microdata to calculate the real wage for the fifth percentile wage earner (nationwide) using both the usual CPI-U (the CPI-U-RS is preferred, but that would have complicated analysis) and using the regional CPI for each of the four regions. That is, in the regional CPI estimate, each wage observation is adjusted using the price index for the region where the person lives.

<img src="/assets/blog/2019/01/rw_by_cpi-1.png" class="alignnone size-full wp-image-3304" loading="lazy" width="432" height="288" alt="rw_by_cpi" />

The results show that the story above does apply, but that the effects are very minimal and not particularly cumulative. The total cumulative difference since 1989 is less than three percent. In other words, it’s true that low wage earners did better than published estimates suggest, but the effect is not very big. It’s important to point out that adjusting for age, or including only full-time workers, eliminates most of the cumulative impact. Usually findings this trivial are not written up as a blog post, but they might be of interest to people who have the same question. Here’s the jupyter [notebook](https://github.com/bdecon/blog_posts/blob/master/Regional_CPI_Wages/Regional_wage_deflators.ipynb) used to calculate the results.

Comments and feedback are always welcome. Please let me know if I did something wrong, so I can learn!
