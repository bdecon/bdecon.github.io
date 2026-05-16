---
title: "bd CPS version 0.3 released"
date: 2019-02-07T21:03:12+00:00
slug: bd-cps-version-0-3-released
categories:
  - "Data & Python"
excerpt: "Version 0.3 of my notebooks for cleaning up and working with Current Population Survey public use microdata is available on GitHub. Several new variables were added, much of the code was refactored for speed, and several bugs were fixed. Th…"
redirect_from:
  - /2019/02/07/bd-cps-version-0-3-released/
---

Version 0.3 of my notebooks for cleaning up and working with Current Population Survey public use microdata is <a href="https://github.com/bdecon/econ_data/tree/master/bd_CPS" target="_blank" rel="noopener noreferrer">available on GitHub</a>. Several new variables were added, much of the code was refactored for speed, and several bugs were fixed. The new version makes use of Census revised weights for 2000-2002 and December 2007, revised data on union membership and coverage in 2001 and 2002, and data on professional certification for 2015 and 2016. There is also a new notebook for creating extracts for 1989-93 from microdata hosted by NBER.

I’m looking into how to (for free or very cheaply) host the actual data files from this project, since they would definitely be useful to people who know python and want to work with CPS data. Each annual file is about 30mb after compression. Any suggestions are welcome.

As always, please contact me (brian.w.dew@gmail.com) if you find any errors or have any questions.
