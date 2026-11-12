"use strict";
/* The measurement behind both of this card's test changes, on one page per run:
 * a `clip-path` slit of N CSS pixels through the middle of the compact Watch
 * link's LEFT stroke, at a given offset and device pixel ratio, over a flat
 * surface and over the gradient surface the finding names.
 *
 *   node docs/receipts/post43/gap_probe.js
 *
 * One fixture and one focused link per run, one pair of screenshots; on those
 * IDENTICAL pixels three readings are computed, so the rules are compared on the
 * same measurement rather than on three runs:
 *
 *   * `ring_relative` — the classification this card ships: per pixel,
 *     |focused - unfocused| / |ringColour - unfocused|, where ringColour is the
 *     pixel carrying the most paint on that side. A pixel is painted at >= 95%.
 *   * `strongest_difference` — the rule it replaces for a varying surface:
 *     held / full, where full is the strongest held anywhere on that side.
 *   * `fixed_delta` — the rule before post-#42: any channel delta > 20 counts as
 *     painted. Printed so the coverage defect it mislabeled as a contrast defect
 *     is visible beside the two that classify it correctly.
 *
 * Device pixel ratio matters here because a screenshot is captured at device
 * resolution: at DPR 1.25 the sampler used to read the PNG with CSS-pixel
 * coordinates and reported the REAL ring as 0/301 and 0/163 painted. The `dpr`
 * runs are what the scaled sampler is held to.
 *
 * The gradient runs use `renderOptions.gradientSurface` (the harness's
 * `.ht-card-content` ramp), which is the surface the compact Watch link's ring is
 * drawn over at this width.
 */
const path = require("path");
const fs = require("fs");
const harness = require(path.join(__dirname, "..", "..", "..", "tests", "browser_net_harness.js"));

const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const row = (overrides) => ({
  item_id: "youtube:LCEmiRjPEtQ", format: "video", title: "AI introduction",
  destination: "https://www.youtube.com/watch?v=LCEmiRjPEtQ", capture_order: 1,
  contributors: ["A channel"], duration_seconds: null, art_url: THUMB, art_hotlink: true,
  art_http_status: 200, art_checked_at: "2026-11-06T12:22:23Z", ...overrides,
});
const items = [row(), row({item_id: "youtube:AAAAAAAAAAA", title: "Another view", capture_order: 2})];

const NOTCH = 0.03;
const RUNS = [
  {label: "flat surface, full ring", rows: 0, offset: 0, dpr: 1, gradient: false},
  {label: "flat surface, 1px slit, integer offset", rows: 1, offset: 0, dpr: 1, gradient: false},
  {label: "flat surface, 1px slit, .25px offset", rows: 1, offset: 0.25, dpr: 1, gradient: false},
  {label: "flat surface, 1px slit, .5px offset", rows: 1, offset: 0.5, dpr: 1, gradient: false},
  {label: "flat surface, 1px slit, .75px offset", rows: 1, offset: 0.75, dpr: 1, gradient: false},
  {label: "flat surface, 2px slit", rows: 2, offset: 0, dpr: 1, gradient: false},
  {label: "flat surface, 5px slit (the old 97% control)", rows: 5, offset: 0, dpr: 1, gradient: false},
  {label: "flat surface, 3% notch", rows: "notch", offset: 0, dpr: 1, gradient: false},
  {label: "flat surface, full ring at DPR 1.25", rows: 0, offset: 0, dpr: 1.25, gradient: false},
  {label: "flat surface, 1px slit at DPR 1.25, integer offset", rows: 1, offset: 0, dpr: 1.25, gradient: false},
  {label: "flat surface, 1px slit at DPR 1.25, .5px offset", rows: 1, offset: 0.5, dpr: 1.25, gradient: false},
  {label: "flat surface, 3% notch at DPR 1.25", rows: "notch", offset: 0, dpr: 1.25, gradient: false},
  {label: "gradient surface, full ring", rows: 0, offset: 0, dpr: 1, gradient: true},
  {label: "gradient surface, 1px slit", rows: 1, offset: 0, dpr: 1, gradient: true},
  {label: "gradient surface, full ring at DPR 1.25", rows: 0, offset: 0, dpr: 1.25, gradient: true},
];

