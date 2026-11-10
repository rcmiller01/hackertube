"use strict";
// YouTube branding receipt: real production bundle and plugin stylesheet plus the
// compiled Hermes host stylesheet; stub SDK components and a stub local API only.
// Captures Discover, the Videos section, Search results and Library at 390px and
// 1280px, and records the measured claims this card makes:
//   - the compact YouTube row shows the official linked Icon (>=100px mark,
//     >=44px tap target) beside the unaltered thumbnail;
//   - full cards and Search results show the unaltered thumbnail *and* the Icon;
//   - the short YouTube note is unchanged;
//   - the computed compact-badge display matches the Podcasts exception.
// The thumbnail image itself is an SVG fixture served for the host path; it is
// NOT a real YouTube image and this receipt makes no live request.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { startFixture, loadNodeModule, PIXEL_PNG } = require("../../../tests/browser_net_harness");
const out = __dirname;
const hostDir = "/Users/robert/.hermes/hermes-agent/hermes_cli/web_dist/assets";
const hostPath = process.env.HACKERTUBE_HOST_CSS || path.join(hostDir, fs.readdirSync(hostDir).filter(x => /^index-.*\.css$/.test(x))[0]);
const NOTE = "Metadata from YouTube. Explanations and library actions are HackerTube\u2019s.";
const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const WATCH = "https://www.youtube.com/watch?v=LCEmiRjPEtQ";

// A 16:9 fixture image, so an uncropped presentation keeps 4:3 letterboxing only
// if the source has it. 480x360 = 4:3, matching YouTube's hqdefault frame.
const THUMB_SVG = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <rect width="480" height="360" fill="#2b2b2b"/>
  <rect x="0" y="45" width="480" height="270" fill="#c4302b"/>
  <text x="24" y="200" font-family="Helvetica" font-size="26" fill="#ffffff">fixture thumbnail (not a real YouTube image)</text>
