"use strict";
// Post-#30 follow-up: real production bundle and plugin stylesheet plus the compiled
// Hermes host stylesheet; stub SDK components and stub local API only.
// Records the computed `display` of the compact format badge in Podcasts vs Videos
// and writes the 390px section screenshots the card asks for.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { startFixture, loadNodeModule } = require("../../../tests/browser_net_harness");
const out = __dirname;
const hostDir = "<hermes-home>/hermes-agent/hermes_cli/web_dist/assets";
const hostPath = process.env.HACKERTUBE_HOST_CSS || path.join(hostDir, fs.readdirSync(hostDir).filter(x => /^index-.*\.css$/.test(x))[0]);

const items = [
  { item_id: "youtube:visual", format: "video", title: "Jane Austen introduction", destination: "https://www.youtube.com/watch?v=visual", capture_order: 1, contributors: ["Someone"], duration_seconds: 600, art_url: null, art_hotlink: false },
  { item_id: "podcast:show", format: "podcast_show", title: "Austen Notes", destination: "https://example.com/show", capture_order: 2, contributors: [], duration_seconds: null, art_url: null, art_hotlink: false },
  { item_id: "podcast:episode", format: "podcast_episode", title: "Reading Jane Austen", destination: "https://example.com/episode", capture_order: 3, contributors: [], duration_seconds: 29522, art_url: null, art_hotlink: false },
];

(async () => {
  const fixture = await startFixture(items);
  const browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
  const measures = {
    hostStylesheet: hostPath,
    scope: "Production bundle and stylesheet in React fixture with stub SDK/API, plus the compiled host stylesheet. Not an installed dashboard or a live-provider claim.",
    viewports: [],
  };
  try {
    for (const width of [390, 1280]) {
      const tab = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await tab.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== fixture.origin) return route.abort();
        if (url.pathname === "/") {
          const response = await route.fetch();
          return route.fulfill({ response, body: (await response.text()).replace("<head>", '<head><link rel="stylesheet" href="/host.css">') });
        }
        if (url.pathname === "/host.css") return route.fulfill({ contentType: "text/css", body: fs.readFileSync(hostPath) });
        if (url.pathname === "/api/plugins/hackertube/catalog") return route.fulfill({ json: { catalog: { items, evidence: items.map(item => ({ item_id: item.item_id, source_id: "fixture", kind: "catalog", endorsement: "not_applicable", retrieved_at: "2026-11-06T12:22:22Z" })), sources: [{ source_id: "fixture", name: "Recorded fixture" }], editions: [] } } });
        if (url.pathname === "/api/plugins/hackertube/feed") {
          const sections = Object.fromEntries(["videos", "podcasts", "books", "audiobooks"].map(key => [key, { matches: [], browse: [], match_count: 0, browse_count: 0 }]));
          const group = { video: "videos", podcast_show: "podcasts", podcast_episode: "podcasts" };
          for (const item of items) { const bucket = sections[group[item.format]]; bucket.matches.push(item.item_id); bucket.match_count++; }
          return route.fulfill({ json: { schema: "hackertube.discovery/1", personalized: true, paid_calls: 0, interests: ["Jane Austen"], signals: ["matched interest"], feed: items.map(item => item.item_id), why: Object.fromEntries(items.map(item => [item.item_id, ["Matched interest"]])), sections } });
        }
        if (url.pathname === "/api/model/auxiliary") return route.fulfill({ json: { tasks: [] } });
        if (url.pathname === "/api/plugins/hackertube/sources") return route.fulfill({ json: { sources: [] } });
        if (url.pathname === "/api/model/options") return route.fulfill({ json: { providers: [] } });
        return route.continue();
      });
      await tab.goto(fixture.origin);
      await tab.locator("#podcasts").waitFor();
      await tab.locator("#videos").waitFor();
      await tab.waitForTimeout(300);

      const read = async selector => {
        const nodes = tab.locator(selector);
        const count = await nodes.count();
        if (!count) return { count, badgeText: [], display: null };
        return {
          count,
          badgeText: await nodes.evaluateAll(list => list.map(el => el.textContent.trim())),
          display: await nodes.first().evaluate(el => getComputedStyle(el).display),
        };
      };

      const podcasts = await read("#podcasts .ht-compact .ht-format");
      const videos = await read("#videos .ht-compact .ht-format");
      const fullCards = await read("#ranked-feed .ht-card:not(.ht-compact) .ht-format");

      // Podcasts mixes shows and episodes: the badge is the only Show/Episode signal.
      assert.ok(podcasts.count >= 2, "compact Podcasts rows keep the badge node");
      assert.deepEqual(podcasts.badgeText.slice().sort(), ["Episode", "Show"], "Show vs Episode badge text");
      assert.notEqual(podcasts.display, "none", "the Podcasts compact badge is visible");
      assert.ok(videos.count >= 1, "compact Videos rows keep the badge node");
      assert.equal(videos.display, "none", "the Videos compact badge is hidden");
      assert.ok(fullCards.count >= 1, "full cards carry the badge");
      assert.notEqual(fullCards.display, "none", "full card badge stays visible");

      await tab.screenshot({ path: path.join(out, `discover-${width}.png`), fullPage: true });
      await tab.locator("#podcasts").screenshot({ path: path.join(out, `podcasts-${width}.png`) });
      await tab.locator("#videos").screenshot({ path: path.join(out, `videos-${width}.png`) });

      measures.viewports.push({ width, podcasts, videos, fullCards });
      await tab.close();
    }
    fs.writeFileSync(path.join(out, "geometry.json"), JSON.stringify(measures, null, 2) + "\n");
    console.log(JSON.stringify(measures, null, 2));
  } finally { await browser.close(); await fixture.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
