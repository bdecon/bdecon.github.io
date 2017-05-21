var margin = {top: 20, right: 5, bottom: 20, left: 5},
    width = 340 - margin.left - margin.right,
    height = 230 - margin.top - margin.bottom;

var parseDate = d3.timeParse("%Y-%m-%d");

var x = d3.scaleTime()
  .range([0, width]);

var y = d3.scaleLinear()
  .range([height, 0]);

var xAxis = d3.axisBottom(x);

var yAxis = d3.axisLeft(y);

var line = d3.line()
  .x(function (d) { return x(d.date); })
  .y(function (d) { return y(d.value); });

var svg = d3.select(".linechart").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")")

d3.csv("d3/d3_cpi_line.csv", function (error, data) {
  if (error) throw error;

    data.forEach(function (d) {
      d.date = parseDate(d.DATE);
      d.value = +d.CPIAUCSL;
  });

  x.domain(d3.extent(data, function(d) { return d.date }));
  y.domain(d3.extent(data, function(d) { return d.value }));

  svg.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(xAxis);

  svg.append("g")
    .attr("class", "y axis")
    .call(yAxis)
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 6)
    .attr("dy", ".71em")
    .style("text-anchor", "end")
    .text("12-month % change");

  svg.append("path")
    .datum(data)
    .attr("class", "line")
    .attr("d", line);

});
