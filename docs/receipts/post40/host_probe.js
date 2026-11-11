"use strict";
/* Real-Hermes-host probe for the post-#40 follow-up card.
 *
 * Boots against a running dashboard (a fresh profile's own server), opens the
 * Videos section, reaches the compact row's Watch link with a real Tab press,
 * and records:
 *
 *   * the PAINTED ring (focused screenshot pixel vs unfocused pixel at the same
 *     point) along every side, with the painted fraction and the minimum ratio
 *     over painted pixels and over every sampled pixel;
 *   * the ring's own geometry against every clipping ancestor, plus each
 *     ancestor's own padding (the inner `.hackertube`'s reserved 4px and the
 *     host CardContent's padding are both read here);
 *   * full-page unfocused/focused screenshots at every width, so "nothing else
 *     moved" can be checked by diffing the unfocused captures of two runs.
 *
 *   HACKERTUBE_HOST_BASE=http://127.0.0.1:9232 HACKERTUBE_MODE=fix \
 *     node docs/receipts/post40/host_probe.js
 */
const fs = require("fs");
const path = require("path");
const { loadNodeModule } = require("../../../tests/browser_net_harness");

const BASE = process.env.HACKERTUBE_HOST_BASE || "http://127.0.0.1:9232";
const MODE = process.env.HACKERTUBE_MODE || "fix";
const OUT = __dirname;
const WIDTHS = [320, 390, 768, 1280];

async function measureRing(ui, before, after, geometry) {
  return ui.evaluate(async ({before, after, box, offset, thickness}) => {
    async function pixels(base64) {
      const image = new Image();
      image.src = "data:image/png;base64," + base64;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return {data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height};
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
      let painted = 0, total = 0, min = Infinity, minAll = Infinity, minAt = null;
      for (let y = Math.floor(y1); y <= Math.floor(y2); y++) {
        for (let x = Math.floor(x1); x <= Math.floor(x2); x++) {
          if (x < 0 || y < 0 || x >= a.width || y >= a.height) continue;
          total += 1;
          const i = 4 * (y * a.width + x);
          const surface = [a.data[i], a.data[i + 1], a.data[i + 2]];
          const ring = [b.data[i], b.data[i + 1], b.data[i + 2]];
          const isPainted = [0, 1, 2].some((c) => Math.abs(surface[c] - ring[c]) > 20);
          if (isPainted) painted += 1;
          const r = ratio(ring, surface);
          if (r < minAll) minAll = r;
          if (isPainted && r < min) { min = r; minAt = {x, y, surface, ring}; }
        }
      }
      out[side] = {
        painted, total, frac: total ? Number((painted / total).toFixed(4)) : null,
        min: Number.isFinite(min) ? Number(min.toFixed(3)) : null,
        minAll: Number.isFinite(minAll) ? Number(minAll.toFixed(3)) : null,
        minAt,
      };
    }
    return out;
  }, {before: before.toString("base64"), after: after.toString("base64"), box: geometry.box,
      offset: geometry.outlineOffset, thickness: geometry.outlineWidth});
}

