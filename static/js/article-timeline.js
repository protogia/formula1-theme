/*
 * Time-sorted "lollipop" timeline for article-list pages (blog, projects,
 * category term pages), built on Plotly (already used for in-article
 * charts, so no extra dependency). Each article is a bubble on a date
 * axis, sized by word count, with a stem connecting it to a zero-line.
 * Click a bubble -> navigate to the article.
 */
(function () {
  const container = document.getElementById("article-timeline");
  const dataEl = document.getElementById("timeline-data");
  if (!container || !dataEl) return;

  let items = [];
  try {
    items = JSON.parse(dataEl.textContent || "[]");
  } catch (e) {
    console.warn("article-timeline: could not parse timeline data", e);
  }
  if (!items.length) return;

  function themeColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  const colors = {
    node: themeColor("--h1", "#D93A3A"),
    edge: themeColor("--h2", "#a09f93"),
    text: themeColor("--text", "#FFFFFF"),
    stroke: themeColor("--bg", "#4A2626"),
    accent: themeColor("--accent", "#F2C94C"),
  };

  function truncate(s, n) {
    if (!s || s.length <= n) return s || "";
    return s.slice(0, n - 1).trimEnd() + "…";
  }

  // Alternate above/below the zero-line, cycling through a couple of
  // stem lengths, so consecutive articles don't collide vertically.
  const TIERS = [1, -1, 1.8, -1.8];
  const heights = items.map((_, i) => TIERS[i % TIERS.length]);

  const words = items.map((it) => it.words || 1);
  const minWords = Math.min.apply(null, words);
  const maxWords = Math.max.apply(null, words);
  function sizeFor(w) {
    if (maxWords === minWords) return 26;
    const t = (w - minWords) / (maxWords - minWords);
    return 14 + t * 30;
  }

  const stemX = [];
  const stemY = [];
  items.forEach((it, i) => {
    stemX.push(it.date, it.date, null);
    stemY.push(0, heights[i], null);
  });

  const stems = {
    x: stemX,
    y: stemY,
    mode: "lines",
    line: { color: colors.edge, width: 1.5 },
    hoverinfo: "skip",
    showlegend: false,
  };

  const bubbles = {
    x: items.map((it) => it.date),
    y: heights,
    mode: "markers+text",
    text: items.map((it) => truncate(it.title, 30)),
    textposition: heights.map((h) => (h >= 0 ? "top center" : "bottom center")),
    textfont: { family: "Formula1, sans-serif", color: colors.text, size: 12 },
    hovertext: items.map(
      (it) => it.title + "<br>" + it.date + " · " + (it.words || 0) + " words"
    ),
    hoverinfo: "text",
    customdata: items.map((it) => it.url),
    marker: {
      size: items.map((it) => sizeFor(it.words)),
      sizemode: "diameter",
      color: colors.node,
      line: { color: colors.stroke, width: 1.5 },
    },
    showlegend: false,
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Formula1, sans-serif", color: colors.text },
    margin: { l: 20, r: 20, t: 40, b: 40 },
    xaxis: {
      type: "date",
      showgrid: false,
      zeroline: false,
      color: colors.edge,
    },
    yaxis: {
      visible: false,
      range: [-2.6, 2.6],
      fixedrange: true,
      showgrid: false,
      zeroline: false,
    },
    hoverlabel: {
      bgcolor: colors.stroke,
      bordercolor: colors.edge,
      font: { color: colors.text, family: "Formula1, sans-serif" },
    },
    shapes: [
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: 0,
        y1: 0,
        line: { color: colors.edge, width: 1, dash: "dot" },
      },
    ],
    showlegend: false,
  };

  const config = { displaylogo: false, responsive: true };

  function render() {
    if (typeof Plotly === "undefined") {
      setTimeout(render, 100);
      return;
    }
    Plotly.newPlot(container, [stems, bubbles], layout, config).then((gd) => {
      gd.on("plotly_click", (evt) => {
        const pt = evt.points && evt.points[0];
        if (pt && pt.customdata) window.location.href = pt.customdata;
      });
      gd.on("plotly_hover", (evt) => {
        const pt = evt.points && evt.points[0];
        container.style.cursor = pt && pt.customdata ? "pointer" : "default";
      });
      gd.on("plotly_unhover", () => {
        container.style.cursor = "default";
      });
    });
  }

  if (document.readyState === "complete") {
    render();
  } else {
    window.addEventListener("load", render);
  }
})();
