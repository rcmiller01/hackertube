"use strict";
// MODELPICKER01: a <select>'s intrinsic min-content width equals its widest
// option, so a long model id must not widen the picker row, the search form or
// the search column past a narrow viewport. The defect is invisible to root
// scrollWidth because the host clips overflow, so this asserts each box's own
// measured width and its internal clipping, not only the document width.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startFixture, fixtureItems, loadNodeModule } = require("./browser_net_harness");

const HOST_CSS = process.env.HACKERTUBE_HOST_CSS || path.join(
  process.env.HOME, ".hermes", "hermes-agent", "hermes_cli", "web_dist", "assets", "index-CXKdN8QE.css");
const LONG_MODEL = "offline-fixture/long-model-id-for-narrow-viewport-verification-2026-11-context-extended";
const VIEWPORT = 390;

async function measure(hostCssText) {
  const fixture = await startFixture(fixtureItems(1));
  let browser;
  try {
    browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
    const ui = await browser.newPage({ viewport: { width: VIEWPORT, height: 844 }, deviceScaleFactor: 2 });
    await ui.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== fixture.origin) return route.abort();
      if (url.pathname === "/") {
        const response = await route.fetch();
        return route.fulfill({ response, body: (await response.text()).replace(
          '<link rel="stylesheet" href="/style.css">',
          '<link rel="stylesheet" href="/host-dashboard.css"><link rel="stylesheet" href="/style.css">') });
      }
      if (url.pathname === "/host-dashboard.css") return route.fulfill({ contentType: "text/css", body: hostCssText });
      if (url.pathname === "/api/model/auxiliary") return route.fulfill({ json: { tasks: [] } });
      if (url.pathname === "/api/model/options") return route.fulfill({ json: { providers: [
        { slug: "stub", label: "Offline stub", authenticated: true, models: [LONG_MODEL] } ] } });
      return route.continue();
    });
    await ui.goto(fixture.origin);
    await ui.getByRole("button", { name: "Focused search", exact: true }).click();
    const select = ui.locator("#hackertube-search-model");
    await select.selectOption(JSON.stringify(["stub", LONG_MODEL]));
    await ui.evaluate(() => document.fonts.ready);
    return await ui.evaluate((viewport) => {
      const SELECTORS = [".hackertube", ".ht-search", "form#hackertube-search-panel",
        ".ht-model-picker", "#hackertube-search-model"];
      const boxes = SELECTORS.map(selector => {
        const el = document.querySelector(selector);
        if (!el) return { selector, missing: true };
        return {
          selector,
          rect_w: el.getBoundingClientRect().width,
          client_w: el.clientWidth,
          scroll_w: el.scrollWidth,
          // internal clipping: content wider than the box's own content area
          clipped: el.scrollWidth > el.clientWidth + 0.5,
          // horizontal overflow past the viewport (the masked failure mode)
          beyond_viewport: el.getBoundingClientRect().right > viewport + 0.5,
        };
      });
      const select = document.querySelector("#hackertube-search-model");
      return {
        viewport,
        document_scroll_width: document.documentElement.scrollWidth,
        host_stylesheet_loaded: [...document.styleSheets].some(s => s.href && s.href.endsWith("/host-dashboard.css") && s.cssRules.length > 0),
        selected_value: select.value,
        selected_label: select.selectedOptions[0].textContent,
        boxes,
      };
    }, VIEWPORT);
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
}

test("MODELPICKER01 a long model id stays inside the 390px search column",
  { skip: fs.existsSync(HOST_CSS) ? false : `real host stylesheet not present: ${HOST_CSS} (set HACKERTUBE_HOST_CSS)` },
  async () => {
    const result = await measure(fs.readFileSync(HOST_CSS, "utf8"));

    assert.equal(result.host_stylesheet_loaded, true,
      "the real host dashboard stylesheet must be applied for this regression to be meaningful");
    assert.equal(result.selected_value, JSON.stringify(["stub", LONG_MODEL]),
      "the long synthetic model id must be the selected value");

    // Root width alone is not enough: the host clips overflow-x, so a broken
    // layout can keep document scrollWidth at the viewport while its children
    // are far wider. Assert both the root and every owning box.
    assert.ok(result.document_scroll_width <= VIEWPORT,
      `document scrollWidth ${result.document_scroll_width} exceeds the ${VIEWPORT}px viewport`);

    for (const box of result.boxes) {
      assert.ok(!box.missing, `${box.selector} must be present`);
      assert.ok(!box.clipped,
        `${box.selector} clips its own content: scrollWidth ${box.scroll_w} > clientWidth ${box.client_w}`);
      assert.ok(!box.beyond_viewport,
        `${box.selector} extends past the ${VIEWPORT}px viewport: rect width ${box.rect_w}`);
      assert.ok(box.rect_w <= VIEWPORT + 0.5,
        `${box.selector} is wider than the viewport: ${box.rect_w}px`);
    }
  });
