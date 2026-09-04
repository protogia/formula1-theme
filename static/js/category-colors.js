/*
 * Shared, deterministic category -> color mapping, used by both the
 * network graph and the timeline charts so a category reads as the same
 * color everywhere on the site. Derived once from the sitewide
 * #site-articles-data blob (see head.html) so the color for a given
 * category name is stable no matter which page renders it.
 */
(function () {
  function themeColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function loadNames() {
    const el = document.getElementById("site-articles-data");
    let items = [];
    if (el) {
      try {
        items = JSON.parse(el.textContent || "[]");
      } catch (e) {
        console.warn("category-colors: could not parse site-articles-data", e);
      }
    }
    const set = new Set();
    items.forEach((it) => (it.categories || []).forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }

  const names = loadNames();

  function hue(name) {
    const i = names.indexOf(name);
    const idx = i < 0 ? 0 : i;
    // golden-angle increment spreads hues evenly without manual tuning
    return (idx * 137.508) % 360;
  }

  window.CategoryColors = {
    names: names,
    base: function (name) {
      return "hsl(" + hue(name).toFixed(1) + ", 58%, 50%)";
    },
    bright: function (name) {
      return "hsl(" + hue(name).toFixed(1) + ", 72%, 62%)";
    },
    grey: function () {
      return themeColor("--h2", "#a09f93");
    },
  };
})();
