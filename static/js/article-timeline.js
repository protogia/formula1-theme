/*
 * Time-sorted "lollipop" timeline for article lists. Each article is a
 * bubble on a date axis, sized by word count, colored by its (first)
 * category via the shared CategoryColors module. Click a bubble -> navigate
 * to the article. Built on Plotly (already used for in-article charts, so
 * no extra dependency).
 *
 * Supports multiple independent instances per page via [data-timeline]
 * containers, each pointing at its own JSON script tag through
 * data-source (defaults to "timeline-data", the per-list-page dataset;
 * the homepage instance points at the sitewide "site-articles-data" blob
 * instead so it covers every article).
 *
 * When data-source is the sitewide blob, the container also listens for
 * `categoryfilter` events (dispatched by network-graph.js) and recolors to
 * match the selected category, so the homepage's two charts stay in sync.
 *
 * data-current-url marks one article (matched by its url) as "this one" -
 * used on the article page's mini timeline to point out where the article
 * being read sits in the full history: bigger bubble, brighter color, an
 * accent-colored ring, and it's excluded from click-to-navigate.
 */
(function () {
  const containers = document.querySelectorAll("[data-timeline]");
  if (!containers.length) return;

  const Colors = window.CategoryColors || {
    base: () => "#D93A3A",
    bright: () => "#F2C94C",
    grey: () => "#a09f93",
  };

  function themeColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function truncate(s, n) {
    if (!s || s.length <= n) return s || "";
    return s.slice(0, n - 1).trimEnd() + "…";
  }

  // shift a "YYYY-MM-DD" date string by whole months, for padding the
  // x-axis range a bit past the earliest/latest article
  function addMonths(dateStr, delta) {
    const d = new Date(dateStr + "T00:00:00");
    d.setMonth(d.getMonth() + delta);
    return d.toISOString().slice(0, 10);
  }

  containers.forEach((container) => initTimeline(container));

  function initTimeline(container) {
    const sourceId = container.dataset.source || "timeline-data";
    const dataEl = document.getElementById(sourceId);
    let items = [];
    try {
      items = JSON.parse((dataEl && dataEl.textContent) || "[]");
    } catch (e) {
      console.warn("article-timeline: could not parse " + sourceId, e);
    }
    if (!items.length) return;

    const edgeColor = themeColor("--h2", "#a09f93");
    const textColor = themeColor("--text", "#FFFFFF");
    const strokeColor = themeColor("--bg", "#4A2626");
    const accentColor = themeColor("--accent", "#F2C94C");

    const currentUrl = container.dataset.currentUrl || null;
    const isCurrent = items.map((it) => !!currentUrl && it.url === currentUrl);

    // frame the axis around this chart's own earliest/latest article, plus
    // a couple of months of breathing room either side, instead of letting
    // Plotly's default date autorange pick an arbitrary span
    const sortedDates = items.map((it) => it.date).sort();
    const xRange = [addMonths(sortedDates[0], -6), addMonths(sortedDates[sortedDates.length - 1], 6)];

    // Alternate above/below the zero-line, cycling through a couple of
    // stem lengths, so consecutive articles don't collide vertically.
    const TIERS = [1, -1, 1.6, -1.6];
    const heights = items.map((_, i) => TIERS[i % TIERS.length]);

    const words = items.map((it) => it.words || 1);
    const minWords = Math.min.apply(null, words);
    const maxWords = Math.max.apply(null, words);
    function sizeFor(w) {
      if (maxWords === minWords) return 26;
      const t = (w - minWords) / (maxWords - minWords);
      return 14 + t * 30;
    }

    function baseColorFor(it, current) {
      const cat = (it.categories || [])[0];
      if (!cat) return themeColor("--h1", "#D93A3A");
      // the current article stays at its normal, "enabled" category color
      // (never greyed) and gets bumped to the brighter tier to stand out
      return current ? Colors.bright(cat) : Colors.base(cat);
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
      line: { color: edgeColor, width: 1.5 },
      hoverinfo: "skip",
      showlegend: false,
    };

    const baseColors = items.map((it, i) => baseColorFor(it, isCurrent[i]));

    const bubbles = {
      x: items.map((it) => it.date),
      y: heights,
      mode: "markers+text",
      text: items.map((it) => truncate(it.title, 30)),
      textposition: heights.map((h) => (h >= 0 ? "top center" : "bottom center")),
      textfont: {
        family: "Formula1, sans-serif",
        color: items.map((it, i) => (isCurrent[i] ? accentColor : textColor)),
        size: items.map((it, i) => (isCurrent[i] ? 13 : 12)),
      },
      hovertext: items.map(
        (it, i) =>
          it.title +
          (isCurrent[i] ? " (this article)" : "") +
          "<br>" +
          it.date +
          " · " +
          (it.words || 0) +
          " words"
      ),
      hoverinfo: "text",
      // the current article isn't a click target (it's already the page you're on)
      customdata: items.map((it, i) => (isCurrent[i] ? null : it.url)),
      marker: {
        size: items.map((it, i) => sizeFor(it.words) * (isCurrent[i] ? 1.4 : 1)),
        sizemode: "diameter",
        color: baseColors.slice(),
        line: {
          color: items.map((it, i) => (isCurrent[i] ? accentColor : strokeColor)),
          width: items.map((it, i) => (isCurrent[i] ? 3 : 1.5)),
        },
      },
      showlegend: false,
      // the "current article" marker is bigger with a thicker ring than the
      // rest; without this it can get clipped right at the plot edge
      cliponaxis: false,
    };

    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Formula1, sans-serif", color: textColor },
      // generous top/bottom margin (in fixed pixels, unlike the yaxis range
      // below) so the top tier's stems + text labels never get clipped by
      // the plot edge, even in the compact chart heights used now
      // extra bottom room for the tickangle:-45 date labels below, which
      // take up more vertical space than horizontal ones would
      margin: { l: 20, r: 20, t: 50, b: 75 },
      xaxis: {
        type: "date",
        range: xRange,
        showgrid: false,
        zeroline: false,
        color: edgeColor,
        tickangle: -45,
      },
      yaxis: {
        visible: false,
        range: [-2.3, 2.3],
        fixedrange: true,
        showgrid: false,
        zeroline: false,
      },
      hoverlabel: {
        bgcolor: strokeColor,
        bordercolor: edgeColor,
        font: { color: textColor, family: "Formula1, sans-serif" },
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
          line: { color: edgeColor, width: 1, dash: "dot" },
        },
      ],
      showlegend: false,
      // click-drag pans the timeline (no lasso/box-select needed), mouse
      // wheel / pinch zooms into a date range (see config.scrollZoom below)
      dragmode: "pan",
    };

    // no modebar (it read as a stray menu bar above the chart); panning +
    // scroll-zoom along the date axis stay available without it
    const config = { displaylogo: false, responsive: true, displayModeBar: false, scrollZoom: true };

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

        // keep pan/zoom from wandering past the earliest/latest article
        // (+ the couple of months of padding baked into xRange)
        const boundMin = new Date(xRange[0]).getTime();
        const boundMax = new Date(xRange[1]).getTime();
        let clamping = false;
        gd.on("plotly_relayout", (evt) => {
          if (clamping) return;
          let x0 = evt["xaxis.range[0]"];
          let x1 = evt["xaxis.range[1]"];
          if (x0 === undefined && Array.isArray(evt["xaxis.range"])) {
            x0 = evt["xaxis.range"][0];
            x1 = evt["xaxis.range"][1];
          }
          if (x0 === undefined || x1 === undefined) return;

          let d0 = new Date(x0).getTime();
          let d1 = new Date(x1).getTime();
          const span = Math.min(d1 - d0, boundMax - boundMin);

          let newD0 = d0, newD1 = d1;
          if (newD0 < boundMin) { newD0 = boundMin; newD1 = boundMin + span; }
          if (newD1 > boundMax) { newD1 = boundMax; newD0 = boundMax - span; }

          if (newD0 !== d0 || newD1 !== d1) {
            clamping = true;
            Plotly.relayout(gd, {
              "xaxis.range[0]": new Date(newD0).toISOString(),
              "xaxis.range[1]": new Date(newD1).toISOString(),
            }).then(() => { clamping = false; });
          }
        });

        window.addEventListener("categoryfilter", (evt) => {
          const active = evt.detail && evt.detail.category;
          const colors = items.map((it, i) => {
            if (!active) return baseColors[i];
            const has = (it.categories || []).includes(active);
            return has ? Colors.bright(active) : Colors.grey();
          });
          Plotly.restyle(gd, { "marker.color": [colors] }, [1]);
        });
      });
    }

    if (document.readyState === "complete") {
      render();
    } else {
      window.addEventListener("load", render);
    }
  }
})();
