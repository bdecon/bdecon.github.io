---
title: "Matching CPS Observations to Create Crosswalks"
date: 2026-01-28T17:08:22-05:00
slug: matching-cps-observations-to-create-crosswalks
categories:
  - "Data & Python"
excerpt: "Occupation data in the monthly Current Population Survey (CPS) can be very useful, particularly during a shake-up in labor markets. The establishment survey offers solid employment data for industries, but the CPS can tell us about people w…"
featured_image: /assets/blog/2026/03/drawbridge_banner_green.jpg
featured_image_style: banner
redirect_from:
  - /2026/01/28/matching-cps-observations-to-create-crosswalks/
---

Occupation data in the monthly Current Population Survey (CPS) can be very useful, particularly during a shake-up in labor markets. The establishment survey offers solid employment data for industries, but the CPS can tell us about people with similar skillsets, across industries. Plus, the CPS is timely and offers public use microdata.

The occupation data in the CPS microdata, however, are tricky to deal with when the survey moves from using one set of occupation codes to a new set, as was the case in January 2020. Re-sorting individual job titles into occupation categories is necessary every so often, as the composition of jobs changes, as do job responsibilities. But when this happens, it creates a break in the series of monthly data. The occupation groups before the change are not the same occupation groups after the change.

For example, before January 2020, all software developers were grouped under a single occupation code. After the change, that code split: about 90% of those workers mapped to a new “software developers” code, and about 10% were separated out as “software quality assurance analysts and testers.” If you’re tracking software employment across the break, you need to know about that split — and ideally, what the percentages are.

Breaks in the occupation series are a well-known problem. Typically, to cross these breaks you can use a “crosswalk” that either gives a modal mapping of occupation codes (tells you which new code received the *most* workers from an existing code), or gives a percentage breakdown of how workers are re-sorted between occupation categories. Alternatively, you can combine occupations in a way that preserves earlier job categories, while introducing a bit of coarseness to the data.

I want to note another option: **creating crosswalks from the CPS panel data**. As an example, you can look at the same person in December 2019 and January 2020, confirm they have the same job, and see how their occupation code changed. Because the CPS has a panel design, with households interviewed multiple times, we can use the CPS data itself to build a crosswalk of occupation codes across a break.

**Does this work?** I tested it for the occupation code breaks in 1992, 2003, 2011, and 2020 and the matched sample is fairly large: 32,000-45,000 observations during each break. I then compared the results for the 2003 break to the huge dual-coded dataset (where Census assigned both old and new codes to every record) that was released to cover 2000 through 2002. The modal match using both techniques agreed in 98% of cases. Only four occupation codes had different modal matches, and they were all very close cases where the proper match is ambiguous.

Is it perfect? No. There might be seasonal issues from using only winter data. The sample sizes are large but some re-sorting of job titles results in only a few observations being shuffled between a specific pair of codes (though this shouldn’t affect modal matching). But it is an option. When you are trying to sort through the changes in codes, another tool in the toolkit might help.

------------------------------------------------------------------------

**Summary of CPS Occupation Code Breaks**

<figure class="wp-block-table">
<table class="has-fixed-layout">
<thead>
<tr>
<th>Transition</th>
<th>Date</th>
<th>Panel Sample</th>
<th>Other Sources</th>
</tr>
</thead>
<tbody>
<tr>
<td>OCC80 → OCC90</td>
<td>Jan 1992</td>
<td>~45,000</td>
<td>Beard et al. (1980 Census)</td>
</tr>
<tr>
<td>OCC90 → OCC00</td>
<td>Jan 2003</td>
<td>~44,000</td>
<td>Census dual-coded, BLS tables</td>
</tr>
<tr>
<td>OCC00 → OCC10</td>
<td>Jan 2011</td>
<td>~37,500</td>
<td>ACS-based only</td>
</tr>
<tr>
<td>OCC10 → OCC18</td>
<td>Jan 2020</td>
<td>~32,500</td>
<td>ACS-based only</td>
</tr>
</tbody>
</table>
</figure>