async function run(browser, width) {
  // A fresh context per capture: the plugin stylesheet must not be served from a
  // previous run's HTTP cache, because the two runs differ only in that file.
  const context = await browser.newContext({viewport: {width, height: 1600}});
  const ui = await context.newPage();
  try {
    await ui.goto(BASE + "/hackertube", {waitUntil: "networkidle"});
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
    await ui.setViewportSize({width, height: 1600});
    await link.scrollIntoViewIfNeeded();
    await link.evaluate((el) => el.blur());
    await ui.waitForTimeout(150);
    const unfocused = await ui.screenshot();
    const theme = await ui.evaluate(() => ({
      pageBackground: getComputedStyle(document.body).backgroundColor,
      ringToken: getComputedStyle(document.documentElement).getPropertyValue("--color-ring").trim(),
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
    }));
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
      const wrappers = [];
      let cardContent = null;
      let cardContentNode = null;
      for (let node = el.parentElement; node; node = node.parentElement) {
        const s = getComputedStyle(node);
        const cls = typeof node.className === "string" ? node.className : "";
        if (cls.split(/\s+/).includes("hackertube")) {
          wrappers.push({
            classes: cls, padding: s.padding, margin: s.margin,
            overflowX: s.overflowX, fontSize: s.fontSize,
            box: (() => { const r = node.getBoundingClientRect();
              return {left: r.left, right: r.right, top: r.top, bottom: r.bottom}; })(),
            innerWidth: node.clientWidth, scrollWidth: node.scrollWidth,
          });
        }
        if (!cardContent && /(^|\s)p-4(\s|$)/.test(cls)) {
          const r = node.getBoundingClientRect();
          cardContent = {classes: cls, padding: s.padding, fontSize: s.fontSize,
                         paddingTop: s.paddingTop, paddingRight: s.paddingRight,
                         paddingBottom: s.paddingBottom, paddingLeft: s.paddingLeft,
                         inlineStyle: node.getAttribute("style"),
                         spacingMul: s.getPropertyValue("--theme-spacing-mul").trim(),
                         isCardChild: !!(node.parentElement && node.parentElement.className
                           && String(node.parentElement.className).split(/\s+/).includes("ht-card")),
                         box: {left: r.left, right: r.right, top: r.top, bottom: r.bottom}};
          cardContentNode = node;
        }
        const clipsX = s.overflowX !== "visible";
        const clipsY = s.overflowY !== "visible";
        if (clipsX || clipsY) {
          const r = node.getBoundingClientRect();
          clippers.push({
            name: (cls || node.tagName).replace(/\s+/g, ".").slice(0, 60),
            clipsX, clipsY, padding: s.padding,
            left: r.left + parseFloat(s.borderLeftWidth),
            top: r.top + parseFloat(s.borderTopWidth),
            right: r.right - parseFloat(s.borderRightWidth),
            bottom: r.bottom - parseFloat(s.borderBottomWidth),
          });
        }
      }
      const card = el.closest(".ht-card");
      const cardBox = card ? card.getBoundingClientRect() : null;
      // Which rules actually set the CardContent's padding? The measured value
      // is only worth recording with its provenance.
      const paddingRules = [];
      if (cardContentNode) {
        const node = cardContentNode;
        if (node) {
          for (const sheet of Array.from(document.styleSheets)) {
            let rules;
            try { rules = sheet.cssRules; } catch (err) { continue; }
            for (const walk of Array.from(rules || [])) {
              const list = walk.cssRules ? Array.from(walk.cssRules) : [walk];
              for (const rule of list) {
                if (!rule.selectorText) continue;
                let matches = false;
                try { matches = node.matches(rule.selectorText); } catch (err) { matches = false; }
                if (matches && /padding/.test(rule.style.cssText)) {
                  paddingRules.push({
                    selector: rule.selectorText, style: rule.style.cssText,
                    media: walk.conditionText || null,
                  });
                }
              }
            }
          }
        }
      }
      return {
        focused: document.activeElement === el,
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor,
        outlineWidth: parseFloat(style.outlineWidth),
        outlineOffset: parseFloat(style.outlineOffset),
        box: {left: box.left, right: box.right, top: box.top, bottom: box.bottom},
        spread,
        card: cardBox ? {left: cardBox.left, right: cardBox.right, top: cardBox.top, bottom: cardBox.bottom} : null,
        clippers, wrappers, cardContent, paddingRules,
      };
    });
    await ui.waitForTimeout(150);
    const focused = await ui.screenshot();
    const ring = await measureRing(ui, unfocused, focused, geometry);
    const cut = {};
    for (const side of ["left", "right", "top", "bottom"]) {
      const span = side === "left" ? geometry.box.left - geometry.spread
        : side === "right" ? geometry.box.right + geometry.spread
        : side === "top" ? geometry.box.top - geometry.spread : geometry.box.bottom + geometry.spread;
      cut[side] = geometry.clippers.filter((c) => (side === "left" || side === "right" ? c.clipsX : c.clipsY)
        && (side === "left" ? span < c.left - 0.5
          : side === "right" ? span > c.right + 0.5
          : side === "top" ? span < c.top - 0.5 : span > c.bottom + 0.5)).map((c) => c.name);
    }
    const clipBox = {
      x: Math.max(0, Math.floor(geometry.box.left - geometry.spread - 8)),
      y: Math.max(0, Math.floor(geometry.box.top - geometry.spread - 8)),
      width: Math.ceil(geometry.box.right - geometry.box.left + geometry.spread * 2 + 16),
      height: Math.ceil(geometry.box.bottom - geometry.box.top + geometry.spread * 2 + 16),
    };
    await ui.screenshot({path: path.join(OUT, `host-${MODE}-${width}-focused.png`), clip: clipBox});
    await link.evaluate((el) => el.blur());
    await ui.screenshot({path: path.join(OUT, `host-${MODE}-${width}-unfocused.png`), clip: clipBox});
    await ui.screenshot({path: path.join(OUT, `host-${MODE}-${width}.png`)});
    return {width, theme, active, geometry, ring, cut, clipBox};
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await loadNodeModule("playwright").chromium.launch({headless: true});
  const record = {base: BASE, mode: MODE, dark: false, measurements: []};
  try {
    for (const width of WIDTHS) record.measurements.push(await run(browser, width));
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, `host-ring-${MODE}.json`), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record.measurements.map((m) => ({
    width: m.width, theme: m.theme, active: m.active,
    outline: `${m.geometry.outlineWidth}px ${m.geometry.outlineStyle} ${m.geometry.outlineColor} offset ${m.geometry.outlineOffset}px`,
    linkLeft: Math.round(m.geometry.box.left * 100) / 100,
    ringLeft: Math.round((m.geometry.box.left - m.geometry.spread) * 100) / 100,
    nearestClipper: m.geometry.clippers[0] && `${m.geometry.clippers[0].name} left=${Math.round(m.geometry.clippers[0].left * 100) / 100} padding=${m.geometry.clippers[0].padding}`,
    innerWrapper: m.geometry.wrappers.find((w) => w.padding.startsWith("0px 4px")) || m.geometry.wrappers[m.geometry.wrappers.length - 1],
    cardContent: m.geometry.cardContent,
    paddingRules: m.geometry.paddingRules,
    cut: m.cut,
    sides: Object.fromEntries(Object.entries(m.ring).map(([k, v]) => [k, `${v.painted}/${v.total} frac ${v.frac} min ${v.min} minAll ${v.minAll}`])),
  })), null, 2));
})().catch((e) => { console.error(e); process.exitCode = 1; });
