/*
 * Category co-occurrence network graph. Nodes = categories tallied from the
 * sitewide #site-articles-data blob (see head.html); an edge connects two
 * categories whenever some article carries both. No external dependency: a
 * small hand-rolled force simulation (repulsion + edge springs + a gentle
 * center pull) settles over a couple of seconds, then stays interactive via
 * drag / hover / click.
 *
 * Three usage modes, chosen per <svg data-mode="...">:
 *   - "interactive": click toggles a single category as the active filter
 *     (bright vs. everything else grey) and broadcasts a `categoryfilter`
 *     CustomEvent on window so a sibling timeline chart can follow along.
 *     Click again (or click empty canvas) clears the filter.
 *   - "highlight": svg[data-highlight] pre-selects a *set* of categories as
 *     bright, rest grey. Same click-to-select behavior remains available for
 *     local exploration, it just has no sibling chart to notify.
 *   - "static": a plain overview embed (e.g. the Q&A page) - every category
 *     shows its normal color, dragging still works, but clicking doesn't
 *     enable/disable anything.
 */
(function () {
  const graphs = document.querySelectorAll("svg[data-mode]");
  if (!graphs.length) return;

  const dataEl = document.getElementById("site-articles-data");
  let items = [];
  try {
    items = JSON.parse((dataEl && dataEl.textContent) || "[]");
  } catch (e) {
    console.warn("network-graph: could not parse site-articles-data", e);
  }
  if (!items.length) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const Colors = window.CategoryColors || {
    base: () => "#D93A3A",
    bright: () => "#F2C94C",
    grey: () => "#a09f93",
  };

  function themeColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  // same background-colored ring the lollipop chart uses around its bubbles,
  // so a shared category hue reads as the same color in both charts instead
  // of being muddied by a grey outline here but not there
  const bubbleStroke = themeColor("--bg", "#4A2626");

  // ---- tally categories + co-occurrence edges from the shared dataset ----
  const counts = new Map();
  const edgeWeights = new Map(); // "a|b" (sorted) -> weight
  items.forEach((it) => {
    const cats = it.categories || [];
    cats.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const key = [cats[i], cats[j]].sort().join("|");
        edgeWeights.set(key, (edgeWeights.get(key) || 0) + 1);
      }
    }
  });
  const categoryNames = Array.from(counts.keys());
  if (!categoryNames.length) return;

  graphs.forEach((svg) => initGraph(svg));

  function initGraph(svg) {
    const container = svg.parentElement;
    const mode = svg.dataset.mode || "interactive";
    const highlightPreset = (svg.dataset.highlight || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // reserve room around each node so its label (which can be wider/taller
    // than the bubble itself) never gets clipped by the svg edge
    const LABEL_PAD_BOTTOM = 34;

    let W, H, cx, cy;
    function measureContainer() {
      const rect = container.getBoundingClientRect();
      W = Math.max(rect.width, 240);
      H = Math.max(rect.height, 240);
      cx = W / 2;
      cy = H / 2;
    }
    measureContainer();

    const nodeCounts = categoryNames.map((n) => counts.get(n));
    const minCount = Math.min.apply(null, nodeCounts);
    const maxCount = Math.max.apply(null, nodeCounts);
    const minR = 10, maxR = 28;
    function radiusFor(count) {
      if (maxCount === minCount) return (minR + maxR) / 2;
      return minR + (maxR - minR) * ((count - minCount) / (maxCount - minCount));
    }

    const nodes = categoryNames.map((name, i) => {
      const angle = (i / categoryNames.length) * Math.PI * 2;
      const seedDist = Math.min(W, H) * 0.28 + Math.random() * 20;
      return {
        name: name,
        r: radiusFor(counts.get(name)),
        marginX: radiusFor(counts.get(name)), // refined once the label is measured
        x: cx + Math.cos(angle) * seedDist,
        y: cy + Math.sin(angle) * seedDist,
        vx: 0,
        vy: 0,
        fixed: false,
      };
    });
    const nodeByName = new Map(nodes.map((n) => [n.name, n]));

    const edges = [];
    edgeWeights.forEach((weight, key) => {
      const [a, b] = key.split("|");
      if (nodeByName.has(a) && nodeByName.has(b)) {
        edges.push({ a: nodeByName.get(a), b: nodeByName.get(b), weight: weight });
      }
    });

    let selected = highlightPreset.length ? new Set(highlightPreset) : null;

    // ---- scaffolding ----
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.innerHTML = "";

    const edgeLayer = document.createElementNS(svgNS, "g");
    const nodeLayer = document.createElementNS(svgNS, "g");
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);

    const edgeEls = edges.map((e) => {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("stroke", Colors.grey());
      line.setAttribute("stroke-width", String(1 + Math.min(e.weight, 4) * 0.6));
      line.setAttribute("stroke-opacity", String(0.25 + Math.min(e.weight, 4) * 0.1));
      edgeLayer.appendChild(line);
      return line;
    });

    const nodeEls = new Map();
    nodes.forEach((n) => nodeEls.set(n, makeNodeEl(n)));

    function nodeColor(n) {
      if (!selected) return Colors.base(n.name);
      return selected.has(n.name) ? Colors.bright(n.name) : Colors.grey();
    }

    function paintNodes() {
      nodes.forEach((n) => nodeEls.get(n).circle.setAttribute("fill", nodeColor(n)));
    }

    function makeNodeEl(node) {
      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("class", "graph-node");
      g.style.cursor = "pointer";

      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", node.r);
      circle.setAttribute("stroke", bubbleStroke);
      circle.setAttribute("stroke-width", "2");
      g.appendChild(circle);

      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("y", node.r + 16);
      label.setAttribute("font-family", "Formula1, sans-serif");
      label.setAttribute("font-style", "italic");
      label.setAttribute("font-size", "12");
      label.textContent = node.name;
      g.appendChild(label);

      g.addEventListener("mouseenter", () => circle.setAttribute("stroke-width", "3"));
      g.addEventListener("mouseleave", () => circle.setAttribute("stroke-width", "2"));
      attachDrag(g, node);

      nodeLayer.appendChild(g);

      // measure the actual label width so wide category names don't get
      // clipped by the svg edge; fall back to the radius if measuring fails
      // (e.g. a hidden container mid-layout)
      try {
        const bbox = label.getBBox();
        if (bbox && bbox.width) node.marginX = Math.max(node.r, bbox.width / 2 + 6);
      } catch (e) {
        /* keep the radius-based fallback */
      }

      return { g, circle, label };
    }

    // ---- drag + click-to-select ----
    function attachDrag(g, node) {
      let dragging = false;
      let moved = 0;
      let startX = 0, startY = 0;

      g.addEventListener("pointerdown", (ev) => {
        dragging = true;
        moved = 0;
        startX = ev.clientX;
        startY = ev.clientY;
        node.fixed = true;
        node.vx = 0;
        node.vy = 0;
        g.setPointerCapture(ev.pointerId);
        restartSimulation();
      });

      g.addEventListener("pointermove", (ev) => {
        if (!dragging) return;
        const scale = W / svg.getBoundingClientRect().width;
        const dx = (ev.clientX - startX) * scale;
        const dy = (ev.clientY - startY) * scale;
        moved += Math.abs(dx) + Math.abs(dy);
        startX = ev.clientX;
        startY = ev.clientY;
        node.x = clampX(node, node.x + dx);
        node.y = clampY(node, node.y + dy);
      });

      function endDrag() {
        if (!dragging) return;
        dragging = false;
        node.fixed = false;
        // "static" mode is a plain overview embed: dragging to explore is
        // still fine, but there's no enable/disable filtering to trigger
        if (moved < 6 && mode !== "static") toggleSelect(node.name);
      }
      g.addEventListener("pointerup", endDrag);
      g.addEventListener("pointercancel", endDrag);
    }

    function toggleSelect(name) {
      if (selected && selected.size === 1 && selected.has(name)) {
        selected = null;
      } else {
        selected = new Set([name]);
      }
      paintNodes();
      if (mode === "interactive") {
        window.dispatchEvent(
          new CustomEvent("categoryfilter", { detail: { category: selected ? name : null } })
        );
      }
    }

    // clicking empty canvas clears the filter
    svg.addEventListener("click", (ev) => {
      if (ev.target !== svg || !selected) return;
      selected = null;
      paintNodes();
      if (mode === "interactive") {
        window.dispatchEvent(new CustomEvent("categoryfilter", { detail: { category: null } }));
      }
    });

    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }

    // keep both the bubble AND its label fully inside the canvas; degrade
    // gracefully (fall back to the midpoint) if a container is so narrow/
    // short that the ideal margin would invert the range
    function clampX(node, v) {
      let margin = node.marginX;
      if (margin * 2 > W) margin = W / 2;
      return clamp(v, margin, W - margin);
    }
    function clampY(node, v) {
      let top = node.r;
      let bottom = node.r + LABEL_PAD_BOTTOM;
      if (top + bottom > H) {
        top = H / 2;
        bottom = H / 2;
      }
      return clamp(v, top, H - bottom);
    }

    // labels are now measured; make sure the seeded start positions respect
    // the same bounds before the first paint
    nodes.forEach((n) => {
      n.x = clampX(n, n.x);
      n.y = clampY(n, n.y);
    });

    // ---- simulation ---- (tuned for the compact panel size: smaller
    // repulsion/spring-length than a full-page graph would use)
    const REPULSION = 6000;
    const SPRING = 0.02;
    const SPRING_LEN_BASE = 75;
    const GRAVITY = 0.0018;
    const DAMPING = 0.85;
    const MAX_TICKS = 260;

    let tickCount = 0;
    let rafId = null;

    function tick() {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let distSq = dx * dx + dy * dy;
          if (distSq < 1) distSq = 1;
          const dist = Math.sqrt(distSq);
          const force = REPULSION / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!a.fixed) { a.vx -= fx; a.vy -= fy; }
          if (!b.fixed) { b.vx += fx; b.vy += fy; }
        }
      }

      edges.forEach(({ a, b }) => {
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetLen = SPRING_LEN_BASE + a.r + b.r;
        const diff = dist - targetLen;
        const fx = (dx / dist) * diff * SPRING;
        const fy = (dy / dist) * diff * SPRING;
        if (!a.fixed) { a.vx += fx; a.vy += fy; }
        if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
      });

      nodes.forEach((n) => {
        if (n.fixed) return;
        n.vx += (cx - n.x) * GRAVITY;
        n.vy += (cy - n.y) * GRAVITY;
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x = clampX(n, n.x + n.vx);
        n.y = clampY(n, n.y + n.vy);
      });

      render();

      tickCount++;
      if (tickCount < MAX_TICKS) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    }

    function restartSimulation() {
      tickCount = 0;
      if (!rafId) rafId = requestAnimationFrame(tick);
    }

    function render() {
      edgeEls.forEach((line, i) => {
        const { a, b } = edges[i];
        line.setAttribute("x1", a.x);
        line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x);
        line.setAttribute("y2", b.y);
      });
      nodeEls.forEach((els, node) => {
        els.g.setAttribute("transform", "translate(" + node.x + "," + node.y + ")");
      });
    }

    paintNodes();
    render();
    restartSimulation();

    // ---- responsive resize ----
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        measureContainer();
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        nodes.forEach((n) => {
          n.x = clampX(n, n.x);
          n.y = clampY(n, n.y);
        });
        render();
      }, 150);
    });
  }
})();
