"use strict";
/* Real-Hermes-host probe for the compact Watch link's focus ring.
 *
 * Boots against a running dashboard (the clean profile's own server), opens the
 * Videos section, reaches the compact row's Watch link with a real Tab press,
 * and measures the PAINTED ring: the focused screenshot pixel against the
 * unfocused pixel at the same point, along all four sides. It also reports the
 * ring's own geometry against every clipping ancestor, so "painted" and
 * "clipped" are separate readings.
 *
 *   BASE=http://127.0.0.1:9229 node docs/receipts/post39/real_host_ring.js
 *   ... --dark     (emulateMedia colorScheme dark)
 */
const fs = require("fs");
const path = require("path");
const { loadNodeModule } = require("../../../tests/browser_net_harness");

const BASE = process.env.HACKERTUBE_HOST_BASE || "http://127.0.0.1:9229";
const OUT = __dirname;
const dark = process.argv.includes("--dark");

async function measureRing(ui, link, before, after, geometry) {
  const sides = await ui.evaluate(async ({ before, after, box, offset, thickness }) => {
    async function pixels(base64) {
      const image = new Image();
      image.src = "data:image/png;base64," + base64;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
    }
    const a = await pixels(before), b = await pixels(after);
    const spread = offset + thickness / 2;
    const lines = {
      left: [box.left - spread, box.top + 12, box.left - spread, box.bottom - 12],
      right: [box.right + spread, box.top + 12, box.right + spread, box.bottom - 12],
      top: [box.left + 12, box.top - spread, box.right - 12, box.top - spread],
      bottom: [box.left + 12, box.bottom + spread, box.right - 12, box.bottom + spread],
    };
    const channel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    const ratio = (fg, bg) => {
      const l1 = luminance(fg), l2 = luminance(bg);
      const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    };
    const out = {};
    for (const [side, [x1, y1, x2, y2]] of Object.entries(lines)) {
      let painted = 0, total = 0, min = Infinity, minAt = null;
      for (let y = Math.floor(y1); y <= Math.floor(y2); y++) {
        for (let x = Math.floor(x1); x <= Math.floor(x2); x++) {
          if (x < 0 || y < 0 || x >= a.width || y >= a.height) continue;
          total += 1;
          const i = 4 * (y * a.width + x);
          const surface = [a.data[i], a.data[i + 1], a.data[i + 2]];
          const ring = [b.data[i], b.data[i + 1], b.data[i + 2]];
          if ([0, 1, 2].some((c) => Math.abs(surface[c] - ring[c]) > 20)) painted += 1;
          const r = ratio(ring, surface);
          if (r < min) { min = r; minAt = { x, y, surface, ring }; }
        }
      }
      out[side] = { painted, total, min: Number.isFinite(min) ? Number(min.toFixed(3)) : null, minAt };
    }
    return out;
  }, {
    before: before.toString("base64"), after: after.toString("base64"),
    box: geometry.box, offset: geometry.outlineOffset, thickness: geometry.outlineWidth,
  });
  const spread = geometry.outlineWidth + geometry.outlineOffset;
  const cut = {};
  for (const side of Object.keys(sides)) {
    const span = side === "left" ? geometry.box.left - spread
      : side === "right" ? geometry.box.right + spread
      : side === "top" ? geometry.box.top - spread : geometry.box.bottom + spread;
    cut[side] = geometry.clippers.filter((c) => (side === "left" || side === "right" ? c.clipsX : c.clipsY)
      && (side === "left" ? span < c.left - 0.5
        : side === "right" ? span > c.right + 0.5
        : side === "top" ? span < c.top - 0.5 : span > c.bottom + 0.5)).map((c) => c.name);
  }
  return { sides, cut };
}

