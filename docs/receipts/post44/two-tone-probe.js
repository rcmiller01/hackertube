// The two-tone ring fixture, measured — the lever behind the post-#44 card's
// item 1 and the 24% band split `tests/browser_net_harness.js` uses.
//
//   node docs/receipts/post44/two-tone-probe.js --fixture two-tone --out docs/receipts/post44/two-tone.json
//
// Loads the compact YouTube row in the real fixture, focuses its Watch link the
// way a keyboard user reaches it, and measures the painted ring on each side from
// the unfocused/focused screenshot pair. For every side it reports:
//
//   * the surfaces the stroke covers and the RING TONES that were painted on it;
//   * the fraction of pixels the SHIPPED classifier calls painted (each pixel
//     measured against the computed outline colour composited over its own
//     surface), plus its minimum contrast over painted pixels;
//   * what the two replaced classifiers would have said about the same pixels —
//     `strongestPixel` (the side's most-changed pixel is the reference: the
//     classification this card replaces) and `strongestDifference` (`held / full`,
//     the pre-#43 rule the mutation matrix restores).
//
// The same numbers are asserted inside the test itself
// (`tests/test_privacy_browser.js`, "a two-tone ring from one outline colour over a
// surface that changes"); this script exists so the fixture's own shape — two
// tones, both ring-coloured, both >= 3:1 — can be read and re-derived without
// running the test runner. The copy of the classifier here is a replica: it agrees
// with the shipped one pixel for pixel on a flat surface (163/163, 194/194,
// 17.72:1 at 320px), which is what makes it usable as a probe.
"use strict";
const path = require("path");
const fs = require("fs");

const REPO = path.resolve(__dirname, "../../..");
const harness = require(path.join(REPO, "tests/browser_net_harness.js"));

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = argv.indexOf("--" + name);
  return at === -1 ? fallback : argv[at + 1];
};
const FIXTURE = arg("fixture", "two-tone");
const OUT = arg("out", "");
const WIDTH = Number(arg("width", 320));

const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
function youtubeRow() {
  return {
    item_id: "youtube:LCEmiRjPEtQ", format: "video", title: "AI introduction",
    destination: "https://www.youtube.com/watch?v=LCEmiRjPEtQ", capture_order: 1,
    contributors: ["A channel"], duration_seconds: null, art_url: THUMB, art_hotlink: true,
    art_http_status: 200, art_checked_at: "2026-11-06T12:22:23Z",
  };
}
function sectionRows() {
  return [youtubeRow(),
    { item_id: "p1", format: "podcast_show", title: "Austen Notes",
      destination: "https://example.com/show", capture_order: 2, contributors: [],
      duration_seconds: null, art_url: null, art_hotlink: false },
    { item_id: "b1", format: "book", title: "Emma",
      destination: "https://openlibrary.org/works/OL66513W", capture_order: 4,
      contributors: ["Jane Austen"], duration_seconds: null, art_url: null, art_hotlink: false }];
}
const RENDER = {
  flat: {},
  gradient: {gradientSurface: true},
  "two-tone": {twoToneSurface: true},
}[FIXTURE];
if (!RENDER) throw new Error("--fixture must be one of flat, gradient, two-tone");

