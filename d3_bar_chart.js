var margin = {top: 8, right: 30, bottom: 3, left: 140},
    width = 180,
    height = 240,
    shift = 0,
    numberOfTicks = 5,
    fig_height = height - margin.top - margin.bottom,
    axis_loc = fig_height - 4
    bar_gap = 16;

  d3.csv("mydata.csv", function (data) {

    var x = d3.scaleLinear()
            .domain(d3.extent(data, function(d) { return + d.value2; }))
            .range([0, width]);

    var y_spacing = fig_height / data.length;

    var canvas = d3.select("#bar_chart").append("svg")
      .attr("width", width + margin.left + margin.right + 10)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    canvas.selectAll("rect.value_1")
      .data(data)
      .enter()
        .append("rect")
        .attr("class", "value_1")
        .attr("width", function (d) { return Math.abs(x(d.value) - x(0)); })
        .attr("height", y_spacing - bar_gap)
        .attr("x", function (d) { return x(Math.min(0, d.value)); })
        .attr("y", function (d, i) { return i * y_spacing; })
        .attr("fill", "darkblue")
        .on("mouseover", function() {
        d3.select(this)
          .attr("fill", "firebrick");
        })
        .on("mouseout", function() {
        d3.select(this)
          .attr("fill", "darkblue");
        })
        .attr("transform", "translate(" + shift + ", 0)");

    canvas.selectAll("rect.value_2")
      .data(data)
      .enter()
        .append("rect")
        .attr("class", "value_2")
        .attr("width", function (d) { return Math.abs(x(d.value2) - x(0)); })
        .attr("height", y_spacing - bar_gap)
        .attr("x", function (d) { return x(Math.min(0, d.value2)); })
        .attr("y", function (d, i) { return i * y_spacing + y_spacing - bar_gap; })
        .attr("fill", "deepskyblue")
        .on("mouseover", function() {
        d3.select(this)
          .attr("fill", "orangered");
        })
        .on("mouseout", function() {
        d3.select(this)
          .attr("fill", "deepskyblue");
        })
        .attr("transform", "translate(" + shift + ", 0)");

    canvas.selectAll("text.y_label")
      .data(data)
      .enter()
        .append("text")
        .attr("class", "y_label")
        .attr("fill", "black")
        .style("font-size", "12px")
        .attr("text-anchor", "end")
        .attr("y", function (d, i) { return i * y_spacing + 13; })
        .attr("x", shift - 25)
        .text(function (d) { return d.name; });

    canvas.selectAll("text.value_label")
      .data(data)
      .enter().append("text")
        .attr("class", "value_label")
        .text(function(d) {return d3.format(".1f")(d.value);})
        .attr("text-anchor", "left")
        .attr("x", function(d, i) {
            if (d.value <= 0) {
                console.log(d.value);
                return  x(Math.min(0, d.value)) + shift - 18;
            }
            else {return  x(Math.min(0, d.value)) + Math.abs(x(d.value) - x(0)) + shift + 1;}
        })
        .attr("y", function (d, i) { return i * y_spacing + 8; });

    canvas.selectAll("text.value_label2")
      .data(data)
      .enter().append("text")
        .attr("class", "value_label2")
        .text(function(d) {return d3.format(".1f")(d.value2);})
        .attr("text-anchor", "left")
        .attr("x", function(d, i) {
            if (d.value <= 0) {
                console.log(d.value2);
                return  x(Math.min(0, d.value2)) + shift - 18;
            }
            else {return  x(Math.min(0, d.value2)) + Math.abs(x(d.value2) - x(0)) + shift + 1;}
        })
        .attr("y", function (d, i) { return i * y_spacing + 8 + y_spacing - bar_gap; });

   canvas.append("g")
      .attr("transform", "translate(" + shift + "," + axis_loc + ")")
      .attr("class", "x axis")
      .call(d3.axisBottom(x).ticks(numberOfTicks));

   canvas.append("line")
    .attr("x1", x(0))
    .attr("y1", -3)
    .attr("x2", x(0))
    .attr("y2", fig_height)
    .style("stroke-width", 2)
    .style("stroke", "gray")
    .style("fill", "none")
    .attr("transform", "translate(" + shift + ", 0)");

    canvas.append("rect")
      .attr("x", width - 50)
      .attr("y", height - 62)
      .attr("height", y_spacing - bar_gap)
      .attr("width", 15)
      .attr("fill", "deepskyblue");

    canvas.append("rect")
      .attr("x", width - 50)
      .attr("y", height - 75)
      .attr("height", y_spacing - bar_gap)
      .attr("width", 15)
      .attr("fill", "darkblue");

      canvas.append("text")
        .text("April 2017")
        .attr("x", width - 32)
        .attr("y", height - 68)
        .attr("font-family", "sans-serif")
        .attr("font-size", "9px")
        .attr("fill", "black")

      canvas.append("text")
        .text("March 2017")
        .attr("x", width - 32)
        .attr("y", height - 55)
        .attr("font-family", "sans-serif")
        .attr("font-size", "9px")
        .attr("fill", "black");

  });
