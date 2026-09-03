/*
 * Obsidian-style force-directed network graph for the homepage.
 * Nodes = categories taxonomy (server-rendered into #graph-data as JSON),
 * plus one synthetic, non-clickable hub node at the center.
 * No external dependency: a small hand-rolled force simulation
 * (repulsion between all nodes + spring-to-hub) settles over a couple
 * of seconds, then stays interactive via drag / click / hover.
 */
(function () {
  const svg = document.getElementById("network-graph");
  const dataEl = document.getElementById("graph-data");
  if (!svg || !dataEl) return;

  let categories = [];
  try {
    categories = JSON.parse(dataEl.textContent || "[]");
  } catch (e) {
    console.warn("network-graph: could not parse graph data", e);
  }
  if (!categories.length) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const container = svg.parentElement;
  const hubLabel = svg.dataset.hubLabel || "";

  // ---- theme colors, read live so weekly css-rotator palettes just work ----
  function themeColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  const colors = {
    node: themeColor("--h1", "#D93A3A"),
    hub: themeColor("--accent", "#F2C94C"),
    edge: themeColor("--h2", "#a09f93"),
    text: themeColor("--text", "#FFFFFF"),
    stroke: themeColor("--bg", "#4A2626"),
  };

  // ---- node model ----
  const counts = categories.map((c) => c.count || 1);
  const minCount = Math.min.apply(null, counts);
  const maxCount = Math.max.apply(null, counts);
  const minR = 20, maxR = 58, hubR = 40;

  // Linear scale across the actual min/max post-count range, so a
  // category with more articles reads as a visibly bigger bubble
  // (sqrt-scaling compressed small integer counts too close together).
  function radiusFor(count) {
    if (maxCount === minCount) return (minR + maxR) / 2;
    const t = (count - minCount) / (maxCount - minCount);
    return minR + (maxR - minR) * t;
  }

  const rect = container.getBoundingClientRect();
  let W = Math.max(rect.width, 320);
  let H = Math.max(rect.height, 320);
  const cx = W / 2, cy = H / 2;

  const hub = {
    id: "__hub__",
    label: hubLabel,
    url: null,
    r: hubR,
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    fixed: true,
  };

  const nodes = categories.map((c, i) => {
    const angle = (i / categories.length) * Math.PI * 2;
    const seedDist = 130 + Math.random() * 20;
    return {
      id: "cat-" + i,
      label: c.label,
      url: c.url,
      count: c.count,
      r: radiusFor(c.count || 1),
      x: cx + Math.cos(angle) * seedDist,
      y: cy + Math.sin(angle) * seedDist,
      vx: 0,
      vy: 0,
      fixed: false,
    };
  });

  const allNodes = [hub].concat(nodes);
  const edges = nodes.map((n) => ({ a: hub, b: n }));

  // ---- SVG scaffolding ----
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const edgeLayer = document.createElementNS(svgNS, "g");
  const nodeLayer = document.createElementNS(svgNS, "g");
  svg.appendChild(edgeLayer);
  svg.appendChild(nodeLayer);

  const edgeEls = edges.map((e) => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("stroke", colors.edge);
    line.setAttribute("stroke-opacity", "0.35");
    line.setAttribute("stroke-width", "1.5");
    edgeLayer.appendChild(line);
    return line;
  });

  function makeNodeEl(node, isHub) {
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", "graph-node" + (isHub ? " graph-node-hub" : ""));

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("r", node.r);
    circle.setAttribute("fill", isHub ? colors.hub : colors.node);
    circle.setAttribute("stroke", colors.stroke);
    circle.setAttribute("stroke-width", "2");
    g.appendChild(circle);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("y", node.r + 16);
    label.setAttribute("fill", colors.text);
    label.setAttribute("font-family", "Formula1, sans-serif");
    label.setAttribute("font-style", "italic");
    label.setAttribute("font-size", isHub ? "14" : "12");
    label.textContent = node.label;
    g.appendChild(label);

    if (!isHub) {
      g.style.cursor = "pointer";
      g.addEventListener("mouseenter", () => circle.setAttribute("fill", colors.hub));
      g.addEventListener("mouseleave", () => circle.setAttribute("fill", colors.node));
      attachDrag(g, node);
    }

    nodeLayer.appendChild(g);
    return { g, circle, label };
  }

  const nodeEls = new Map();
  nodeEls.set(hub, makeNodeEl(hub, true));
  nodes.forEach((n) => nodeEls.set(n, makeNodeEl(n, false)));

  // ---- drag + click ----
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
      node.x = clamp(node.x + dx, node.r, W - node.r);
      node.y = clamp(node.y + dy, node.r, H - node.r - LABEL_PAD);
    });

    function endDrag(ev) {
      if (!dragging) return;
      dragging = false;
      node.fixed = false;
      if (moved < 6 && node.url) {
        window.location.href = node.url;
      }
    }
    g.addEventListener("pointerup", endDrag);
    g.addEventListener("pointercancel", endDrag);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // ---- simulation ----
  const REPULSION = 12000;
  const SPRING = 0.02;
  const SPRING_LEN_BASE = 150;
  const DAMPING = 0.85;
  const MAX_TICKS = 260;
  // reserve room below each node so its label never gets clipped by the svg edge
  const LABEL_PAD = 34;

  let tickCount = 0;
  let rafId = null;

  function tick() {
    // repulsion between every pair
    for (let i = 0; i < allNodes.length; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const a = allNodes[i], b = allNodes[j];
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

    // springs pulling category nodes toward the hub
    edges.forEach(({ a, b }) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetLen = SPRING_LEN_BASE + a.r + b.r;
      const diff = dist - targetLen;
      const fx = (dx / dist) * diff * SPRING;
      const fy = (dy / dist) * diff * SPRING;
      if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
    });

    // integrate
    allNodes.forEach((n) => {
      if (n.fixed) return;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x = clamp(n.x + n.vx, n.r, W - n.r);
      n.y = clamp(n.y + n.vy, n.r, H - n.r - LABEL_PAD);
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

  render();
  restartSimulation();

  // ---- responsive resize ----
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const r = container.getBoundingClientRect();
      W = Math.max(r.width, 320);
      H = Math.max(r.height, 320);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      allNodes.forEach((n) => {
        n.x = clamp(n.x, n.r, W - n.r);
        n.y = clamp(n.y, n.r, H - n.r - LABEL_PAD);
      });
      render();
    }, 150);
  });
})();
