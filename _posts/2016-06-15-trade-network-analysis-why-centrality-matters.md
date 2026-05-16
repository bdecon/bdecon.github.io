---
title: "Global trade network analysis with Python: central players in bluefin tuna and large aircraft"
date: 2016-06-15T19:33:10+00:00
slug: trade-network-analysis-why-centrality-matters
categories:
  - "Data & Python"
  - "Trade & International"
excerpt: "Network analysis provides useful insights into complex bilateral trade data. Two methods are presented for calculating with Python each country’s influence in the global trade network for individual goods. Related concepts in graph and inte…"
redirect_from:
  - /2016/06/15/trade-network-analysis-why-centrality-matters/
---

*Network analysis provides useful insights into complex bilateral trade data. Two methods are presented for calculating with Python each country’s influence in the global trade network for individual goods. Related concepts in graph and international trade theories are discussed.*

##### Modern goods have complex trade networks

The things we buy increasingly travel long distances and from scattered origins before they reach us. Take <a href="https://www.thetoasterproject.org/page2.htm" target="_blank" rel="noopener noreferrer">one man’s repeatedly failed attempt to build a toaster</a> (from scratch). Over several decades companies have changed their production techniques, relying on global value chains, for example, to keep costs low. These changes have gradually contributed to long-term growth in global trade.

The more deeply a country becomes involved in global trade, and in global supply chains in particular, the more subjected its economy becomes to changes abroad. This can be good; historically many powerful cities began as ports. However, the potential for higher returns from servicing foreign demand carries with it increased risk of economic contagion.

It is not hard to imagine how global supply chain connections transmit effects from other countries. If a strike in France delays the delivery of a crucial intermediate good, it may cause an assembly line stoppage in Taiwan. On an aggregate level, the results do not necessarily average out, and can result in vast shifts of wealth.

It may therefore prove useful to examine the complex <a href="https://dhs.stanford.edu/dh/networks/" target="_blank" rel="noopener noreferrer">networks</a> of global trade using the tools provided largely by <a href="https://world.mathigon.org/Graph_Theory" target="_blank" rel="noopener noreferrer">graph theory</a>. As an example, let’s start with a graph of the global trade of tires in 2012.

<div id="attachment_2430" class="wp-caption alignnone" style="width: 6010px">

<img src="/assets/blog/2016/06/401110.png" class="alignnone size-full wp-image-2430" aria-describedby="caption-attachment-2430" loading="lazy" width="6000" height="4000" alt="401110" />

Trade networks are complex and large. Data source: UN Comtrade

</div>

Each country that exported or imported automobile tires in 2012 is represented above by one *<a href="https://en.wikipedia.org/wiki/Vertex_(graph_theory)" target="_blank" rel="noopener noreferrer">node</a>* labeled with its <a href="https://www.nationsonline.org/oneworld/country_code_list.htm" target="_blank" rel="noopener noreferrer">three letter country code</a> (for example Germany is DEU). The precise location of a node on the graph is not critical (it is often arbitrary), but generally countries more *central* to the trade of tires are closer to the center of the network. Likewise, countries are generally graphed near their largest trading partners.

