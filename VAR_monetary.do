/* Dynamic correlations between monetary variables, prices, and output
	Brian Dew
	September 19, 2016
	
	Download the do file here: 
		http://www.bd-econ.com/VAR_monetary.do
	
	Basic idea: A vector autoregression (VAR) model is used to uncover dynamic
		correlations between monetary policy variables and prices and output.
		Since these variables affect each other, efforts to show causation are
		complicated. The VAR approach allows analysis of short-run relationships
		without the need to specify which variables are endogenous or exogenous.
		The consequence is that VAR models are a-theoretical, so they can be
		useful for predictions/forecasts but not for generating policy advice.
		After estimation of the VAR model, impulse response functions (IRFs) 
		show how a one unit shock to each variable corresponds to changes in
		each of the other variables. 
	
	Overview of steps:
	1.) Retrieve GDP, M2, Monetary Base, CPI, and Fed Funds rate data
	2.) Harmonize data and take natural log and first difference to make
		all series stationary. Save data to csv file and dta file.
	3.) Run Dickey Fuller unit root test to check whether series are stationary
	4.) Test for cointegration
	5.) Use VAR selection order criteria test to identify appropriate lag length
	6.) Run vector auto regression
	7.) Test for Granger causality
	8.) Generate impulse response function plots
	
	All five economic series retrieved from FRED with codes as follows: 
	   Real GDP:				GDPC1
	   M2 Money Supply: 		M2SL
	   Monetary Base:			BOGMBASE
	   Consumer Price Index:	CPIAUCSL
	   Federal Funds Rate:		FEDFUNDS
*/

	clear all
	set more off	
	cd C:\Working

* Retrieve and harmonize data
	local series GDPC1 M2SL BOGMBASE CPIAUCSL FEDFUNDS
	freduse `series'

	replace BOGMBASE = BOGMBASE / 1000     /* Monetary base to billions */
	drop if daten < date("19581231","YMD")
	drop if daten > date("20160601","YMD")
	gen qtr = qofd(daten)                  /* New variable, quarter, e.g. Q1 */ 
	collapse `series', by(qtr)             /* Convert all series to quarterly */
	format qtr %tq                         /* Date formatting */
	tsset qtr							   /* Set quarter as time series */

* Natural logarithm of all variables except fed funds rate (already in percent)
	local series_to_log GDPC1 M2SL BOGMBASE CPIAUCSL
	foreach s in `series_to_log' {
		gen ln_`s' = ln(`s')
	}
	
* Run unit root test to see if data are stationary
	local log_series ln_GDPC1 FEDFUNDS ln_M2SL ln_BOGMBASE ln_CPIAUCSL
	foreach s in `log_series' {
		dfuller `s', lags(8)
		return list
	}
	
* VAR lag length selection order criteria for cointegration test
	varsoc ln_BOGMBASE ln_M2SL FEDFUNDS ln_CPIAUCSL ln_GDPC1, maxlag(10)
	
* Johansen Test for cointegration
	vecrank ln_BOGMBASE ln_M2SL FEDFUNDS ln_CPIAUCSL ln_GDPC1, lags(8) ic
	
* Take first difference to make values stationary
	foreach s in `log_series' {
		gen d`s' = D.`s'
	}

* Run unit root test to check that differenced series are now stationary
	local diff_series dln_GDPC1 dFEDFUNDS dln_M2SL dln_BOGMBASE dln_CPIAUCSL
	foreach s in `diff_series' {
		dfuller `s', lags(8)
		return list
	}
	
* Save data to a csv file
	export delimited using "data.csv", replace	
* Save data as dta file
	save data, replace
	
* VAR lag length selection order criteria
	varsoc dln_BOGMBASE dln_M2SL dFEDFUNDS dln_CPIAUCSL dln_GDPC1, maxlag(10)

* VAR model (SOC suggest lag length of 5)
	irf set irf  /* set irf file to store results */
	var dln_BOGMBASE dln_M2SL dFEDFUNDS dln_CPIAUCSL dln_GDPC1, lag (1/5)
	irf create irf
* Wald Test / Granger Causality
	vargranger

* IRF Graph, one for each pair, to show dynamic correlation with error bands
* These can either be run one at a time and viewed, or adjusted to be saved.
	irf graph irf, impulse(dln_BOGMBASE) response(dln_M2SL)	
	irf graph irf, impulse(dln_BOGMBASE) response(dFEDFUNDS)	
	irf graph irf, impulse(dln_BOGMBASE) response(dln_CPIAUCSL)
	irf graph irf, impulse(dln_BOGMBASE) response(dln_GDPC1)
	
	irf graph irf, impulse(dln_M2SL) response(dln_BOGMBASE)
	irf graph irf, impulse(dln_M2SL) response(dFEDFUNDS)	
	irf graph irf, impulse(dln_M2SL) response(dln_CPIAUCSL)
	irf graph irf, impulse(dln_M2SL) response(dln_GDPC1)
	
	irf graph irf, impulse(dFEDFUNDS) response(dln_BOGMBASE)
	irf graph irf, impulse(dFEDFUNDS) response(dln_M2SL)	
	irf graph irf, impulse(dFEDFUNDS) response(dln_CPIAUCSL)
	irf graph irf, impulse(dFEDFUNDS) response(dln_GDPC1)
	
	irf graph irf, impulse(dln_CPIAUCSL) response(dln_BOGMBASE)
	irf graph irf, impulse(dln_CPIAUCSL) response(dln_M2SL)	
	irf graph irf, impulse(dln_CPIAUCSL) response(dFEDFUNDS)
	irf graph irf, impulse(dln_CPIAUCSL) response(dln_GDPC1)
	
	irf graph irf, impulse(dln_GDPC1) response(dln_BOGMBASE)
	irf graph irf, impulse(dln_GDPC1) response(dln_M2SL)	
	irf graph irf, impulse(dln_GDPC1) response(dln_CPIAUCSL)
	irf graph irf, impulse(dln_GDPC1) response(dFEDFUNDS)
