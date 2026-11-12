"use strict";
/* What a 1px gap in the ring reads as, under the OLD painted test and under the
 * one this card ships. One fixture, one focused link, one measurement: the
 * numbers below come from the same two screenshots.
 *
 * The gap is a `clip-path` slit one pixel tall whose edges fall a quarter of a
 * pixel off the pixel grid, so the two rows it touches are only partly painted —
 * which is what a real 1px gap in a 2px stroke looks like once the browser has
 * anti-aliased it, and what the old test could not see.
 *
 *   node docs/receipts/post41/gap_probe.js
 */
const path = require("path");
const harness = require(path.join(__dirname, "..", "..", "..", "tests", "browser_net_harness.js"));

const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const row = (overrides) => ({
  item_id: "youtube:LCEmiRjPEtQ", format: "video", title: "AI introduction",
  destination: "https://www.youtube.com/watch?v=LCEmiRjPEtQ", capture_order: 1,
  contributors: ["A channel"], duration_seconds: null, art_url: THUMB, art_hotlink: true,
  art_http_status: 200, art_checked_at: "2026-11-06T12:22:23Z", ...overrides,
});
const items = [row(), row({ item_id: "youtube:AAAAAAAAAAA", title: "Another view", capture_order: 2 })];

async function main() {
  const browser = await harness.loadNodeModule("playwright").chromium.launch({headless: true});
  const fixture = await harness.startFixture(items);
  const ui = await browser.newPage();
  const out = { gap: "clip-path slit, 1 pixel row, offset a quarter pixel", sides: {} };
  try {
    await ui.setViewportSize({width: 320, height: 900});
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:harness.THUMB_PNG}));
    await ui.goto(fixture.origin);
    await ui.locator("#videos .ht-compact").first().waitFor();
    const link = ui.locator("#videos .ht-compact").first().locator(".ht-youtube-icon");
    await link.waitFor();
    await ui.setViewportSize({width: 320, height: 1600});
    await link.scrollIntoViewIfNeeded();
    const slit = (y0, y1) => "polygon(" +
      "-20px -20px, calc(100% + 20px) -20px, calc(100% + 20px) calc(100% + 20px), -20px calc(100% + 20px), " +
      `-20px ${y1}px, 60% ${y1}px, 60% ${y0}px, -20px ${y0}px)`;
    const band = await link.evaluate(el => {
      const b = el.getBoundingClientRect();
      const top = Math.round(b.top + b.height / 2 - 0.5) + 0.25;
      return {y0: top - b.top, y1: top - b.top + 1};
    });
    out.band = band;
    await link.evaluate((el, p) => { el.style.clipPath = p; }, slit(band.y0, band.y1));
    await link.evaluate(el => el.blur());
    const unfocused = await ui.screenshot();
    await ui.evaluate(() => {
      const title = document.querySelector("#videos .ht-compact .ht-title");
      title.setAttribute("tabindex", "-1");
      title.focus();
    });
    await ui.keyboard.press("Tab");
    const geometry = await link.evaluate(el => {
      const style = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      return {
        outlineWidth: parseFloat(style.outlineWidth),
        outlineOffset: parseFloat(style.outlineOffset),
        box: {left: b.left, right: b.right, top: b.top, bottom: b.bottom},
        ring: {left: b.left - spread, right: b.right + spread, top: b.top - spread, bottom: b.bottom + spread, spread},
      };
    });
    out.box = geometry.box;
    out.ring = geometry.ring;
    const focused = await ui.screenshot();

    // Both rules over the same pixels: the link's LEFT stroke, sampled along its
    // centreline, exactly as the suite samples it.
    out.sides = await ui.evaluate(async ({before, after, box, offset, thickness}) => {
      async function pixels(base64) {
        const image = new Image();
        image.src = "data:image/png;base64," + base64;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return {data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width};
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
        const points = [];
        for (let y = Math.floor(y1); y <= Math.floor(y2); y++) {
          for (let x = Math.floor(x1); x <= Math.floor(x2); x++) {
            if (x < 0 || y < 0 || x >= a.width || y >= a.height) continue;
            const i = 4 * (y * a.width + x);
            points.push({x, y, surface: [a.data[i], a.data[i+1], a.data[i+2]], ring: [b.data[i], b.data[i+1], b.data[i+2]]});
          }
        }
        const held = p => Math.max(Math.abs(p.surface[0] - p.ring[0]), Math.abs(p.surface[1] - p.ring[1]), Math.abs(p.surface[2] - p.ring[2]));
        const full = points.reduce((most, p) => Math.max(most, held(p)), 0);
        const readings = {total: points.length, full, straightFifty: {}, fixedDelta: {}};
        for (const key of ["straightFifty", "fixedDelta"]) {
          let painted = 0, partial = 0, min = Infinity, minAll = Infinity, minPixel = null, partialAt = null;
          for (const p of points) {
            const fraction = full > 0 ? held(p) / full : 0;
            const isPainted = key === "straightFifty" ? fraction >= 0.5 : held(p) > 20;
            if (isPainted) painted += 1;
            else if (fraction > 0.05) {
              partial += 1;
              if (!partialAt || fraction < partialAt.fraction) partialAt = {x: p.x, y: p.y, ring: p.ring, surface: p.surface, fraction: Number(fraction.toFixed(3))};
            }
            const r = ratio(p.ring, p.surface);
            if (r < minAll) minAll = r;
            if (isPainted && r < min) { min = r; minPixel = {...p, fraction: Number(fraction.toFixed(3))}; }
          }
          readings[key] = {
            painted, partial, total: points.length,
            paintedFraction: Number((painted / points.length).toFixed(4)),
            minOverPainted: Number(min.toFixed(3)), minOverEvery: Number(minAll.toFixed(3)),
            minPixel, partialAt,
          };
        }
        out[side] = readings;
      }
      return out;
    }, {before: unfocused.toString("base64"), after: focused.toString("base64"), box: geometry.box,
        offset: geometry.outlineOffset, thickness: geometry.outlineWidth});
  } finally {
    await ui.close();
    await fixture.close();
    await browser.close();
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
