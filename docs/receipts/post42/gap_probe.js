"use strict";
/* What a `clip-path` slit of N pixel rows, at a sub-pixel offset, does to the
 * compact Watch link's LEFT ring stroke — the measurement behind the post-#42
 * coverage rule.
 *
 *   node docs/receipts/post42/gap_probe.js
 *
 * One fixture, one focused link, one pair of screenshots per run; the same
 * per-pixel readings are then classified under BOTH bands, so the two rules are
 * compared on identical pixels rather than on two runs:
 *
 *   * the band this card ships — a pixel is FULLY painted at >= 95% of the
 *     side's strongest paint, partly painted between 5% and 95%, cleanly
 *     unpainted at <= 5%; a side passes only when every sampled pixel is fully
 *     painted;
 *   * the 50% band the previous revision used — painted at >= 50%, partly
 *     painted above 5%. It is printed so the reason for the change is visible:
 *     a 1px slit offset half a pixel leaves its two boundary rows at ~50.2%
 *     each, and under the 50% band BOTH count as painted, so the side reads
 *     163/163 and a half-pixel gap passes the 100% rule.
 *
 * The slit is a `clip-path` through the MIDDLE of the focused link: the only way
 * to remove ring pixels without a clipping ANCESTOR (an ancestor clip is caught
 * first, from geometry, by the cut check).
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

const RUNS = [
  {rows: 0, offset: 0, label: "no slit (the full ring)"},
  {rows: 1, offset: 0, label: "1px slit, integer offset"},
  {rows: 1, offset: 0.25, label: "1px slit, .25px offset"},
  {rows: 1, offset: 0.5, label: "1px slit, .5px offset"},
  {rows: 1, offset: 0.75, label: "1px slit, .75px offset"},
  {rows: 5, offset: 0, label: "5px slit (the old 97% control)"},
  {rows: 12, offset: 0, label: "12px slit (94%)"},
];

/* Classify one side's per-pixel fractions under one painted threshold. */
function classify(fractions, full, paintedAt) {
  let painted = 0, partial = 0, unpainted = 0;
  for (const fraction of fractions) {
    if (fraction >= paintedAt) painted += 1;
    else if (fraction > 0.05) partial += 1;
    else unpainted += 1;
  }
  return {
    painted, partial, unpainted, total: fractions.length,
    paintedFraction: Number((painted / fractions.length).toFixed(4)),
    smallest: [...fractions].sort((a, b) => a - b).slice(0, 4),
  };
}

async function main() {
  const browser = await harness.loadNodeModule("playwright").chromium.launch({headless: true});
  const fixture = await harness.startFixture(items);
  const ui = await browser.newPage();
  const report = {runs: []};
  const slit = (y0, y1) => "polygon(" +
    "-20px -20px, calc(100% + 20px) -20px, calc(100% + 20px) calc(100% + 20px), -20px calc(100% + 20px), " +
    `-20px ${y1}px, 60% ${y1}px, 60% ${y0}px, -20px ${y0}px)`;
  try {
    await ui.setViewportSize({width: 320, height: 900});
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:harness.THUMB_PNG}));
    await ui.goto(fixture.origin);
    await ui.locator("#videos .ht-compact").first().waitFor();
    const link = ui.locator("#videos .ht-compact").first().locator(".ht-youtube-icon");
    await link.waitFor();
    await ui.setViewportSize({width: 320, height: 1600});
    await link.scrollIntoViewIfNeeded();

    for (const {rows, offset, label} of RUNS) {
      await link.evaluate(el => { el.style.clipPath = "none"; });
      const band = await link.evaluate((el, options) => {
        const b = el.getBoundingClientRect();
        const top = Math.round(b.top + b.height / 2 - options.rows / 2) + options.offsetFraction;
        return {y0: top - b.top, y1: top - b.top + options.rows};
      }, {rows, offsetFraction: offset});
      if (rows > 0) {
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
        throw new Error("the slit control did not reach the compact Watch link: " + label);
      }
      const geometry = await link.evaluate(el => {
        const style = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        return {
          outlineWidth: parseFloat(style.outlineWidth),
          outlineOffset: parseFloat(style.outlineOffset),
          box: {left: b.left, right: b.right, top: b.top, bottom: b.bottom},
        };
      });
      const focused = await ui.screenshot();
      const measured = await ui.evaluate(async ({before, after, box, off, thickness}) => {
        async function pixels(base64) {
          const image = new Image();
          image.src = "data:image/png;base64," + base64;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        }
        const a = await pixels(before), b = await pixels(after);
        const spread = off + thickness / 2;
        const x = Math.floor(box.left - spread);
        const fractions = [];
        let full = 0;
        const readings = [];
        for (let y = Math.floor(box.top + 12); y <= Math.floor(box.bottom - 12); y++) {
          if (x < 0 || y < 0 || x >= 320) continue;
          const i = 4 * (y * 320 + x);
          const surface = [a[i], a[i + 1], a[i + 2]];
          const ring = [b[i], b[i + 1], b[i + 2]];
          const held = Math.max(Math.abs(surface[0] - ring[0]), Math.abs(surface[1] - ring[1]),
                                Math.abs(surface[2] - ring[2]));
          readings.push({surface, ring, held});
          if (held > full) full = held;
        }
        for (const reading of readings) fractions.push(full > 0 ? reading.held / full : 0);
        return {total: fractions.length, full, fractions};
      }, {before: unfocused.toString("base64"), after: focused.toString("base64"),
          box: geometry.box, off: geometry.outlineOffset, thickness: geometry.outlineWidth});
      const run = {
        label,
        rows, offset,
        total: measured.total,
        full: measured.full,
        band: {y0: Number(band.y0.toFixed(3)), y1: Number(band.y1.toFixed(3))},
        this_card_95: classify(measured.fractions, measured.full, 0.95),
        previous_50: classify(measured.fractions, measured.full, 0.5),
      };
      report.runs.push(run);
      console.log(JSON.stringify({
        label, total: run.total,
        this_card_95: run.this_card_95,
        previous_50: run.previous_50,
      }));
    }
  } finally {
    await ui.close();
    await fixture.close();
    await browser.close();
  }
  console.log("\n=== table ===");
  console.log("| slit | this card: fully painted (>= 95%) | partly painted | clean | verdict | the previous 50% band | verdict |");
  console.log("|---|---|---|---|---|---|---|");
  for (const run of report.runs) {
    const shipped = run.this_card_95, old = run.previous_50;
    const verdict = (reading) => reading.paintedFraction === 1 && reading.partial === 0
      ? "PASSES" : `FAILS coverage (${reading.painted}/${reading.total} painted)`;
    console.log(`| ${run.label} | ${shipped.painted}/${shipped.total} (${(100 * shipped.paintedFraction).toFixed(1)}%) ` +
      `| ${shipped.partial} | ${shipped.unpainted} | ${verdict(shipped)} | ` +
      `${old.painted}/${old.total} (${(100 * old.paintedFraction).toFixed(1)}%) | ${verdict(old)} |`);
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
