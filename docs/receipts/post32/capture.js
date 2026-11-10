"use strict";
// Post-#32 receipt: the real production bundle and plugin stylesheet plus the
// compiled Hermes host stylesheet; stub SDK components and a stub local API only.
//
// Records the measured claims this card makes, at 390px and 1280px:
//   - the compact row's VISIBLE red mark (not the PNG file box) is >= 100px;
//   - at 640px and up the logo + thumbnail share a side column beside the text,
//     and at 390px the art stacks above the text;
//   - the compact row height, so this card can compare it with #32;
//   - the thumbnail is unaltered (no radius/clip/filter on it or an ancestor).
//
// The thumbnail image is an SVG fixture served for the host path; it is NOT a
// real YouTube image and this receipt makes no live request.
//
// Usage:
//   node capture.js --label head --shots     # writes geometry-head.json + PNGs
//   node capture.js --label base            # writes geometry-base.json only
// Asset paths come from HACKERTUBE_PAGE_PATH / HACKERTUBE_STYLE_PATH (the
// harness reads them), so the base run points at the #32 files.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { startFixture, loadNodeModule } = require("../../../tests/browser_net_harness");

const out = __dirname;
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const label = arg("--label", "head");
const shots = args.includes("--shots");
const hostDir = "/Users/robert/.hermes/hermes-agent/hermes_cli/web_dist/assets";
const hostPath = process.env.HACKERTUBE_HOST_CSS
  || path.join(hostDir, fs.readdirSync(hostDir).filter(x => /^index-.*\.css$/.test(x))[0]);
const NOTE = "Metadata from YouTube. Explanations and library actions are HackerTube\u2019s.";
const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const WATCH = "https://www.youtube.com/watch?v=LCEmiRjPEtQ";

