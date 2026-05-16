---
title: "Choropleth with matplotlib and basemap"
date: 2019-09-25T15:24:35+00:00
slug: choropleth-with-matplotlib-and-basemap
categories:
  - "Data & Python"
excerpt: "When I was using excel to make all of my graphs, the choropleth map was out of reach and particularly alluring. Later, using Stata, I figured out how to make choropleth maps, but the results were never quite right. Now, much later, excel ha…"
redirect_from:
  - /2019/09/25/choropleth-with-matplotlib-and-basemap/
---

When I was using excel to make all of my graphs, the <a href="https://en.wikipedia.org/wiki/Choropleth_map" target="_blank" rel="noopener">choropleth map</a> was out of reach and particularly alluring. Later, using Stata, I figured out how to make choropleth maps, but the results were never quite right. Now, much later, excel has tools to make these maps easily, and so do you, even if you don’t have a modern copy of excel, by using python!

What follows is an example that maps 2017 GDP growth by Norwegian county.

First, <a href="https://www.ssb.no/en/fnr" target="_blank" rel="noopener">GDP growth data</a> is collected from the statistics office website. Next, <a href="https://github.com/MasterMaps/N2000-Kartdata" target="_blank" rel="noopener">shapefiles</a> that match the regions in the data (NO_Fylker_pol_latlng) are downloaded and, using an online tool, [simplified](https://mapshaper.org/) to 10% (because Norway has an extremely complex coastline). The simplified shapefiles are saved in a folder called shapefiles.

Python imports:

    # Import packages 
    import numpy as np
    import matplotlib.pyplot as plt
    from matplotlib.patches import Polygon
    from matplotlib.colors import Normalize
    from mpl_toolkits.basemap import Basemap as Basemap

Data from the Stats Office as dictionary d:

<div class="inner_cell">

<div class="input_area">

``` highlight
# data for choropleth
d = {'Østfold': 2.5,
 'Akershus': 2.5,
 'Oslo': 2.8,
 'Hedmark': 2.2,
 'Oppland': 2.3,
 'Buskerud': 2.0,
 'Vestfold': 2.1,
 'Telemark': 0.7,
 'Aust-Agder': 2.5,
 'Vest-Agder': 0.9,
 'Rogaland': -0.4,
 'Hordaland': 1.2,
 'Sogn og Fjordane': 1.6,
 'Møre og Romsdal': 0.7,
 'Sør-Trøndelag': 2.9,
 'Nord-Trøndelag': 2.9,
 'Nordland': 1.9,
 'Troms': 2.1,
 'Finnmark': 2.0}
```

</div>

</div>

Code creates the map:

    # Create map with lcc projection and boundaries that tightly frame Norway
    m = Basemap(llcrnrlon=5, llcrnrlat=57, urcrnrlon=33, urcrnrlat=71,
                projection='lcc', lat_1=57, lon_0=15)

    fig = plt.figure(figsize=(8, 16))

    m.drawmapboundary()   # Create space for drawing county shapes

    # read shapefiles using latin-1 encoding and call shape data "no_co"
    m.readshapefile('shapefiles/NO_Fylker_pol_latlng', 'no_co', 
                    drawbounds=False,
                    default_encoding='latin-1')

    ax = plt.gca()   # Call the current plot area "ax"
    ax.axis('off')   # Turn off border on outer edge of map

    # Map values between -2 and 4 to colors in the rainbow_r colormap
    cm = plt.cm.rainbow_r
    norm = Normalize(-2, 4)

    # For each county, select the face color and add shape to the map
    for info, shape in zip(m.no_co_info, m.no_co):
        fc = cm(norm(d[info['NAVN']])) 
        ax.add_patch(Polygon(shape, fc=fc, ec='white', lw=0.5))
        
    # Add title and colorbar legend
    plt.title(f'Norway Real GDP Growth by County, 2017', fontsize=16)
    cb = fig.colorbar(ax.imshow([np.array([-2, 4])], cm), shrink=0.25, pad=-0.3)
    cb.outline.set_linewidth(0.1)

<img src="/assets/blog/2019/09/norway.png" class="alignnone size-full wp-image-3414" loading="lazy" width="527" height="686" alt="norway" />
