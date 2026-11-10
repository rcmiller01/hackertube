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
        // A real /feed document carries all four section groups; acceptDiscovery
        // rejects an incomplete one, which would leave a stale error in the
        // status region instead of the feed-update announcement.
        return respond({ schema: "hackertube.discovery/1", personalized: true, interests: ["Jane Austen"],
          feed: [item.item_id], why: { [item.item_id]: ["Matched interest"] }, signals: ["matched interest"],
          sections: {
            videos: { matches: [], browse: [], match_count: 0, browse_count: 0 },
            podcasts: { matches: [], browse: [], match_count: 0, browse_count: 0 },
            books: { matches: [item.item_id], browse: [], match_count: 1, browse_count: 0 },
            audiobooks: { matches: [], browse: [], match_count: 0, browse_count: 0 },
          } });
      }
      return route.continue();
    });
    await tab.goto(fixture.origin);
    await tab.locator("#ranked-feed").getByText("Book 1", { exact: true }).waitFor();
    await tab.getByRole("button", { name: "Focused search", exact: true }).click();
    await tab.locator("#hackertube-question").fill("Jane Austen books");
    await tab.locator("#hackertube-disclosure-ack").check();
    await tab.getByRole("button", { name: "Search", exact: true }).click();
    const panel = tab.locator("details.ht-feed-controls");
    const toggle = panel.locator("summary");
    await toggle.waitFor({ timeout: 1000 });
    await toggle.focus();
    await toggle.press("Enter");
    await tab.waitForFunction(() => !document.querySelector("details.ht-feed-controls").open);
    assert.equal(await tab.locator("#hackertube-question").isVisible(), false);
    await tab.locator("#ranked-feed").getByText("New search discovery", { exact: true }).waitFor({ timeout: 5000 });
    assert.deepEqual(reads, { feed: 1, catalog: 1, starts: 1 });
    // N1: a Search that ends while the controls are collapsed expands them, so
    // its results and the feed update are reachable.
    assert.notEqual(await panel.getAttribute("open"), null, "a finished Search expands the collapsed controls");
    await tab.locator("#hackertube-question").waitFor({ state: "visible" });
    assert.equal(await tab.locator("#hackertube-question").inputValue(), "Jane Austen books");
    assert.equal(
      await tab.evaluate(() => document.activeElement && document.activeElement.textContent),
      "Search results",
      "the results heading takes focus",
    );
    assert.equal(await tab.locator(".ht-status").textContent(), "Feed updated from this search.");
    assert.equal(await tab.locator("#hackertube-results").getByText("Search running.", { exact: true }).count(), 0);
    assert.equal(await toggle.isVisible(), true, "the controls summary remains visible");
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
});

