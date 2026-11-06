"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fixtureItems, labelOf, runBrowserWalk } = require("./browser_net_harness");

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
