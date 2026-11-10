"use strict";
// Clean-profile render: loads the dashboard assets installed in a fresh
// HERMES_HOME (not the working tree), renders a YouTube item whose thumbnail
// URL fails, and checks the fallback. This is the browser half of the
// clean-profile probe; clean_profile_probe.py is the backend half.
const path = require("node:path");
const assert = require("node:assert/strict");
const { startFixture, loadNodeModule } = require("../../../tests/browser_net_harness");

const home = process.env.HERMES_HOME;
const page = process.env.HACKERTUBE_PAGE_PATH;
const style = process.env.HACKERTUBE_STYLE_PATH;
if (!home || !page || !style) {
  console.error("HERMES_HOME, HACKERTUBE_PAGE_PATH and HACKERTUBE_STYLE_PATH are required");
  process.exit(2);
}

const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const item = {
  item_id: "youtube:LCEmiRjPEtQ",
  format: "video",
  title: "Jane Austen introduction",
  destination: "https://www.youtube.com/watch?v=LCEmiRjPEtQ",
  capture_order: 1,
  contributors: ["A channel"],
  duration_seconds: null,
  art_url: THUMB,
  art_hotlink: true,
  art_http_status: 200,
  art_checked_at: "2026-11-06T12:22:23Z",
};

(async () => {
  const fixture = await startFixture([item]);
  const browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
  const record = { home, page, style, note: item.title };
  try {
    const tab = await browser.newPage();
    await tab.route("https://i.ytimg.com/**", route => route.abort());
    await tab.goto(fixture.origin);
    await tab.locator("#ranked-feed article").first().waitFor();
    await tab.waitForFunction(() => !document.querySelector("#ranked-feed img.ht-thumb"));
    const card = tab.locator("#ranked-feed article").first();
    record.thumbnailRemoved = (await card.locator("img.ht-thumb").count()) === 0;
    const icon = card.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' });
    await icon.waitFor();
    record.iconPresent = true;
    record.iconBox = await icon.boundingBox();
    record.brandBlock = await card.locator(".ht-art.ht-youtube-brand").boundingBox();
    record.noteText = await card.locator(".ht-note").textContent();
    assert.equal(record.thumbnailRemoved, true, "the failed thumbnail is removed");
    assert.ok(record.iconBox && record.iconBox.width > 0 && record.iconBox.height > 0, "the linked Icon is laid out");
    assert.ok(record.brandBlock && record.brandBlock.height >= 180, "the brand block keeps its height");
    assert.equal(record.noteText, "Metadata from YouTube. Explanations and library actions are HackerTube\u2019s.");
    // The compact row in the Videos section falls back the same way.
    const row = tab.locator("#videos .ht-compact").first();
    await row.waitFor();
    record.compactThumbs = await row.locator("img.ht-thumb").count();
    record.compactIcon = await row.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }).count();
    assert.equal(record.compactThumbs, 0, "the compact row has no broken image hole");
    assert.equal(record.compactIcon, 1, "the compact row keeps the linked Icon");
    console.log(JSON.stringify(record, null, 2));
  } finally {
    await browser.close();
    await fixture.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