</svg>`;

const items = [
  { item_id: "youtube:LCEmiRjPEtQ", format: "video", title: "Jane Austen introduction", destination: WATCH,
    capture_order: 1, contributors: ["A channel"], duration_seconds: 600,
    art_url: THUMB, art_hotlink: true, art_http_status: 200, art_checked_at: "2026-11-06T12:22:23Z",
    art_cache: false, art_reason: "Display-cleared Data API thumbnail." },
  { item_id: "podcast:show", format: "podcast_show", title: "Austen Notes", destination: "https://example.com/show",
    capture_order: 2, contributors: [], duration_seconds: null, art_url: null, art_hotlink: false },
  { item_id: "podcast:episode", format: "podcast_episode", title: "Reading Jane Austen", destination: "https://example.com/episode",
    capture_order: 3, contributors: [], duration_seconds: 29522, art_url: null, art_hotlink: false },
  { item_id: "book:emma", format: "book", title: "Emma", destination: "https://openlibrary.org/works/OL66513W",
    capture_order: 4, contributors: ["Jane Austen"], duration_seconds: null, art_url: null, art_hotlink: false },
  { item_id: "audiobook:emma", format: "audiobook", title: "Emma, read aloud", destination: "https://librivox.org/emma",
    capture_order: 5, contributors: ["Jane Austen"], duration_seconds: 36000, art_url: null, art_hotlink: false },
];

const verified = {
  item_id: "youtube:LCEmiRjPEtQ", title: "Jane Austen introduction", format: "video", destination: WATCH,
  source: { source_id: "youtube", source_name: "YouTube", kind: "catalog", label: "YouTube", community_endorsement: false },
  constraint: "none", constraint_note: null, strict: true,
  state: { saved: false, dismissed: false, completed: false, opens: 0, label: null },
  why: ["Matched the question: jane austen"], verified: true,
};

const searchDocument = () => ({
  schema: "hackertube.search/1",
  provider: "stub",
  job: { job_id: "job:receipt", state: "succeeded", limits: { deadline_seconds: 45 } },
  sections: { videos: { label: "videos", verified: [verified], verified_count: 1, insufficient_evidence: false } },
  coverage: { verified: 1, formats_without_match: [], notes: [] },
  usage: { cost_known: true, cost_usd: 0, requests_used: 0, paid_calls: 0, request_counts: { free: 0, paid: 0, metered: 0 } },
});

async function revealControls(tab) {
  const controls = tab.locator("details.ht-feed-controls");
  await controls.waitFor();
  if (!(await controls.evaluate(el => el.open))) {
    const summary = controls.locator(":scope > summary");
    await summary.focus();
    await summary.press("Enter");
    await tab.waitForFunction(() => document.querySelector("details.ht-feed-controls").open);
  }
}

async function readThumb(tab, scope) {
  const thumb = tab.locator(scope + " img.ht-thumb").first();
  await thumb.waitFor();
  return thumb.evaluate(el => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      src: el.getAttribute("src"),
      className: el.getAttribute("class"),
      objectFit: style.objectFit,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      boxWidth: Math.round(box.width * 10) / 10,
      boxHeight: Math.round(box.height * 10) / 10,
      insideLink: !!el.closest("a"),
      childElements: el.querySelectorAll("*").length,
    };
  });
}

function assertUncropped(thumb, label) {
  assert.equal(thumb.src, THUMB, label + ": the stored Data API URL is hotlinked");
  assert.doesNotMatch(thumb.className || "", /ht-cover/, label + ": no cover fit class");
  assert.notEqual(thumb.objectFit, "cover", label + ": computed object-fit is not cover");
  assert.equal(thumb.insideLink, false, label + ": no play control or link over the image");
  assert.equal(thumb.childElements, 0, label + ": the image carries no overlay");
  const natural = thumb.naturalWidth / thumb.naturalHeight;
  const box = thumb.boxWidth / thumb.boxHeight;
  assert.ok(Math.abs(natural - box) < 0.02, label + ": rendered aspect matches the image (" + natural.toFixed(3) + " vs " + box.toFixed(3) + ")");
}

(async () => {
  const browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
  const measures = {
    scope: "Production bundle and stylesheet in a React fixture with stub SDK components and a stub local API, plus the compiled host stylesheet. Fixture images are served locally for the i.ytimg.com paths; this is not an installed dashboard, not a live-provider receipt, and not a real YouTube image.",
    hostStylesheet: hostPath,
    note: NOTE,
    viewports: [],
  };
  try {
    for (const width of [390, 1280]) {
      // A fresh profile per viewport: the save below must not leak into the
      // next run and turn the Save control into "Saved".
      const fixture = await startFixture(items);
      const tab = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await tab.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.hostname === "i.ytimg.com") return route.fulfill({ contentType: "image/svg+xml", body: THUMB_SVG() });
        if (url.origin !== fixture.origin) return route.abort();
        if (url.pathname === "/") {
          const response = await route.fetch();
          return route.fulfill({ response, body: (await response.text()).replace("<head>", '<head><link rel="stylesheet" href="/host.css">') });
        }
        if (url.pathname === "/host.css") return route.fulfill({ contentType: "text/css", body: fs.readFileSync(hostPath) });
        if (url.pathname === "/api/plugins/hackertube/catalog") {
          return route.fulfill({ json: { catalog: {
            items,
            evidence: items.map(item => ({ item_id: item.item_id, source_id: "fixture", kind: "catalog", endorsement: "not_applicable", retrieved_at: "2026-11-06T12:22:22Z" })),
            sources: [{ source_id: "fixture", name: "Recorded fixture" }],
            editions: [],
          } } });
        }
        if (url.pathname === "/api/plugins/hackertube/feed") {
          const sections = Object.fromEntries(["videos", "podcasts", "books", "audiobooks"].map(key => [key, { matches: [], browse: [], match_count: 0, browse_count: 0 }]));
          const group = { video: "videos", podcast_show: "podcasts", podcast_episode: "podcasts", book: "books", audiobook: "audiobooks" };
          for (const item of items) { const bucket = sections[group[item.format]]; bucket.matches.push(item.item_id); bucket.match_count++; }
          return route.fulfill({ json: { schema: "hackertube.discovery/1", personalized: true, paid_calls: 0,
            interests: ["Jane Austen"], signals: ["matched interest"], feed: items.map(item => item.item_id),
            why: Object.fromEntries(items.map(item => [item.item_id, ["Matched interest"]])), sections } });
        }
        if (url.pathname === "/api/plugins/hackertube/status") return route.fulfill({ json: { name: "HackerTube", data_root: "/tmp", model_key: "absent", provider: "stub" } });
        if (url.pathname === "/api/plugins/hackertube/search" && route.request().method() === "POST") return route.fulfill({ json: searchDocument() });
        if (url.pathname.indexOf("/api/plugins/hackertube/profile") === 0) return route.continue();
        if (url.pathname === "/api/model/auxiliary") return route.fulfill({ json: { tasks: [] } });
        if (url.pathname === "/api/plugins/hackertube/sources") return route.fulfill({ json: { sources: [] } });
        if (url.pathname === "/api/model/options") return route.fulfill({ json: { providers: [] } });
        return route.continue();
      });

      await tab.goto(fixture.origin);
      await tab.locator("#videos").waitFor();
      await tab.locator("#podcasts").waitFor();
      await tab.waitForTimeout(300);

      // --- Discover / sections -------------------------------------
      const compact = tab.locator("#videos .ht-compact").first();
      const iconLink = compact.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' });
      await iconLink.waitFor();
      const tap = await iconLink.evaluate(el => {
        const box = el.getBoundingClientRect();
        const mark = el.querySelector("img");
        return { width: Math.round(box.width), height: Math.round(box.height), markHeight: Math.round(mark.getBoundingClientRect().height), alt: mark.getAttribute("alt") };
      });
      assert.ok(tap.height >= 44 && tap.width >= 44, "compact tap target >= 44px: " + JSON.stringify(tap));
      assert.ok(tap.markHeight >= 100, "compact official mark >= 100px: " + tap.markHeight);
      assert.equal(tap.alt, "YouTube");
      const compactThumb = await readThumb(tab, "#videos .ht-compact");
      assertUncropped(compactThumb, "compact row");
      assert.equal(await compact.getByText(NOTE, { exact: true }).count(), 1, "compact row keeps the short note");

      const badges = {};
      for (const id of ["videos", "podcasts", "books", "audiobooks"]) {
        const badge = tab.locator("#" + id + " .ht-compact .ht-format").first();
        badges[id] = (await badge.count())
          ? await badge.evaluate(el => getComputedStyle(el).display)
          : null;
      }
      assert.equal(badges.videos, "none", "compact Videos badge is hidden");
      assert.equal(badges.books, "none", "compact Books badge is hidden");
      assert.equal(badges.audiobooks, "none", "compact Audiobooks badge is hidden");
      assert.notEqual(badges.podcasts, "none", "compact Podcasts badge is visible");
      const podcastLabels = await tab.locator("#podcasts .ht-compact .ht-format").allTextContents();
      assert.deepEqual(podcastLabels.slice().sort(), ["Episode", "Show"], "Podcasts keeps Show vs Episode");

      const fullThumb = await readThumb(tab, "#ranked-feed");
      assertUncropped(fullThumb, "full card");
      const fullCard = tab.locator("#ranked-feed article").first();
      assert.equal(await fullCard.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }).count(), 1, "full card keeps the linked Icon");
      assert.equal(await fullCard.getByText(NOTE, { exact: true }).count(), 1, "full card keeps the short note");

      await tab.screenshot({ path: path.join(out, `discover-${width}.png`), fullPage: true });
      await tab.locator("#videos").screenshot({ path: path.join(out, `videos-${width}.png`) });
      await tab.locator("#podcasts").screenshot({ path: path.join(out, `podcasts-${width}.png`) });

      // --- Search results -----------------------------------------
      await revealControls(tab);
      await tab.getByRole("button", { name: "Focused search", exact: true }).click();
      await tab.locator("#hackertube-question").fill("Jane Austen videos");
      await tab.locator("#hackertube-disclosure-ack").check();
      await tab.getByRole("button", { name: "Search", exact: true }).click();
      await tab.locator("#hackertube-results").waitFor();
      const results = tab.locator(".ht-result").first();
      await results.locator("article").waitFor();
      const searchThumb = await readThumb(tab, ".ht-result");
      assertUncropped(searchThumb, "search result");
      assert.equal(await results.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }).count(), 1, "search result keeps the linked Icon");
      assert.equal(await results.getByText(NOTE, { exact: true }).count(), 1, "search result keeps the short note");
      await tab.locator("#hackertube-results").screenshot({ path: path.join(out, `search-${width}.png`) });

      // --- Library -------------------------------------------------
      await tab.locator("#ranked-feed").getByRole("button", { name: "Save", exact: true }).first().click();
      await tab.waitForTimeout(300);
      await tab.locator('a[href="#library"]').first().click();
      await tab.locator("#library").waitFor();
      await tab.waitForFunction(() => document.getElementById("videos").textContent.includes("Jane Austen introduction"));
      const libraryThumb = await readThumb(tab, "#videos");
      assertUncropped(libraryThumb, "library card");
      await tab.screenshot({ path: path.join(out, `library-${width}.png`), fullPage: true });

      measures.viewports.push({ width, compactTapTarget: tap, compactThumb, fullThumb, searchThumb, libraryThumb, badges, podcastLabels });
      await tab.close();
      await fixture.close();
    }
    fs.writeFileSync(path.join(out, "geometry.json"), JSON.stringify(measures, null, 2) + "\n");
    console.log(JSON.stringify(measures, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