async function run(browser, width, scheme) {
  const ui = await browser.newPage({ viewport: { width, height: 1600 } });
  if (scheme === "dark") await ui.emulateMedia({ colorScheme: "dark" });
  try {
    await ui.goto(BASE + "/hackertube", { waitUntil: "networkidle" });
    await ui.waitForTimeout(1200);
    const details = ui.locator("details.ht-feed-controls");
    if (await details.count()) {
      if (!(await details.first().evaluate((el) => el.open))) {
        await details.first().locator(":scope > summary").click();
        await ui.waitForTimeout(200);
      }
    }
    const nav = ui.locator('a[href="#videos"]').first();
    if (await nav.count()) { await nav.click(); await ui.waitForTimeout(300); }
    const link = ui.locator("#videos .ht-compact .ht-youtube-icon").first();
    await link.waitFor();
    await ui.setViewportSize({ width, height: 1600 });
    await link.scrollIntoViewIfNeeded();
    await link.evaluate((el) => el.blur());
    await ui.waitForTimeout(120);
    const unfocused = await ui.screenshot();
    const theme = await ui.evaluate(() => {
      const root = document.querySelector(".hackertube");
      const host = getComputedStyle(document.documentElement);
      return {
        pageBackground: getComputedStyle(document.body).backgroundColor,
        ringToken: host.getPropertyValue("--color-ring").trim(),
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
      };
    });
    // Reach the link the way a keyboard user does: focus the row title, Tab.
    await ui.evaluate(() => {
      const title = document.querySelector("#videos .ht-compact .ht-title");
      title.setAttribute("tabindex", "-1");
      title.focus();
    });
    await ui.keyboard.press("Tab");
    const active = await link.evaluate((el) => document.activeElement === el);
    const geometry = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      const clippers = [];
      for (let node = el.parentElement; node; node = node.parentElement) {
        const s = getComputedStyle(node);
        const clipsX = s.overflowX !== "visible";
        const clipsY = s.overflowY !== "visible";
        if (clipsX || clipsY) {
          const r = node.getBoundingClientRect();
          clippers.push({
            name: (typeof node.className === "string" && node.className ? node.className : node.tagName)
              .replace(/\s+/g, ".").slice(0, 60),
            clipsX, clipsY,
            left: r.left + parseFloat(s.borderLeftWidth),
            top: r.top + parseFloat(s.borderTopWidth),
            right: r.right - parseFloat(s.borderRightWidth),
            bottom: r.bottom - parseFloat(s.borderBottomWidth),
          });
        }
      }
      const panel = el.closest(".ht-card");
      const panelBox = panel ? panel.getBoundingClientRect() : null;
      return {
        focused: document.activeElement === el,
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor,
        outlineWidth: parseFloat(style.outlineWidth),
        outlineOffset: parseFloat(style.outlineOffset),
        box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
        spread,
        card: panelBox ? { left: panelBox.left, right: panelBox.right, top: panelBox.top, bottom: panelBox.bottom } : null,
        clippers,
      };
    });
    await ui.waitForTimeout(120);
    const focused = await ui.screenshot();
    const ring = await measureRing(ui, link, unfocused, focused, geometry);
    const clipBox = {
      x: Math.max(0, Math.floor(geometry.box.left - geometry.spread - 8)),
      y: Math.max(0, Math.floor(geometry.box.top - geometry.spread - 8)),
      width: Math.ceil(geometry.box.right - geometry.box.left + geometry.spread * 2 + 16),
      height: Math.ceil(geometry.box.bottom - geometry.box.top + geometry.spread * 2 + 16),
    };
    const tag = `${width}${scheme === "dark" ? "-dark" : ""}`;
    await ui.screenshot({ path: path.join(OUT, `host-ring-${tag}-focused.png`), clip: clipBox });
    await link.evaluate((el) => el.blur());
    await ui.screenshot({ path: path.join(OUT, `host-ring-${tag}-unfocused.png`), clip: clipBox });
    await ui.screenshot({ path: path.join(OUT, `host-${tag}.png`) });
    return { width, scheme, theme, active, geometry, ring, clipBox };
  } finally {
    await ui.close();
  }
}

(async () => {
  const browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
  const record = { base: BASE, dark, measurements: [] };
  try {
    for (const [width, scheme] of [[320, "light"], [390, "light"], [320, "dark"], [390, "dark"]]) {
      record.measurements.push(await run(browser, width, scheme));
    }
  } finally {
    await browser.close();
  }
  const file = path.join(OUT, dark ? "host-ring-dark.json" : "host-ring.json");
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record.measurements.map((m) => ({
    width: m.width, scheme: m.scheme, theme: m.theme, active: m.active,
    outline: `${m.geometry.outlineWidth}px ${m.geometry.outlineStyle} ${m.geometry.outlineColor} offset ${m.geometry.outlineOffset}px`,
    linkLeft: Math.round(m.geometry.box.left * 100) / 100,
    ringLeft: Math.round((m.geometry.box.left - m.geometry.spread) * 100) / 100,
    nearestClipper: m.geometry.clippers[0] && `${m.geometry.clippers[0].name} left=${Math.round(m.geometry.clippers[0].left * 100) / 100}`,
    cut: m.ring.cut,
    sides: Object.fromEntries(Object.entries(m.ring.sides).map(([k, v]) => [k, { painted: `${v.painted}/${v.total}`, min: v.min }])),
  })), null, 2));
})().catch((e) => { console.error(e); process.exitCode = 1; });