const THUMB_SVG = () => `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
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
    const offenders = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.clipPath && s.clipPath !== "none") offenders.push("clip-path:" + s.clipPath);
      if (s.filter && s.filter !== "none") offenders.push("filter:" + s.filter);
      const overflow = [s.overflow, s.overflowX, s.overflowY];
      if (overflow.some(v => v === "hidden" || v === "clip")) {
        const radius = s.borderRadius || "0px";
        if (!/^0px(\s+0px)*$/.test(radius.trim())) offenders.push("radius:" + radius);
      }
      if (node.tagName === "ARTICLE" || node.classList.contains("ht-card")) break;
    }
    return {
      src: el.getAttribute("src"), className: el.getAttribute("class"),
      objectFit: style.objectFit, borderRadius: style.borderRadius,
      clipPath: style.clipPath, filter: style.filter,
      naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight,
      boxWidth: Math.round(box.width * 10) / 10, boxHeight: Math.round(box.height * 10) / 10,
      insideLink: !!el.closest("a"), childElements: el.querySelectorAll("*").length,
      ancestorClips: offenders,
    };
  });
}

/* The VISIBLE red mark of the icon: decode the data URI, find its alpha
 * bounding box, and project it through the rendered height. */
async function readMark(link) {
  return link.evaluate(async (el) => {
    const img = el.querySelector("img");
    const box = img.getBoundingClientRect();
    const asset = new Image();
    await new Promise((res, rej) => { asset.onload = res; asset.onerror = rej; asset.src = img.getAttribute("src"); });
    const canvas = document.createElement("canvas");
    canvas.width = asset.naturalWidth; canvas.height = asset.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(asset, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (d[(y * canvas.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const ratioY = (maxY - minY + 1) / canvas.height;
    const ratioX = (maxX - minX + 1) / canvas.width;
    return {
      fileWidth: Math.round(box.width * 10) / 10,
      fileHeight: Math.round(box.height * 10) / 10,
      naturalWidth: asset.naturalWidth, naturalHeight: asset.naturalHeight,
      markRatioY: Math.round(ratioY * 10000) / 10000,
      visibleMarkHeight: Math.round(box.height * ratioY * 100) / 100,
      visibleMarkWidth: Math.round(box.width * ratioX * 100) / 100,
    };
  });
}

function assertUncropped(thumb, labelText) {
  assert.equal(thumb.src, THUMB, labelText + ": the stored Data API URL is hotlinked");
  assert.doesNotMatch(thumb.className || "", /ht-cover/, labelText + ": no cover fit class");
  assert.notEqual(thumb.objectFit, "cover", labelText + ": computed object-fit is not cover");
  assert.equal(thumb.borderRadius, "0px", labelText + ": the corners are not clipped by a border radius");
  assert.equal(thumb.clipPath, "none", labelText + ": no clip-path alters the image");
  assert.equal(thumb.filter, "none", labelText + ": no filter alters the image");
  assert.equal(thumb.insideLink, false, labelText + ": no play control or link over the image");
  assert.equal(thumb.childElements, 0, labelText + ": the image carries no overlay");
  assert.deepEqual(thumb.ancestorClips, [], labelText + ": no ancestor clips the image up to the card");
  const natural = thumb.naturalWidth / thumb.naturalHeight;
  const box = thumb.boxWidth / thumb.boxHeight;
  assert.ok(Math.abs(natural - box) < 0.02, labelText + ": rendered aspect matches the image (" + natural.toFixed(3) + " vs " + box.toFixed(3) + ")");
}

(async () => {
  const browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
  // The base (#32) run records the same measurements without this branch's
  // layout or mark, so the new assertions only apply to the head run.
  const expectNewLayout = label !== "base";
  const measures = {
    label,
    assets: {
      page: process.env.HACKERTUBE_PAGE_PATH || "hackertube/dashboard/dist/index.js",
      style: process.env.HACKERTUBE_STYLE_PATH || "hackertube/dashboard/dist/style.css",
    },
    scope: "Production bundle and stylesheet in a React fixture with stub SDK components and a stub local API, plus the compiled host stylesheet. Fixture images are served locally for the i.ytimg.com paths; this is not an installed dashboard, not a live-provider receipt, and not a real YouTube image.",
    hostStylesheet: hostPath,
    note: NOTE,
    viewports: [],
  };
  try {
    for (const width of [390, 1280]) {
      const fixture = await startFixture(items);
      const tab = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
      try {
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
        return { width: Math.round(box.width), height: Math.round(box.height) };
      });
      assert.ok(tap.height >= 44 && tap.width >= 44, "compact tap target >= 44px: " + JSON.stringify(tap));
      const mark = await readMark(iconLink);
      if (expectNewLayout) {
        assert.ok(mark.visibleMarkHeight >= 100, "compact visible mark >= 100px: " + mark.visibleMarkHeight);
        assert.ok(mark.fileHeight >= 185.5, "compact icon file box drawn at ~186px: " + mark.fileHeight);
      }
      const compactThumb = await readThumb(tab, "#videos .ht-compact");
      assertUncropped(compactThumb, "compact row");
      assert.equal(await compact.getByText(NOTE, { exact: true }).count(), 1, "compact row keeps the short note");

      const layout = await compact.evaluate(el => {
        const side = el.querySelector(".ht-compact-side");
        const main = el.querySelector(".ht-compact-main");
        const row = el.querySelector(".ht-compact-row");
        const thumb = el.querySelector("img.ht-thumb");
        const logo = el.querySelector(".ht-youtube-icon img");
        const rb = el.getBoundingClientRect();
        if (!side || !main) return { hasColumns: false, rowHeight: Math.round(rb.height * 10) / 10 };
        const s = side.getBoundingClientRect();
        const m = main.getBoundingClientRect();
        return {
          hasColumns: true,
          rowHeight: Math.round(rb.height * 10) / 10,
          sideWidth: Math.round(s.width * 10) / 10,
          sideHeight: Math.round(s.height * 10) / 10,
          sideLeft: Math.round(s.left * 10) / 10,
          sideRight: Math.round(s.right * 10) / 10,
          sideTop: Math.round(s.top * 10) / 10,
          sideBottom: Math.round(s.bottom * 10) / 10,
          mainLeft: Math.round(m.left * 10) / 10,
          mainTop: Math.round(m.top * 10) / 10,
          mainWidth: Math.round(m.width * 10) / 10,
          flexDirection: getComputedStyle(row).flexDirection,
          sideHasThumb: !!thumb && side.contains(thumb),
          sideHasLogo: !!logo && side.contains(logo),
        };
      });
      if (expectNewLayout) {
        if (width >= 640) {
          assert.equal(layout.flexDirection, "row", "at 1280 the compact row is a row of two columns");
          assert.ok(layout.sideRight <= layout.mainLeft + 1, "the side column sits left of the text: " + JSON.stringify(layout));
          assert.ok(Math.abs(layout.sideTop - layout.mainTop) <= 2, "the side column and text share the row");
        } else {
          assert.equal(layout.flexDirection, "column", "at 390 the compact row stacks");
          assert.ok(layout.sideBottom <= layout.mainTop + 1, "the art stacks above the text at 390: " + JSON.stringify(layout));
        }
        assert.equal(layout.sideHasThumb, true, "the thumbnail is in the side column");
        assert.equal(layout.sideHasLogo, true, "the logo is in the side column");
      } else {
        assert.equal(layout.hasColumns, false, "the #32 base has no side-column wrapper");
      }

      const fullCard = tab.locator("#ranked-feed article").first();
      const fullThumb = await readThumb(tab, "#ranked-feed");
      assertUncropped(fullThumb, "full card");
      const fullHeight = await fullCard.evaluate(el => Math.round(el.getBoundingClientRect().height * 10) / 10);
      const fullLink = fullCard.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' });
      assert.equal(await fullLink.count(), 1, "full card keeps the linked Icon");
      const fullMark = await readMark(fullLink);
      const fullOverflow = await tab.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (expectNewLayout) {
        assert.ok(fullMark.visibleMarkHeight >= 100, "full card visible mark >= 100px: " + fullMark.visibleMarkHeight);
        assert.ok(fullMark.fileHeight >= 185.5, "full card icon file box drawn at ~186px: " + fullMark.fileHeight);
        assert.ok(fullOverflow <= 1, "full card does not overflow horizontally at " + width + "px: " + fullOverflow);
      }
      assert.equal(await fullCard.getByText(NOTE, { exact: true }).count(), 1, "full card keeps the short note");

      const badges = {};
      for (const id of ["videos", "podcasts", "books", "audiobooks"]) {
        const badge = tab.locator("#" + id + " .ht-compact .ht-format").first();
        badges[id] = (await badge.count()) ? await badge.evaluate(el => getComputedStyle(el).display) : null;
      }
      assert.equal(badges.videos, "none", "compact Videos badge is hidden");
      assert.equal(badges.books, "none", "compact Books badge is hidden");
      assert.equal(badges.audiobooks, "none", "compact Audiobooks badge is hidden");
      assert.notEqual(badges.podcasts, "none", "compact Podcasts badge is visible");

      if (shots) {
        await tab.screenshot({ path: path.join(out, `discover-${width}.png`), fullPage: true });
        await tab.locator("#videos").screenshot({ path: path.join(out, `videos-${width}.png`) });
        await fullCard.screenshot({ path: path.join(out, `feed-card-${width}.png`) });
      }

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
      if (shots) {
        await tab.locator("#hackertube-results").screenshot({ path: path.join(out, `search-${width}.png`) });
      }

      measures.viewports.push({ width, compactTapTarget: tap, mark, layout, compactThumb, fullHeight, fullMark, fullOverflow, fullThumb, searchThumb, badges });
      } finally {
        await tab.close();
        await fixture.close();
      }
    }
    const file = path.join(out, `geometry-${label}.json`);
    fs.writeFileSync(file, JSON.stringify(measures, null, 2) + "\n");
    console.log(JSON.stringify(measures, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
