var margin = {top: 5, right: 5, bottom: 20, left: 20},
    width = 360 - margin.left - margin.right,
    height = 200 - margin.top - margin.bottom;

var parseDate = d3.timeParse("%Y-%m-%d");

var x = d3.scaleTime()
  .range([10, width - 10]);

var y = d3.scaleLinear()
  .range([height - 10, 10]);

var xAxis = d3.axisBottom(x).ticks(5);

var yAxis = d3.axisLeft(y).ticks(6);

var line = d3.line()
  .x(function (d) { return x(d.date); })
  .y(function (d) { return y(d.value); });

  var line2 = d3.line()
    .x(function (d) { return x(d.date); })
    .y(function (d) { return y(d.value2); });

var svg = d3.select(".linechart").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")")

d3.csv("d3/cpi.csv", function (error, data) {
  if (error) throw error;

    data.forEach(function (d) {
      d.date = parseDate(d.DATE);
      d.value = +d.ALL;
      d.value2 = +d.CORE;
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

  svg.append("line")
   .attr("x1", 0)
   .attr("y1", y(2))
   .attr("x2", width - 5)
   .attr("y2", y(2))
   .style("stroke-width", 3)
   .style("stroke", "lightgray")
   .style("fill", "none");

   svg.append("line")
    .attr("x1", 0)
    .attr("y1", y(2))
    .attr("x2", 9)
    .attr("y2", y(0.9))
    .style("stroke-width", 1)
    .style("stroke", "gray")
    .style("fill", "none");

   svg.append("text").attr("y", y(4.5)).attr("x", 90).attr("class", "cpi_all").text("All-items");
   svg.append("text").attr("y", y(-0.1)).attr("x", 140).attr("class", "cpi_core").text("Core");
   svg.append("text").attr("y", y(0.8)).attr("x", 10).attr("class", "myLabel").text("Fed 2% Target");

   svg.append("path")
     .datum(data)
     .attr("class", "line")
     .attr("d", line);

   svg.append("path")
      .datum(data)
      .attr("class", "line2")
      .attr("d", line2);
});
