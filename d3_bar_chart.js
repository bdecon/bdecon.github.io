var margin = {top: 10, right: 30, bottom: 5, left: 70},
    width = 200,
    height = 220,
    shift = 10,
    numberOfTicks = 8,
    fig_height = height - margin.top - margin.bottom;

  d3.csv("mydata.csv", function (data) {

    var x = d3.scaleLinear()
            .domain(d3.extent(data, function(d) { return +d.age; }))
            .range([0, width]);

    var y_spacing = fig_height / data.length;

    var canvas = d3.select("#chart").append("svg")
      .attr("width", width + margin.left + margin.right + 10)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    canvas.selectAll("rect")
      .data(data)
      .enter()
        .append("rect")
        .attr("width", function (d) { return Math.abs(x(d.age) - x(0)); })
        .attr("height", y_spacing - 10)
        .attr("x", function (d) { return x(Math.min(0, d.age)); })
        .attr("y", function (d, i) { return i * y_spacing; })
        .attr("fill", "darkblue")
        .on("mouseover", function() {
        d3.select(this)
          .attr("fill", "orangered");
        })
        .on("mouseout", function() {
        d3.select(this)
          .attr("fill", "darkblue");
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
        .attr("y", function (d, i) { return i * y_spacing + 12; })
        .attr("x", shift - 35)
        .text(function (d) { return d.name; });

    canvas.selectAll("text.value_label")
      .data(data)
      .enter().append("text")
        .attr("class", "value_label")
        .text(function(d) {return d.age;})
        .attr("text-anchor", "left")
        .attr("x", function(d, i) {
            if (d.age <= 0) {
                console.log(d.age);
                return  x(Math.min(0, d.age)) + shift - 15;
            }
            else {return  x(Math.min(0, d.age)) + Math.abs(x(d.age) - x(0)) + shift + 1;}
        })
        .attr("y", function (d, i) { return i * y_spacing + 12; })
        .attr("font-family", "sans-serif")
        .attr("font-size", "9px")
        .attr("fill", "black");

   canvas.append("g")
      .attr("transform", "translate(" + shift + "," + fig_height + ")")
      .attr("class", "x axis")
      .call(d3.axisBottom(x).ticks(numberOfTicks));

   canvas.append("line")
    .attr("x1", x(0))
    .attr("y1", -10)
    .attr("x2", x(0))
    .attr("y2", fig_height)
    .style("stroke-width", 2)
    .style("stroke", "gray")
    .style("fill", "none")
    .attr("transform", "translate(" + shift + ", 0)");

  });