const slit = (y0, y1) => "polygon(" +
  "-20px -20px, calc(100% + 20px) -20px, calc(100% + 20px) calc(100% + 20px), -20px calc(100% + 20px), " +
  `-20px ${y1}px, 60% ${y1}px, 60% ${y0}px, -20px ${y0}px)`;

async function main() {
  const browser = await harness.loadNodeModule("playwright").chromium.launch({headless: true});
  const report = {notch: NOTCH, runs: []};
  for (const run of RUNS) {
    const fixture = await harness.startFixture(items, {}, {gradientSurface: run.gradient});
    const context = run.dpr === 1 ? null : await browser.newContext({deviceScaleFactor: run.dpr});
    const ui = context ? await context.newPage() : await browser.newPage();
    try {
      await ui.setViewportSize({width: 320, height: 900});
      await ui.route("https://i.ytimg.com/**",
        route => route.fulfill({status: 200, contentType: "image/png", body: harness.THUMB_PNG}));
      await ui.goto(fixture.origin);
      await ui.locator("#videos .ht-compact").first().waitFor();
      const link = ui.locator("#videos .ht-compact").first().locator(".ht-youtube-icon");
      await link.waitFor();
      await ui.setViewportSize({width: 320, height: 1600});
      await link.scrollIntoViewIfNeeded();
      const band = await link.evaluate((el, options) => {
        const b = el.getBoundingClientRect();
        const rows = options.rows === "notch"
          ? Math.max(1, Math.round(options.notch * (b.height - 24))) : options.rows;
        const top = Math.round(b.top + b.height / 2 - rows / 2) + options.offset;
        return {rows, y0: top - b.top, y1: top - b.top + rows};
      }, {rows: run.rows, notch: NOTCH, offset: run.offset});
      if (band.rows > 0) {
        await link.evaluate((el, p) => { el.style.clipPath = p; }, slit(band.y0, band.y1));
      }
      await link.evaluate(el => el.blur());
      const unfocused = await ui.screenshot();
      await ui.evaluate(() => {
        const title = document.querySelector("#videos .ht-compact .ht-title");
        title.setAttribute("tabindex", "-1");
        title.focus();
      });
      await ui.keyboard.press("Tab");
      if (!(await link.evaluate(el => document.activeElement === el))) {
        throw new Error("the control did not reach the compact Watch link: " + run.label);
      }
      const geometry = await link.evaluate(el => {
        const style = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        return {
          outlineWidth: parseFloat(style.outlineWidth),
          outlineOffset: parseFloat(style.outlineOffset),
          devicePixelRatio: window.devicePixelRatio,
          box: {left: b.left, right: b.right, top: b.top, bottom: b.bottom},
        };
      });
      const focused = await ui.screenshot();
      if (geometry.devicePixelRatio !== run.dpr) {
        throw new Error(`the run asked for DPR ${run.dpr} and the page reports ${geometry.devicePixelRatio}`);
      }
      const sides = await ui.evaluate(async ({before, after, box, offset, thickness, dpr}) => {
        async function pixels(b64) {
          const image = new Image();
          image.src = "data:image/png;base64," + b64;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          return {data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height};
        }
        const a = await pixels(before), b = await pixels(after);
        const spread = offset + thickness / 2;
        const at = (value) => value * dpr;
        const lines = {
          left: [at(box.left - spread), at(box.top + 12), at(box.left - spread), at(box.bottom - 12)],
          right: [at(box.right + spread), at(box.top + 12), at(box.right + spread), at(box.bottom - 12)],
          top: [at(box.left + 12), at(box.top - spread), at(box.right - 12), at(box.top - spread)],
          bottom: [at(box.left + 12), at(box.bottom + spread), at(box.right - 12), at(box.bottom + spread)],
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
          let full = 0, ringColour = null, firstSurface = null, lastSurface = null;
          const readings = [];
          for (let y = Math.floor(y1); y <= Math.floor(y2); y++) {
            for (let x = Math.floor(x1); x <= Math.floor(x2); x++) {
              if (x < 0 || y < 0 || x >= a.width || y >= a.height) continue;
              const i = 4 * (y * a.width + x);
              const surface = [a.data[i], a.data[i+1], a.data[i+2]];
              const ring = [b.data[i], b.data[i+1], b.data[i+2]];
              if (!firstSurface) firstSurface = surface;
              lastSurface = surface;
              const held = Math.max(Math.abs(surface[0]-ring[0]), Math.abs(surface[1]-ring[1]), Math.abs(surface[2]-ring[2]));
              readings.push({surface, ring, held});
              if (held > full) { full = held; ringColour = ring; }
            }
          }
          const ringRelative = [], strongest = [], fixedDelta = [];
          let minPainted = Infinity;
          for (const r of readings) {
            const denom = ringColour ? Math.max(Math.abs(ringColour[0]-r.surface[0]),
              Math.abs(ringColour[1]-r.surface[1]), Math.abs(ringColour[2]-r.surface[2])) : 0;
            const f = denom > 0 ? Math.min(1, r.held / denom) : 0;
            ringRelative.push(f);
            strongest.push(full > 0 ? r.held / full : 0);
            fixedDelta.push([0, 1, 2].some((c) => Math.abs(r.surface[c] - r.ring[c]) > 20) ? 1 : 0);
            const contrast = ratio(r.ring, r.surface);
            if (f >= 0.95 && contrast < minPainted) minPainted = contrast;
          }
          const count = (arr, band) => ({
            painted: arr.filter(f => f >= band).length,
            partial: arr.filter(f => f > 0.05 && f < band).length,
            total: arr.length,
          });
          out[side] = {
            firstSurface, lastSurface, ringColour, full,
            total: readings.length,
            ring_relative: count(ringRelative, 0.95),
            strongest_difference: count(strongest, 0.95),
            fixed_delta: count(fixedDelta, 0.5),
            min_painted_contrast: Number.isFinite(minPainted) ? Number(minPainted.toFixed(2)) : null,
          };
        }
        return out;
      }, {before: unfocused.toString("base64"), after: focused.toString("base64"),
          box: geometry.box, offset: geometry.outlineOffset, thickness: geometry.outlineWidth,
          dpr: geometry.devicePixelRatio});
      report.runs.push({label: run.label, dpr: run.dpr, rows: band.rows, offset: run.offset,
                        gradient: run.gradient, sides});
      const left = sides.left;
      console.log(`${run.label}: left ${left.ring_relative.painted}/${left.total} painted, ` +
        `${left.ring_relative.partial} partly ` +
        `(strongest-difference ${left.strongest_difference.painted}/${left.total}; ` +
        `fixed delta ${left.fixed_delta.painted}/${left.total})`);
    } finally {
      await (context || ui).close().catch(() => {});
      await fixture.close().catch(() => {});
    }
  }
  await browser.close();

  console.log("\n=== table (ring-relative, this card) ===");
  console.log("| run | DPR | total | painted | partly | verdict | strongest-difference | fixed delta |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const run of report.runs) {
    const s = run.sides.left, total = s.total;
    const verdict = s.ring_relative.painted === total ? "PASSES" : `FAILS coverage (${s.ring_relative.painted}/${total})`;
    console.log(`| ${run.label} | ${run.dpr} | ${total} | ${s.ring_relative.painted} | ${s.ring_relative.partial} | ` +
      `${verdict} | ${s.strongest_difference.painted}/${total} painted, ${s.strongest_difference.partial} partly | ` +
      `${s.fixed_delta.painted}/${total} painted, ${s.fixed_delta.partial} partly |`);
  }
  console.log("\n=== the sides the gradient actually varies along (full-ring runs) ===");
  for (const run of report.runs.filter(r => r.rows === 0)) {
    for (const [side, s] of Object.entries(run.sides)) {
      console.log(`${run.label} ${side}: rgb(${s.firstSurface.join(",")}) -> rgb(${s.lastSurface.join(",")}), ` +
        `ring-relative ${s.ring_relative.painted}/${s.total}, strongest-difference ${s.strongest_difference.painted}/${s.total} ` +
        `(${s.strongest_difference.partial} partly)`);
    }
  }
  fs.writeFileSync(path.join(__dirname, "gap-probe.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
