"use strict";
/* Post-merge review finding 8: the model-picker row at a 390px viewport.
 *
 * Serves the real page bundle against the stub API in tests/browser_net_harness.js,
 * opens the focused search panel, and measures the row: it must wrap inside the
 * viewport instead of running off it. Writes receipts beside this file.
 *
 *   PATH=$HOME/.hermes/tools/node-26.7.0-darwin-arm64/bin:$PATH \
 *   NODE_PATH=~/.hermes/cache/scratch/node-modules/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools \
 *   node docs/receipts/design-followups/model-picker-390.js
 */

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { startFixture, fixtureItems, loadNodeModule } = require(
  path.resolve(__dirname, "../../../tests/browser_net_harness.js"),
);

async function main() {
  const fixture = await startFixture(fixtureItems(1));
  const browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const ui = await context.newPage();
    await ui.route("https://covers.openlibrary.org/**", (route) => route.abort());
    await ui.goto(fixture.origin);
    await ui.getByRole("button", { name: "Focused search", exact: true }).click();
    const picker = ui.locator(".ht-model-picker");
    await picker.waitFor();
    const box = await picker.boundingBox();
    const label = await ui.locator(".ht-model-picker label").first().boundingBox();
    const select = await ui.locator("#hackertube-search-model").boundingBox();
    const overflow = await ui.evaluate(() => ({
      root: document.querySelector(".hackertube").scrollWidth,
      viewport: window.innerWidth,
    }));
    const rows = await ui.evaluate(() => {
      const seen = new Set();
      for (const node of document.querySelectorAll(".ht-model-picker > *")) {
        seen.add(Math.round(node.getBoundingClientRect().top));
      }
      return seen.size;
    });
    const shot = path.join(__dirname, "model-picker-390.png");
    await ui.locator(".ht-search").screenshot({ path: shot });
    const measured = {
      viewport_width: 390,
      picker_width: Math.round(box.width),
      picker_rows: rows,
      label_top: Math.round(label.y),
      select_top: Math.round(select.y),
      select_width: Math.round(select.width),
      root_scroll_width: overflow.root,
      viewport_inner_width: overflow.viewport,
    };
    console.log(JSON.stringify(measured, null, 2));
    assert.ok(box.width <= 390, "the picker row stays inside the viewport");
    assert.ok(overflow.root <= 391, "the page does not scroll sideways at 390px");
    assert.ok(select.width <= 390, "the select is capped to the viewport width");
    fs.writeFileSync(path.join(__dirname, "model-picker-390.json"), JSON.stringify(measured, null, 2) + "\n");
    console.log("screenshot: " + shot);
  } finally {
    await browser.close();
    await fixture.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
