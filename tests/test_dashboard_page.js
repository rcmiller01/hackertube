const test = require("node:test");
const assert = require("node:assert/strict");
const page = require("../hackertube/dashboard/dist/index.js");

test("public https destinations are allowed", () => {
  const decision = page.destinationDecision("https://openlibrary.org/works/OL66554W");
  assert.equal(decision.ok, true);
  assert.equal(decision.href, "https://openlibrary.org/works/OL66554W");
});

test("unsafe schemes are refused", () => {
  for (const value of ["javascript:alert(1)", "http://example.com/item", "file:///tmp/a", "data:text/html,hi"]) {
    const decision = page.destinationDecision(value);
    assert.equal(decision.ok, false, value);
    assert.equal(decision.reason, "scheme");
    assert.match(page.refusalMessage(decision), /does not use https/);
  }
});

test("private-network destinations are refused", () => {
  const samples = [
    "https://127.0.0.1/private",
    "https://localhost/a",
    "https://10.1.2.3/a",
    "https://192.168.0.5/a",
    "https://172.16.0.1/a",
    "https://169.254.1.1/a",
    "https://[::1]/a",
    "https://printer.local/a",
    "https://intranet/a",
  ];
  for (const value of samples) {
    const decision = page.destinationDecision(value);
    assert.equal(decision.ok, false, value);
    assert.equal(decision.reason, "private", value);
    assert.match(page.refusalMessage(decision), /private-network/);
  }
});

test("credentials in a destination are refused", () => {
  const decision = page.destinationDecision("https://user:pass@example.com/a");
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "invalid");
});

test("save is idempotent", () => {
  const clock = { current: 0 };
  const once = page.applySave({}, "ol:OL66554W", clock);
  const twice = page.applySave(once, "ol:OL66554W", clock);
  assert.equal(twice, once);
  assert.equal(Object.keys(once).length, 1);
  assert.equal(clock.current, 1);
});

test("dismiss does not duplicate and does not remove the id", () => {
  const once = page.applyDismiss({}, "ol:OL66554W");
  const twice = page.applyDismiss(once, "ol:OL66554W");
  assert.equal(twice, once);
  assert.equal(once["ol:OL66554W"], true);
});

test("section order is capture order and library is newest save first", () => {
  const items = [
    { item_id: "b", format: "video", capture_order: 2 },
    { item_id: "a", format: "video", capture_order: 1 },
    { item_id: "c", format: "book", capture_order: 3 },
  ];
  const section = page.SECTIONS[0];
  const feed = page.sectionItems(items, section, null);
  assert.deepEqual(feed.map((item) => item.item_id), ["a", "b"]);
  const saved = { b: { at: 1 }, a: { at: 2 } };
  const library = page.sectionItems(items, section, saved);
  assert.deepEqual(library.map((item) => item.item_id), ["a", "b"]);
});

test("show more keeps the first four until expanded", () => {
  const items = [1, 2, 3, 4, 5];
  assert.equal(page.visibleSlice(items, false, page.INITIAL_CARDS).length, 4);
  assert.equal(page.visibleSlice(items, true, page.INITIAL_CARDS).length, 5);
  assert.equal(page.visibleSlice([1, 2, 3], false, page.INITIAL_CARDS).length, 3);
});

test("hacker news evidence stays on the item it names", () => {
  const sources = [{ source_id: "hn", name: "Hacker News" }];
  const evidence = [{
    item_id: "youtube:W0NakShgbHY",
    source_id: "hn",
    kind: "community",
    endorsement: "established",
    display_line: "Recommended in Hacker News",
    destination: "https://news.ycombinator.com/item?id=26188584",
    retrieved_at: "2026-11-06T12:22:22Z",
  }];
  const named = page.presentEvidence({ item_id: "youtube:W0NakShgbHY", captured_at: "2026-11-06T12:22:22Z" }, evidence, sources);
  const other = page.presentEvidence({ item_id: "itunes:podcast:1840669662", captured_at: "2026-11-06T12:22:22Z" }, evidence, sources);
  assert.equal(named.kind, "endorsement");
  assert.equal(named.text, "Recommended in Hacker News");
  assert.equal(named.href, "https://news.ycombinator.com/item?id=26188584");
  assert.notEqual(other.kind, "endorsement");
});

test("hacker news endorsement is a link line and catalog evidence is a source candidate", () => {
  const sources = [
    { source_id: "hn", name: "Hacker News" },
    { source_id: "openlibrary", name: "Open Library" },
  ];
  const video = { item_id: "youtube:1", captured_at: "2026-11-06T12:22:23Z" };
  const endorsed = page.presentEvidence(video, [
    {
      item_id: "youtube:1",
      source_id: "hn",
      kind: "community",
      endorsement: "established",
      display_line: "Recommended in Hacker News",
      destination: "https://news.ycombinator.com/item?id=1",
      retrieved_at: "2026-11-06T12:22:22Z",
    },
  ], sources);
  assert.equal(endorsed.text, "Recommended in Hacker News");
  assert.equal(endorsed.href, "https://news.ycombinator.com/item?id=1");
  const book = { item_id: "ol:1", captured_at: "2026-11-06T12:22:21Z" };
  const candidate = page.presentEvidence(book, [
    {
      item_id: "ol:1",
      source_id: "openlibrary",
      kind: "catalog",
      endorsement: "not_applicable",
      display_line: null,
      destination: "https://openlibrary.org/works/OL1W",
      retrieved_at: "2026-11-06T12:22:21Z",
    },
  ], sources);
  assert.equal(candidate.text, "Source candidate");
  assert.equal(candidate.href, null);
  assert.equal(candidate.sourceName, "Open Library");
});

test("unknown duration and missing art stay unknown", () => {
  assert.equal(page.lengthLine({ format: "video", duration_seconds: null }), "Duration unknown");
  assert.equal(page.lengthLine({ format: "book", duration_seconds: null }), "Length unknown");
  assert.equal(page.lengthLine({ format: "podcast_show", duration_seconds: null }), null);
  assert.equal(page.formatDuration(4257), "1 hour 10 minutes 57 seconds");
  assert.equal(page.artFallback({ format: "video" }), "Video · YouTube");
  assert.equal(page.artFallback({ format: "podcast_show" }), "Podcast · show art unavailable");
  assert.equal(page.creatorLine({ format: "podcast_episode", contributors: null, show_id: "missing" }, {}), "Contributor unknown. Show: Show unknown");
});

test("demo question and disclosure text are the approved lines", () => {
  assert.equal(page.DEMO_QUESTION, "What can I read or listen to by Jane Austen?");
  assert.match(page.DISCLOSURE, /broader web/);
  assert.match(page.DISCLOSURE, /Browsing is free/);
});
