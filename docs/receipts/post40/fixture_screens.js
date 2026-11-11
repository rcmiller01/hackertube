"use strict";
/* Fixture-side before/after screenshots for the inner-wrapper change.
 *
 * Four variants, from two knobs:
 *   * the plugin stylesheet — the working tree's (fixed) or the same file with
 *     the inner-wrapper rule reverted to `padding: 0` (pre-fix);
 *   * the host CardContent padding — the measured `11.25px 15px`, or `0`.
 *
 * At the measured padding the whole page must be byte-identical between the
 * fixed and the pre-fix stylesheet at every width ("nothing else moved"); with
 * the host padding at 0 the ring must be whole in the fixed variant and cut in
 * the pre-fix one (the acceptance mutation).
 *
 *   node docs/receipts/post40/fixture_screens.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..", "..");
const OUT = __dirname;
const WIDTHS = [320, 390, 768, 1280];
const STYLE_PATH = path.join(REPO, "hackertube/dashboard/dist/style.css");
const HARNESS_PATH = path.join(REPO, "tests/browser_net_harness.js");
const PAGE_PATH = path.join(REPO, "hackertube/dashboard/dist/index.js");

const WRAPPER_FIXED = `.hackertube .hackertube {
  padding: 0 4px;
  margin: 0 -4px;
  max-width: none;
}`;
const WRAPPER_BASE = `.hackertube .hackertube {
  padding: 0;
  max-width: none;
}`;
const MQ_FIXED = "  .hackertube .hackertube { padding: 0 4px; }";
const MQ_BASE = "  .hackertube .hackertube { padding: 0; }";
const CARD_PAD = ".ht-card-content { padding: 11.25px 15px; }";

const row = (overrides) => ({
  item_id: "youtube:LCEmiRjPEtQ", format: "video", title: "AI introduction",
  destination: "https://www.youtube.com/watch?v=LCEmiRjPEtQ", capture_order: 1,
  contributors: ["A channel"], duration_seconds: null,
  art_url: "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg", art_hotlink: true,
  art_http_status: 200, art_checked_at: "2026-11-06T12:22:23Z", ...overrides,
});
const ITEMS = [row(), row({ item_id: "youtube:AAAAAAAAAAA", title: "Another view", capture_order: 2 })];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-fixture-screens-"));
const fixedStyle = fs.readFileSync(STYLE_PATH, "utf8");
if (fixedStyle.split(WRAPPER_FIXED).length !== 2 || fixedStyle.split(MQ_FIXED).length !== 2) {
  throw new Error("the fixed inner-wrapper rule is not present exactly once — cannot build the pre-fix stylesheet");
}
const baseStyle = fixedStyle.replace(WRAPPER_FIXED, WRAPPER_BASE).replace(MQ_FIXED, MQ_BASE);
const baseStylePath = path.join(dir, "style-base.css");
fs.writeFileSync(baseStylePath, baseStyle);

const harnessText = fs.readFileSync(HARNESS_PATH, "utf8");
if (harnessText.split(CARD_PAD).length !== 2) throw new Error("the measured CardContent padding is not in the harness exactly once");
const harnessPad0 = harnessText.replace(CARD_PAD, ".ht-card-content { padding: 0; }");
const harnessPad0Path = path.join(dir, "harness-pad0.js");
fs.writeFileSync(harnessPad0Path, harnessPad0);

/* Each harness copy must resolve the SAME bundle and the stylesheet this run
 * wants, so both paths are passed through the environment the harness reads. */
function loadHarness(harnessPath, stylePath, pad0) {
  process.env.HACKERTUBE_PAGE_PATH = PAGE_PATH;
  process.env.HACKERTUBE_STYLE_PATH = stylePath;
  delete require.cache[require.resolve(harnessPath)];
  return require(harnessPath);
}

async function capture(browser, harness, width) {
  const fixture = await harness.startFixture(ITEMS);
  const context = await browser.newContext({viewport: {width, height: 1600}});
  const ui = await context.newPage();
  try {
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({
      status: 200, contentType: "image/png", body: harness.THUMB_PNG,
    }));
    await ui.goto(fixture.origin);
    await ui.locator("#videos .ht-compact").first().waitFor();
    const link = ui.locator("#videos .ht-compact").first().locator(".ht-youtube-icon");
    await link.waitFor();
    await link.scrollIntoViewIfNeeded();
    await link.evaluate((el) => el.blur());
    const box = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const spread = 2 + 2; // 2px outline + 2px offset, read after focusing below
      return {left: b.left, right: b.right, top: b.top, bottom: b.bottom, spread, font: style.fontSize};
    });
    const page = await ui.screenshot();
    await ui.evaluate(() => {
      const title = document.querySelector("#videos .ht-compact .ht-title");
      title.setAttribute("tabindex", "-1");
      title.focus();
    });
    await ui.keyboard.press("Tab");
    const focused = await link.evaluate(el => document.activeElement === el);
    const clip = {
      x: Math.max(0, Math.floor(box.left - box.spread - 8)),
      y: Math.max(0, Math.floor(box.top - box.spread - 8)),
      width: Math.ceil(box.right - box.left + box.spread * 2 + 16),
      height: Math.ceil(box.bottom - box.top + box.spread * 2 + 16),
    };
    const ring = await ui.screenshot({clip});
    return {page, ring, focused, clip};
  } finally {
    await context.close();
    await fixture.close();
  }
}

(async () => {
  const { loadNodeModule } = loadHarness(HARNESS_PATH, STYLE_PATH, false);
  const chromium = loadNodeModule("playwright").chromium;
  const launched = await chromium.launch({headless: true});
  const record = {widths: WIDTHS, variants: {}};
  try {
    for (const [name, stylePath, harnessPath] of [
      ["fixed", STYLE_PATH, HARNESS_PATH],
      ["prefix", baseStylePath, HARNESS_PATH],
      ["fixed-pad0", STYLE_PATH, harnessPad0Path],
      ["prefix-pad0", baseStylePath, harnessPad0Path],
    ]) {
      const harness = loadHarness(harnessPath, stylePath, name.includes("pad0"));
      record.variants[name] = {};
      for (const width of WIDTHS) {
        const shot = await capture(launched, harness, width);
        const tag = `${name}-${width}`;
        fs.writeFileSync(path.join(OUT, `fixture-${tag}.png`), shot.page);
        fs.writeFileSync(path.join(OUT, `fixture-${tag}-ring.png`), shot.ring);
        record.variants[name][width] = {focused: shot.focused, clip: shot.clip,
                                        pageBytes: shot.page.length, ringBytes: shot.ring.length};
      }
      console.log(name, JSON.stringify(record.variants[name]));
    }
  } finally {
    await launched.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
  fs.writeFileSync(path.join(OUT, "fixture-screens.json"), JSON.stringify(record, null, 2));
})().catch((e) => { console.error(e); process.exitCode = 1; });