test("PREF16 interest remove button works by keyboard and stays removed after reload", async () => {
  const { startFixture, loadNodeModule } = require("./browser_net_harness");
  const fixture = await startFixture(fixtureItems(1));
  let browser;
  try {
    browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
    const tab = await browser.newPage();
    await tab.route("https://covers.openlibrary.org/**", route => route.abort());
    await tab.goto(fixture.origin);
    const remove = tab.getByRole("button", { name: "Remove interest Jane Austen", exact: true });
    await remove.waitFor();
    const previousReads = fixture.served.filter(row => row.path.endsWith("/feed")).length;
    await remove.focus();
    await remove.press("Enter");
    await remove.waitFor({ state: "detached" });
    await tab.waitForFunction(() => document.querySelector(".ht-interest-list") === null);
    assert.equal(fixture.served.filter(row => row.path.endsWith("/feed")).length, previousReads + 1);
    await tab.reload();
    await tab.getByRole("heading", { name: "Interests", exact: true }).waitFor();
    assert.equal(await tab.getByRole("button", { name: "Remove interest Jane Austen", exact: true }).count(), 0);
    assert.equal(fixture.served.filter(row => row.path.endsWith("/search")).length, 0);
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
});

test("FEED12 two consecutive searches announce the feed update once each, only after the refresh is accepted", async () => {
  const { startFixture, loadNodeModule } = require("./browser_net_harness");
  const fixture = await startFixture(fixtureItems(1).map((item) => ({ ...item, art_url: null })));
  let browser;
  try {
    browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
    const tab = await browser.newPage();
    const item = { ...fixtureItems(1)[0], title: "New search discovery", art_url: null };
    const feedDocument = () => ({
      schema: "hackertube.discovery/1",
      personalized: true,
      interests: ["Jane Austen"],
      feed: [item.item_id],
      why: { [item.item_id]: ["Matched interest"] },
      signals: ["matched interest"],
      sections: {
        videos: { matches: [], browse: [], match_count: 0, browse_count: 0 },
        podcasts: { matches: [], browse: [], match_count: 0, browse_count: 0 },
        books: { matches: [item.item_id], browse: [], match_count: 1, browse_count: 0 },
        audiobooks: { matches: [], browse: [], match_count: 0, browse_count: 0 },
      },
    });
    const searchDocument = (jobId) => ({
      schema: "hackertube.search/1",
      provider: "stub",
      job: { job_id: jobId, state: "succeeded", limits: { deadline_seconds: 45 } },
      sections: {},
      results: [],
      coverage: { verified: 0, formats_without_match: [], notes: [] },
      usage: { cost_known: false, requests_used: 1, paid_calls: 0, request_counts: { free: 0, paid: 0, metered: 0 } },
    });
    const base = "/api/plugins/hackertube";
    const held = [];
    let searches = 0;
    await tab.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== fixture.origin) return route.abort();
      if (url.pathname === base + "/status") return route.fulfill({ json: { provider: "hermes" } });
      if (url.pathname === base + "/search" && request.method() === "POST") {
        searches += 1;
        return route.fulfill({ json: searchDocument("job:" + searches) });
      }
      // Every search-triggered refresh is held until the test releases it, so
      // the announcement can be observed as absent while the read is in flight.
      if (url.pathname === base + "/feed" && searches > 0) {
        held.push(route);
        return;
      }
      return route.continue();
    });
    const waitForHeld = async () => {
      const start = Date.now();
      while (held.length === 0) {
        if (Date.now() - start > 5000) throw new Error("the search-triggered feed read was not issued");
        await tab.waitForTimeout(50);
      }
    };
    await tab.goto(fixture.origin);
    await tab.locator("#ranked-feed").getByText("Book 1", { exact: true }).waitFor();
    await tab.getByRole("button", { name: "Focused search", exact: true }).click();
    await tab.locator("#hackertube-question").fill("Jane Austen books");
    await tab.locator("#hackertube-disclosure-ack").check();
    await tab.evaluate(() => {
      window.__feedNotice = [];
      new MutationObserver(() => {
        window.__feedNotice.push(document.querySelector(".ht-status").textContent);
      }).observe(document.querySelector(".ht-status"), { childList: true, characterData: true, subtree: true });
    });
    await tab.getByRole("button", { name: "Search", exact: true }).click();
    await waitForHeld();
    assert.equal(held.length, 1, "the first Search re-reads the feed");
    assert.notEqual(
      await tab.locator(".ht-status").textContent(),
      "Feed updated from this search.",
      "no notice is written while the first refresh is still in flight",
    );
    assert.deepEqual(
      await tab.evaluate(() => window.__feedNotice),
      [],
      "the polite status region stays quiet until the refresh is accepted",
    );
    await held.shift().fulfill({ json: feedDocument() });
    await tab.waitForFunction(() => document.querySelector(".ht-status").textContent === "Feed updated from this search.");
    const firstChanges = await tab.evaluate(() => window.__feedNotice);
    assert.ok(firstChanges.length > 0, "the accepted refresh announces once");
    assert.equal(firstChanges[firstChanges.length - 1], "Feed updated from this search.");
    await tab.locator("#ranked-feed").getByText("Book 1", { exact: true }).waitFor();
    // A second distinct Search: its sentence is identical to the one already in
    // the region, so a fresh announcement needs a fresh live-region change.
    await tab.evaluate(() => { window.__feedNotice = []; });
    await tab.getByRole("button", { name: "Search", exact: true }).click();
    await waitForHeld();
    assert.equal(held.length, 1, "the second Search re-reads the feed");
    assert.deepEqual(
      await tab.evaluate(() => window.__feedNotice),
      [],
      "the second refresh is still in flight and says nothing yet",
    );
    await held.shift().fulfill({ json: feedDocument() });
    await tab.waitForFunction(() => document.querySelector(".ht-status").textContent === "Feed updated from this search.");
    const secondChanges = await tab.evaluate(() => window.__feedNotice);
    // The second Search's sentence is the one the region already held, so the
    // fresh announcement is a blank followed by the sentence again.
    assert.ok(secondChanges.includes(""), "the region is blanked for the second announcement");
    assert.equal(secondChanges[secondChanges.length - 1], "Feed updated from this search.");
    assert.equal(await tab.locator(".ht-status").textContent(), "Feed updated from this search.");
    assert.equal(searches, 2, "exactly two searches ran");
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
