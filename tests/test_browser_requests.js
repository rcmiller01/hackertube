"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fixtureItems, labelOf, runBrowserWalk } = require("./browser_net_harness");

test("FEED11 background Search completion updates the rendered feed without a reload", async () => {
  const { startFixture, loadNodeModule } = require("./browser_net_harness");
  const fixture = await startFixture(fixtureItems(1).map(item => ({ ...item, art_url: null })));
  let browser;
  try {
    browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
    const tab = await browser.newPage();
    let completed = false;
    const reads = { feed: 0, catalog: 0, starts: 0 };
    const item = { ...fixtureItems(1)[0], title: "New search discovery", art_url: null };
    await tab.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== fixture.origin) return route.abort();
      const respond = body => route.fulfill({ json: body });
      const base = "/api/plugins/hackertube";
      if (url.pathname === base + "/status") return respond({ provider: "hermes" });
      if (url.pathname === base + "/search") {
        if (request.method() !== "POST") return respond({ job: null });
        reads.starts++;
        return respond({ job: { job_id: "job:browser", state: "running", limits: { deadline_seconds: 45 } } });
      }
      if (url.pathname === base + "/search/jobs/job%3Abrowser") {
        completed = true;
        return respond({ schema: "hackertube.search/1", job: { job_id: "job:browser", state: "succeeded" }, sections: {} });
      }
      if (completed && url.pathname === base + "/catalog") {
        reads.catalog++;
        return respond({ catalog: { items: [item], evidence: [], sources: [], editions: [] } });
      }
      if (completed && url.pathname === base + "/feed") {
        reads.feed++;
        return respond({ schema: "hackertube.discovery/1", personalized: true, interests: ["Jane Austen"],
          feed: [item.item_id], why: { [item.item_id]: ["Matched interest"] }, signals: ["matched interest"],
          sections: { books: { matches: [item.item_id], browse: [], match_count: 1, browse_count: 0 } } });
      }
      return route.continue();
    });
    await tab.goto(fixture.origin);
    await tab.locator("#ranked-feed").getByText("Book 1", { exact: true }).waitFor();
    await tab.getByRole("button", { name: "Focused search", exact: true }).click();
    await tab.locator("#hackertube-question").fill("Jane Austen books");
    await tab.locator("#hackertube-disclosure-ack").check();
    await tab.getByRole("button", { name: "Search", exact: true }).click();
    await tab.locator("#ranked-feed").getByText("New search discovery", { exact: true }).waitFor({ timeout: 5000 });
    assert.deepEqual(reads, { feed: 1, catalog: 1, starts: 1 });
    assert.equal(await tab.locator("#hackertube-results").getByText("Search running.", { exact: true }).count(), 0);
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
});

test("browser inventory refuses unknown destinations, routes and artwork queries", () => {
  const fixture = { origin: "http://127.0.0.1:1234" };
  assert.equal(labelOf(fixture.origin + "/api/plugins/hackertube/feed", fixture), "local");
  assert.equal(labelOf("https://covers.openlibrary.org/b/id/1001-M.jpg", fixture), "free");
  for (const url of ["https://api.openai.com/v1/responses", "https://www.googleapis.com/youtube/v3/videos",
    "https://unknown.example/image.png", fixture.origin + "/unknown",
    "https://covers.openlibrary.org/b/id/1001-M.jpg?personal=context"]) {
    assert.equal(labelOf(url, fixture), "outside", url);
  }
});

test("observer catches a rendered artwork request outside the approved inventory", async () => {
  const items = fixtureItems();
  items[0].art_url = "https://unapproved.example/artwork.jpg";
  const record = await runBrowserWalk(items);
  assert.ok(record.outside.includes(items[0].art_url));
  assert.ok(record.phases.some((phase) => phase.requests.some((r) => r.label === "outside")));
  // The normal receipt's no-outside assertion would fail on this record.
  assert.throws(() => assert.deepEqual(record.outside, []));
});

test("FEED04 browser requests include artwork and match independent server/interception counts", async () => {
  const record = await runBrowserWalk(fixtureItems());
  assert.deepEqual(record.outside, []);
  assert.equal(record.counters.paid, 0);
  assert.equal(record.counters.metered, 0);
  assert.ok(record.counters.free > 0, "artwork must not be disabled in this receipt");
  assert.equal(record.counters.free, record.artwork.length);
  assert.equal(record.rendered.at_load.length, 4); // page's initial card limit
  assert.equal(record.reopened.ranked_mentions_dismissed_item, false);
  assert.equal(record.reopened.library_mentions_saved_item, true);
  assert.equal(record.reopened.library_mentions_dismissed_item, false);
  assert.equal(record.requests.length, record.counters.local + record.counters.free);
  const recordedRequests = record.phases.flatMap((phase) => phase.requests);
  assert.equal(recordedRequests.length, record.requests.length);
  for (const phase of record.phases) {
    assert.deepEqual(phase.outside, [], phase.phase);
    assert.equal(phase.requests.filter((r) => r.label === "local").length, phase.served.length, phase.phase);
    assert.equal(phase.requests.filter((r) => r.label === "free").length, phase.artwork.length, phase.phase);
    assert.ok(phase.requests.every((r) => r.label === "local" || r.label === "free"), phase.phase);
  }
  for (const name of ["show more", "section browse"]) {
    const phase = record.phases.find((phase) => phase.phase === name);
    assert.equal(phase.served.length, 0, name + " must not dispatch an API request");
  }
});