Each trading relationship is shown on the graph as an *[edge](https://en.wikipedia.org/wiki/Glossary_of_graph_theory#edge)* (a line connecting two nodes). If France exports tires to Aruba, the graph will include an edge connecting the two nodes labeled FRA and ABW. Trade network edges are considered *directed*, as the flow of goods has a direction (either imports or exports).

##### Rat’s nest or Rorschach?

You may look at the above ‘visualization’ and simply see a rat’s nest. This is a correct interpretation. The graph shows overall complexity in the trade network, not individual bilateral relationships (there are more than 4400 edges in this network). Indeed the automobile tire trade network is particularly large and dense. Many countries currently produce internationally competitive tires and all countries use them and import at least some. In fact, the average country imports tires from many other countries. A graph of the resultant trade network is reminiscent of a gray blob and practically as useful.

More useful, however, are individual *metrics* of network structure. For example, which countries tend to trade only with a select subgroup of other countries? Which goods are traded in networks where one country dominates trade? These questions relate theoretically to the respective graph theory concepts of <a href="https://en.wikipedia.org/wiki/Cluster_analysis" target="_blank" rel="noopener noreferrer">clustering</a> and <a href="https://en.wikipedia.org/wiki/Centrality" target="_blank" rel="noopener noreferrer">centrality</a>.

Let’s take a look at how the Python programming language can be used to measure centrality in trade networks, and discuss two specific measures of centrality.

#### Python for trade network analysis

What follows is a more technical segment with sample code for trade network analysis of using Python 2.7.

###### Let’s start by importing the packages

In \[1\]:

    import networkx as nx
    import csv
    import numpy as np
    import matplotlib
    import matplotlib.pyplot as plt
    from matplotlib import cm
    from mpl_toolkits.axes_grid1 import make_axes_locatable
    %matplotlib inline

We will rely heavily on <a href="https://networkx.github.io/" target="_blank" rel="noopener noreferrer">NetworkX</a> and give it the short name nx. Numpy is used to do certain calculations, and matplotlib helps with the visualizations.

##### Load the data and build the network

The example uses cleaned bilateral <a href="https://comtrade.un.org/" target="_blank" rel="noopener noreferrer">UN Comtrade</a> trade data for scrap aluminum exports in 2012. The data follow the HS2002 classification system at the six-digit level of aggregation, and are sourced from <a href="https://wits.worldbank.org/" target="_blank" rel="noopener noreferrer">WITS</a> (subscription required for bulk download). Data are read from a csv file with the equivalent of three ‘columns’: the exporting country code, the importing country code, and the inflation-adjusted US Dollar value of exports in the one year period.

Data from the csv file are read line by line to build the network quickly. NetworkX is used to build the network, which is called G according to convention, as a series of edges.

###### Read the data and build a network called G

In \[2\]:

    G = nx.DiGraph() # create a directed graph called G
     
    # Loop reads a csv file with scrap aluminum bilateral trade data
    with open('760200_2012.csv', 'r') as csvfile:

         csv_f = csv.reader(csvfile)
         csv_f.next()

    # Now we build the network by adding each row of data 
    # as an edge between two nodes (columns 1 and 2).
         for row in csv_f:
              G.add_edge(row[0],row[1],weight=row[2])

Let’s look at a specific bilateral trade relationship to verify that the new network, G, is correct. Exports of scrap aluminum from the U.S. to China should be quite large in 2012.

###### Check individual trade flow (edge)

In \[3\]:

    usachnexp = G.edge['USA']['CHN']['weight']
    print 'USA 2012 scrap aluminum exports to China, in USD: ' + str(usachnexp)

    USA 2012 scrap aluminum exports to China, in USD: 1199682944

##### Central players can affect the market

Now that the network has been built, we can use indicators from graph theory to identify potential weaknesses and risks in the network’s structure. In this example, we will look for the presence of dominant countries in the trade network. Dominant importers or exporters have the ability to influence supply and demand and therefore price. These dominant countries are highly influential players in the trade network, a characteristic measured in graph theory as *centrality*.

There are several measures of centrality and two are discussed briefly in this post. The first is **[eigenvector centrality](https://en.wikipedia.org/wiki/Centrality#Eigenvector_centrality)**, which iteratively computes the weighted and directed centrality of a node based on the centrality scores of its connections. The example below scores each importer country as a function of the import-value-weighted scores of its trading partners. That is, an importer is considered influential to a trade network (receives a high eigenvector centrality score) if it imports a lot from countries that are also influential. Mathematically, eigenvector centrality computes the left or right (left is import centrality, right is export centrality) principle eigenvector for the network matrix.

See the <a href="https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.centrality.eigenvector_centrality_numpy.html" target="_blank" rel="noopener noreferrer">NetworkX documentation</a> for questions on the code or [this](https://djjr-courses.wikidot.com/soc180:eigenvector-centrality) for more details on the math.

###### Calculate eigenvector centrality of imports

In \[4\]:

    # Calculate eigenvector centrality of matrix G 
    # with the exports value as weights
    ec = nx.eigenvector_centrality_numpy(G, weight='weight')

    # Set this as a node attribute for each node
    nx.set_node_attributes(G, 'cent', ec)

    # Use this measure to determine the node color in viz
    node_color = [float(G.node[v]['cent']) for v in G]

##### Calculate total exports

Next we calculate each country’s total exports of scrap aluminum in 2012 as the sum total of its individual exports (edges) to other nodes. In the script, total export data is assigned as a node attribute and set aside to be used as the node size in the visualization.

###### Calculate each country’s total exports

In \[5\]:

    # Blank dictionary to store total exports
    totexp = {}

    # Calculate total exports of each country in the network
    for exp in G.nodes(): 
         tx=sum([float(g) for exp,f,g in G.out_edges_iter(exp, 'weight')])
         totexp[exp] = tx
         avgexp = np.mean(tx)
    nx.set_node_attributes(G, 'totexp', totexp)

    # Use the results later for the node's size in the graph
    node_size = [float(G.node[v]['totexp']) / avgexp for v in G]

##### Visualization of the scrap aluminum network

NetworkX works well with matplotlib to produce the spring layout visualization. It is another rat’s nest, but you may notice a different color on one of the medium-sized nodes.

###### Create graph using NetworkX and matplotlib

In \[6\]:

    # Visualization
    # Calculate position of each node in G using networkx spring layout
    pos = nx.spring_layout(G,k=30,iterations=8) 

    # Draw nodes
    nodes = nx.draw_networkx_nodes(G,pos, node_size=node_size, \
                                   node_color=node_color, alpha=0.5) 
    # Draw edges
    edges = nx.draw_networkx_edges(G, pos, edge_color='lightgray', \
                                   arrows=False, width=0.05,)

    # Add labels
    nx.draw_networkx_labels(G,pos,font_size=5)
    nodes.set_edgecolor('gray')

    # Add labels and title
    plt.text(0,-0.1, \
             'Node color is eigenvector centrality; \
             Node size is value of global exports', \
             fontsize=7)
    plt.title('Scrap Aluminum trade network, 2012', fontsize=12)

    # Bar with color scale for eigenvalues
    cbar = plt.colorbar(mappable=nodes, cax=None, ax=None, fraction=0.015, pad=0.04)
    cbar.set_clim(0, 1)

    # Plot options
    plt.margins(0,0)
    plt.axis('off')

    # Save as high quality png
    plt.savefig('760200.png', dpi=1000)

<div id="attachment_2536" class="wp-caption alignnone" style="width: 6010px">

<img src="/assets/blog/2016/06/760200.png" class="alignnone size-full wp-image-2536" aria-describedby="caption-attachment-2536" loading="lazy" width="6000" height="4000" alt="760200" />

China (CHN) is influential to scrap aluminum trade in 2012. Data source: UN Comtrade

</div>

##### Central players on the demand side: scrap aluminum and bluefin tuna

The graph above shows plenty of large exporters (the large nodes) of scrap aluminum in 2012, including the US, Hong Kong (HKG), and Germany (DEU). The *demand* of one country in the network, however, actually dominates the market. In 2012, the booming Chinese economy was purchasing large quantities of industrial metals, including scrap metals. The surge in demand from China was enough to cause global price increases and lead to increased levels of recycling. Since 2012, however, Chinese imports of scrap aluminum <a href="https://www.tradingeconomics.com/china/imports-of-scrap-aluminum" target="_blank" rel="noopener noreferrer">have nearly halved</a>, as has the <a href="https://www.tradingeconomics.com/commodity/aluminum" target="_blank" rel="noopener noreferrer">market price of aluminum</a>. The recent boom-and-bust cycle in scrap aluminum prices has a single country of origin but global ripples; the downturn generates domestic consequences for the large exporters and reduces the financial incentives for recycling.

The central influence of China in the 2012 scrap aluminum trade network is captured by its high eigenvector centrality score (node color in the graph above). We can also easily infer the out sized influence of China from a more simple measure–the high value of its imports relative to other countries. Centrality metrics, of which there are many, often prove useful in nuanced cases.

<div id="attachment_2543" class="wp-caption alignnone" style="width: 10010px">

<img src="/assets/blog/2016/06/760200_cent.png" class="alignnone size-full wp-image-2543" aria-describedby="caption-attachment-2543" loading="lazy" width="10000" height="4000" alt="760200_cent" />

Chinese demand for scrap aluminum dominates the market in 2012. Data source: UN Comtrade

</div>

Another example of a central influence on a trade network can be found in Japanese demand for bluefin tuna. As shown below, Japan has very high eigenvector centrality for imports of this key ingredient in many sushi dishes.

<img src="/assets/blog/2016/06/0303461.png" class="alignnone size-full wp-image-2555" loading="lazy" width="6000" height="4000" alt="030346" />

Australia (AUS) dominates bluefin tuna exports, but by eigenvector import centrality Japan (JPN) is the influential player in the market. The first Tokyo tuna auction of 2013 saw one fish fetch a <a href="https://dotearth.blogs.nytimes.com/2013/01/04/bluefin-tuna-poised-for-new-record-sale-in-tokyo-auction-more-pressure-at-sea/?_r=0" target="_blank" rel="noopener noreferrer">record 1.76 million USD</a>. Indeed in 2012 Japan imported more than 100 times as much bluefin tuna as the second largest importer, Korea.

Like scrap aluminum, the story here follows the familiar boom-and-bust cycle; prices for bluefin tuna have returned to lower levels since 2012. The structure of the trade network, with one central player, introduces a higher level of price volatility. During a downturn in prices, this transmits financial consequences to fishermen throughout the world.

##### Supply-side influential players: large aircraft production

Trade network analysis can also help to identify influential exporters of goods. Cases that come to mind are rare earth minerals found only in certain countries, or large and complex transportation equipment. Commercial aircraft manufacturers, for example, are limited (unfortunately this may have more to do with subsidies than limited supply of technological prowess). Very large aircraft production is dominated by two firms: <a href="https://www.airbus.com/company/aircraft-manufacture/how-is-an-aircraft-built/production/" target="_blank" rel="noopener noreferrer">Airbus</a>, with production sites primarily in France and Germany, and U.S. competitor, <a href="https://www.boeing.com/" target="_blank" rel="noopener noreferrer">Boeing</a>.

Instead of using eigenvector centrality to measure the influence of each exporting country in the large aircraft global trade network, let’s use a more simple method called **<a href="https://networkx.github.io/documentation/networkx-1.10/reference/generated/networkx.algorithms.centrality.out_degree_centrality.html#networkx.algorithms.centrality.out_degree_centrality" target="_blank" rel="noopener noreferrer">outdegree centrality</a>**. We compute outdegree centrality for each country, <embed src="/assets/blog/latex.php" class="latex" />, as its number of outgoing (exporting) connections, <embed src="/assets/blog/latex.php" class="latex" />, divided by the total number of possible importers, <embed src="/assets/blog/latex.php" class="latex" />:

<embed src="/assets/blog/latex.php" class="latex" />.

You can think of this measure as the share of importers that are serviced by each exporter. Nodes with a high outdegree centrality are considered influential exporters in the network.

###### Calculate outdegree centrality

In \[7\]:

    oc = nx.out_degree_centrality(G) # replaces ec in the above

<div id="attachment_2582" class="wp-caption alignnone" style="width: 6010px">

<img src="/assets/blog/2016/06/8802401.png" class="alignnone size-full wp-image-2582" aria-describedby="caption-attachment-2582" loading="lazy" width="6000" height="4000" alt="880240" />

France, Germany, and the US dominate exports of large aircraft. Data source: UN Comtrade

</div>

As expected, France, Germany, and the U.S. receive high outdegree centrality scores. There simply aren’t many alternative countries from which to buy your large aircraft. Beyond lack of choice for buyers, central exporters in a trade network may introduce (or represent) vulnerability and barriers to competition.

<div id="attachment_2598" class="wp-caption alignnone" style="width: 1010px">

<img src="/assets/blog/2016/06/880240_cent1.png" class="alignnone size-full wp-image-2598" aria-describedby="caption-attachment-2598" loading="lazy" width="1000" height="400" alt="880240_cent" />

Large aircraft suppliers are limited. Data for 2012, source: UN Comtrade

</div>

##### Network structure and (preventing) domestic consequences

Global trade is increasingly complex. Open economies are vulnerable to supply and demand shocks from the other countries in their trade network. The structure of the trade network itself determines in part the level of vulnerability and how and where supply and demand shocks may be transmitted. Certain trade networks, such as those for scrap aluminum or bluefin tuna, face dominant consumers and additional price volatility. Networks can also be subject to supply-side market structure issues, such as the virtual duopoly with very large aircraft.

Hindsight makes bubbles more visible; we easily find the previously missed warning signs once we know where to look. Decision makers aim for early detection of vulnerabilities, but face a geographically growing set of possible sources. Network analysis tools, such as centrality, can be applied to existing sets of complex bilateral trade data to provide new insight in the search for today’s warning signs. Such nontraditional tools may prove increasingly useful in a world where an individual is not capable of building a toaster from scratch, yet they sell down the street for $11.99.

##### Additional resources and reading

###### For fun:

[The Toaster Project](https://www.thetoasterproject.org/page2.htm)

###### Some references and further reading on networks and graph theory:

<a href="https://www.cs.cornell.edu/home/kleinber/networks-book/" target="_blank" rel="noopener noreferrer">Easley and Kleinberg (2010) Networks, Crowds, and Markets: Reasoning about a Highly Connected World</a>

<a href="https://press.princeton.edu/titles/8767.html" target="_blank" rel="noopener noreferrer">Jackson (2010) Social and Economic Networks</a>

###### Reading on trade and trade networks:

<a href="https://ideas.repec.org/p/cii/cepidt/2013-24.html" target="_blank" rel="noopener noreferrer">De Benedictis (2013) Network Analysis of World Trade using the BACI-CEPII dataset</a>

<a href="https://www.nber.org/papers/w11040" target="_blank" rel="noopener noreferrer">Feenstra (2005) World Trade Flows</a>

<a href="https://www.jstor.org/stable/40241006?seq=1#page_scan_tab_contents" target="_blank" rel="noopener noreferrer">Nemeth (1985) International Trade and World-System Structure: A Multiple Network Analysis</a>

###### Trade data source:

<a href="https://wits.worldbank.org/" target="_blank" rel="noopener noreferrer">World Integrated Trade Solution (WITS)</a>

###### Some python related resources:

<a href="https://www.continuum.io/downloads" target="_blank" rel="noopener noreferrer">Anaconda distribution for python</a>

<a href="https://networkx.github.io/" target="_blank" rel="noopener noreferrer">NetworkX</a>

<a href="https://computsimu.blogspot.com/2014/01/networks-1-scraping-data-visualization.html" target="_blank" rel="noopener noreferrer">ComputSimu: Networks 1: Scraping + Data visualization + Graph stats</a> (more useful code here)