(async () => {
  const {chromium} = harness.loadNodeModule("playwright");
  const browser = await chromium.launch({headless: true});
  const fixture = await harness.startFixture(sectionRows(), {}, RENDER);
  const ui = await browser.newPage();
  const record = {fixture: FIXTURE, width: WIDTH, rows: sectionRows().length};
  try {
    await ui.setViewportSize({width: WIDTH, height: 900});
    await ui.route("https://i.ytimg.com/**",
      (route) => route.fulfill({status: 200, contentType: "image/png", body: harness.THUMB_PNG}));
    await ui.goto(fixture.origin);
    await ui.locator("#videos .ht-compact").first().waitFor();
    const link = ui.locator("#videos .ht-compact").first().locator(".ht-youtube-icon");
    await link.waitFor();
    await ui.setViewportSize({width: WIDTH, height: 1600});
    await link.scrollIntoViewIfNeeded();
    record.boxes = await link.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const content = el.closest(".ht-card-content");
      const c = content ? content.getBoundingClientRect() : null;
      return {
        link: {left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height},
        content: c ? {left: c.left, top: c.top, right: c.right, bottom: c.bottom, width: c.width, height: c.height} : null,
      };
    });
    await link.evaluate((el) => el.blur());
    const unfocused = await ui.screenshot();
    await ui.evaluate(() => {
      const title = document.querySelector("#videos .ht-compact .ht-title");
      title.setAttribute("tabindex", "-1");
      title.focus();
    });
    await ui.keyboard.press("Tab");
    record.reachedByTab = await link.evaluate((el) => document.activeElement === el);
    const geometry = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      return {
        outlineColor: style.outlineColor, outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth), outlineOffset: parseFloat(style.outlineOffset),
        devicePixelRatio: window.devicePixelRatio,
        box: {left: b.left, right: b.right, top: b.top, bottom: b.bottom},
      };
    });
    record.outline = geometry;
    const focused = await ui.screenshot();
    record.sides = await ui.evaluate(async ({before, after, box, offset, thickness, dpr, outlineColor}) => {
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
      const at = (value) => value * dpr;
      const lines = {
        left: [at(box.left - spread), at(box.top + 12), at(box.left - spread), at(box.bottom - 12)],
        right: [at(box.right + spread), at(box.top + 12), at(box.right + spread), at(box.bottom - 12)],
        top: [at(box.left + 12), at(box.top - spread), at(box.right - 12), at(box.top - spread)],
        bottom: [at(box.left + 12), at(box.bottom + spread), at(box.right - 12), at(box.bottom + spread)],
      };
      const channel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const luminance = (c) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
      const ratio = (fg, bg) => {
        const l1 = luminance(fg), l2 = luminance(bg);
        const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      };
      // The computed outline colour, resolved to RGBA by compositing it over black
      // and over white: syntax-independent, and alpha survives.
      const cv = document.createElement("canvas");
      cv.width = 1; cv.height = 1;
      const cx = cv.getContext("2d", {willReadFrequently: true});
      const over = (background) => {
        cx.clearRect(0, 0, 1, 1);
        cx.fillStyle = background; cx.fillRect(0, 0, 1, 1);
        cx.fillStyle = outlineColor; cx.fillRect(0, 0, 1, 1);
        return Array.from(cx.getImageData(0, 0, 1, 1).data).slice(0, 3);
      };
      const overBlack = over("#000000"), overWhite = over("#ffffff");
      const composite = (surface) => overBlack.map((low, c) => low + ((overWhite[c] - low) / 255) * surface[c]);
      const span = (u, v) => Math.max(Math.abs(u[0] - v[0]), Math.abs(u[1] - v[1]), Math.abs(u[2] - v[2]));
      const out = {};
      for (const [side, [x1, y1, x2, y2]] of Object.entries(lines)) {
        const points = [];
        for (let y = Math.floor(y1); y <= Math.floor(y2); y++) {
          for (let x = Math.floor(x1); x <= Math.floor(x2); x++) {
            if (x < 0 || y < 0 || x >= a.width || y >= a.height) continue;
            const i = 4 * (y * a.width + x);
            const surface = [a.data[i], a.data[i + 1], a.data[i + 2]];
            const ring = [b.data[i], b.data[i + 1], b.data[i + 2]];
            points.push({surface, ring, held: span(ring, surface), contrast: ratio(ring, surface)});
          }
        }
        let strongest = 0, reference = null;
        for (const point of points) if (point.held > strongest) { strongest = point.held; reference = point.ring; }
        const shipped = {painted: 0, partial: 0, total: points.length, minContrast: null};
        const strongestPixel = {painted: 0, partial: 0};
        const strongestDifference = {painted: 0, partial: 0};
        const surfaces = new Set(), tones = new Set();
        for (const point of points) {
          if (surfaces.size < 8) surfaces.add(point.surface.join(","));
          if (tones.size < 8) tones.add(point.ring.join(","));
          const denom = span(composite(point.surface), point.surface);
          const fraction = denom > 0 ? Math.min(1, point.held / denom) : (point.held <= 0 ? 1 : 0);
          if (fraction >= 0.95) {
            shipped.painted += 1;
            shipped.minContrast = shipped.minContrast === null ? point.contrast
              : Math.min(shipped.minContrast, point.contrast);
          } else if (fraction > 0.05) shipped.partial += 1;
          const byTone = reference ? span(reference, point.surface) : 0;
          const toneFraction = byTone > 0 ? Math.min(1, point.held / byTone) : (point.held <= 0 ? 1 : 0);
          if (toneFraction >= 0.95) strongestPixel.painted += 1;
          else if (toneFraction > 0.05) strongestPixel.partial += 1;
          const differenceFraction = strongest > 0 ? Math.min(1, point.held / strongest) : 0;
          if (differenceFraction >= 0.95) strongestDifference.painted += 1;
          else if (differenceFraction > 0.05) strongestDifference.partial += 1;
        }
        out[side] = {
          total: points.length,
          surfaces: Array.from(surfaces),
          tones: Array.from(tones),
          referenceFromComputedOutline: {overBlack, overWhite},
          shipped: {...shipped, minContrast: shipped.minContrast === null ? null : Number(shipped.minContrast.toFixed(2))},
          strongestPixel,
          strongestDifference,
        };
      }
      return out;
    }, {before: unfocused.toString("base64"), after: focused.toString("base64"),
        box: geometry.box, offset: geometry.outlineOffset, thickness: geometry.outlineWidth,
        dpr: geometry.devicePixelRatio || 1, outlineColor: geometry.outlineColor});
  } finally {
    await ui.close().catch(() => {});
    await fixture.close().catch(() => {});
    await browser.close();
  }
  const text = JSON.stringify(record, null, 2);
  if (OUT) fs.writeFileSync(OUT, text + "\n");
  console.log(text);
})();
