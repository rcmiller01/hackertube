"use strict";
// Clean-profile render: loads the dashboard assets installed in a fresh
// HERMES_HOME (not the working tree) and exercises both thumbnail failure
// paths. This is the browser half of the clean-profile probe;
// clean_profile_probe.py is the backend half.
//
//   failure 1: a thumbnail URL on a host that is not i.ytimg.com/img.youtube.com
//   failure 2: an official-host thumbnail that fails to load
//
// In both cases the row keeps the linked official Icon, no broken image, and the
// short YouTube note. Failure 1 must also make no request to the foreign host.
const assert = require("node:assert/strict");
const { startFixture, loadNodeModule, THUMB_PNG } = require("../../../tests/browser_net_harness");

const home = process.env.HERMES_HOME;
const page = process.env.HACKERTUBE_PAGE_PATH;
const style = process.env.HACKERTUBE_STYLE_PATH;
if (!home || !page || !style) {
  console.error("HERMES_HOME, HACKERTUBE_PAGE_PATH and HACKERTUBE_STYLE_PATH are required");
  process.exit(2);
}

const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const FOREIGN = "https://images.example.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const NOTE = "Metadata from YouTube. Explanations and library actions are HackerTube\u2019s.";
const base = {
  item_id: "youtube:LCEmiRjPEtQ",
  format: "video",
  title: "Jane Austen introduction",
  destination: "https://www.youtube.com/watch?v=LCEmiRjPEtQ",
  capture_order: 1,
  contributors: ["A channel"],
  duration_seconds: null,
  art_hotlink: true,
  art_http_status: 200,
  art_checked_at: "2026-11-06T12:22:23Z",
};

async function assertFallback(browser, artUrl, routeRule, label) {
  const fixture = await startFixture([{ ...base, art_url: artUrl }]);
  const record = { label };
  try {
    const tab = await browser.newPage();
    await routeRule(tab);
    await tab.goto(fixture.origin);
    await tab.locator("#ranked-feed article").first().waitFor();
    const card = tab.locator("#ranked-feed article").first();
    record.fullCardThumbs = await card.locator("img.ht-thumb").count();
    record.fullCardIcon = await card.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }).count();
    record.fullCardNote = await card.locator(".ht-note").textContent();
    record.fullCardIconBox = await card.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }).boundingBox();
    const row = tab.locator("#videos .ht-compact").first();
    await row.waitFor();
    record.compactThumbs = await row.locator("img.ht-thumb").count();
    record.compactIcon = await row.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }).count();
    record.compactNote = await row.locator(".ht-note").textContent();
    assert.equal(record.fullCardThumbs, 0, label + ": the full card has no broken image hole");
    assert.equal(record.fullCardIcon, 1, label + ": the full card keeps the linked Icon");
    assert.ok(record.fullCardIconBox && record.fullCardIconBox.height > 0, label + ": the Icon is laid out");
    assert.equal(record.fullCardNote, NOTE, label + ": the short note remains");
    assert.equal(record.compactThumbs, 0, label + ": the compact row has no broken image hole");
    assert.equal(record.compactIcon, 1, label + ": the compact row keeps the linked Icon");
    assert.equal(record.compactNote, NOTE, label + ": the compact row keeps the short note");
    return record;
  } finally {
    await fixture.close();
  }
}

(async () => {
  const browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
  const record = { home, page, style };
  try {
    let foreignRequests = 0;
    record.foreignHost = await assertFallback(browser, FOREIGN, async (tab) => {
      await tab.route("https://images.example.com/**", (route) => {
        foreignRequests += 1;
        return route.fulfill({ status: 200, contentType: "image/png", body: THUMB_PNG });
      });
    }, "non-YouTube host");
    assert.equal(foreignRequests, 0, "the foreign host is never requested");
    record.foreignHost.foreignRequests = foreignRequests;

    record.failedLoad = await assertFallback(browser, THUMB, async (tab) => {
      await tab.route("https://i.ytimg.com/**", (route) => route.abort());
    }, "official host, image fails to load");
    console.log(JSON.stringify(record, null, 2));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
