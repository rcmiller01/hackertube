"use strict";
// Post-#34 receipt: the real production bundle and plugin stylesheet plus the
// compiled Hermes host stylesheet; stub SDK components and a stub local API only.
//
// Records the measured claims this card makes at 320 / 390 / 767 / 768 / 1280:
//   - the compact thumbnail box against the Icon's VISIBLE red mark, in both
//     dimensions, unaltered (its own aspect, no radius/clip/filter/overlay),
//     for both the 4:3 `hqdefault` (192x144) and 16:9 `maxresdefault`
//     (192x108) frame shapes;
//   - the visible mark stays >= 100px and the Icon link stays >= 44px;
//   - the row HEADER (badge, title, creator) is the first child in the DOM,
//     then the media column, then the rest, so heading navigation to the title
//     reaches this row's Watch link before Save and Dismiss; at 768px and up
//     the media column is still painted left via grid areas, so the focusable
//     order (Watch, Save, Dismiss — checked at 1280) matches the painted order;
//   - no owning box overflows horizontally at 320 / 390 / 767;
//   - the compact row height, so this card can compare it with the pre-fix head.
//
// The thumbnail image is an SVG fixture served for the i.ytimg.com host path; it
// is NOT a real YouTube image and this receipt makes no live request.
//
// Usage:
//   node capture.js --label head --shots     # writes geometry-head.json + PNGs
//   node capture.js --label base             # writes geometry-base.json only
// Asset paths come from HACKERTUBE_PAGE_PATH / HACKERTUBE_STYLE_PATH (the
// harness reads them), so the base run points at the pre-fix files.
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
const hostDir = "<hermes-home>/hermes-agent/hermes_cli/web_dist/assets";
const hostPath = process.env.HACKERTUBE_HOST_CSS
  || path.join(hostDir, fs.readdirSync(hostDir).filter(x => /^index-.*\.css$/.test(x))[0]);
const NOTE = "Metadata from YouTube. Explanations and library actions are HackerTube\u2019s.";
const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const WATCH = "https://www.youtube.com/watch?v=LCEmiRjPEtQ";
const WIDTHS = [320, 390, 767, 768, 1280];
const ICON_ASPECT = 1255 / 1075;
const MEDIA_COLUMN_WIDTH = 430;

const THUMB_SVG = () => `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <rect width="480" height="360" fill="#2b2b2b"/>
  <rect x="0" y="45" width="480" height="270" fill="#c4302b"/>
  <text x="24" y="200" font-family="Helvetica" font-size="26" fill="#ffffff">fixture thumbnail (not a real YouTube image)</text>
</svg>`;

/* The 16:9 `maxresdefault` frame shape. A 4:3-only fixture cannot expose a
 * `cover` crop of a 16:9 image (a 4:3 source fills a 4:3 box exactly), so the
 * receipt measures this shape too and expects the 192x108 box. */
const THUMB169_SVG = () => `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
  <rect width="480" height="270" fill="#2b2b2b"/>
  <rect x="0" y="34" width="480" height="202" fill="#c4302b"/>
  <text x="24" y="150" font-family="Helvetica" font-size="26" fill="#ffffff">16:9 fixture thumbnail (not a real YouTube image)</text>
</svg>`;

async function readCompactThumb169(browser, fixture, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.route("https://i.ytimg.com/**",
      route => route.fulfill({ contentType: "image/svg+xml", body: THUMB169_SVG() }));
    await page.goto(fixture.origin);
    await page.locator("#videos .ht-compact img.ht-thumb").first().waitFor();
    await page.waitForFunction(() => {
      const el = document.querySelector("#videos .ht-compact img.ht-thumb");
      return el && el.naturalWidth > 0;
    });
    return await page.locator("#videos .ht-compact img.ht-thumb").first().evaluate(el => {
      const box = el.getBoundingClientRect();
      return {
        naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight,
        boxWidth: Math.round(box.width * 10) / 10, boxHeight: Math.round(box.height * 10) / 10,
        naturalAspect: el.naturalWidth / el.naturalHeight, boxAspect: box.width / box.height,
      };
    });
  } finally { await page.close(); }
}

const items = [
  { item_id: "youtube:LCEmiRjPEtQ", format: "video", title: "Jane Austen introduction", destination: WATCH,
    capture_order: 1, contributors: ["A channel"], duration_seconds: 600,
    art_url: THUMB, art_hotlink: true, art_http_status: 200, art_checked_at: "2026-11-06T12:22:23Z",
    art_cache: false, art_reason: "Display-cleared Data API thumbnail." },
  { item_id: "youtube:AAAAAAAAAAA", format: "video", title: "A second YouTube video", destination: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
    capture_order: 2, contributors: [], duration_seconds: null, art_url: null, art_hotlink: false },
  { item_id: "podcast:show", format: "podcast_show", title: "Austen Notes", destination: "https://example.com/show",
    capture_order: 3, contributors: [], duration_seconds: null, art_url: null, art_hotlink: false },
  { item_id: "podcast:episode", format: "podcast_episode", title: "Reading Jane Austen", destination: "https://example.com/episode",
    capture_order: 4, contributors: [], duration_seconds: 29522, art_url: null, art_hotlink: false },
  { item_id: "book:emma", format: "book", title: "Emma", destination: "https://openlibrary.org/works/OL66513W",
    capture_order: 5, contributors: ["Jane Austen"], duration_seconds: null, art_url: null, art_hotlink: false },
  { item_id: "audiobook:emma", format: "audiobook", title: "Emma, read aloud", destination: "https://librivox.org/emma",
    capture_order: 6, contributors: ["Jane Austen"], duration_seconds: 36000, art_url: null, art_hotlink: false },
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
      ancestorClips: offenders, naturalAspect: el.naturalWidth / el.naturalHeight,
      boxAspect: box.width / box.height,
    };
  });
}

/* The VISIBLE red mark of the icon: decode the data URI, find its alpha
 * bounding box, and project it through the rendered box. */
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
      aspect: Math.round((box.width / box.height) * 10000) / 10000,
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
  assert.ok(Math.abs(thumb.naturalAspect - thumb.boxAspect) < 0.02,
    labelText + ": rendered aspect matches the image (" + thumb.naturalAspect.toFixed(3) + " vs " + thumb.boxAspect.toFixed(3) + ")");
}

async function readCompactRow(card) {
  return card.evaluate(el => {
    const container = el.querySelector(".ht-compact-row");
    const head = el.querySelector(".ht-compact-head");
    const side = el.querySelector(".ht-compact-side");
    const main = el.querySelector(".ht-compact-main");
    const rb = el.getBoundingClientRect();
    if (!container || !side || !main) return { hasColumns: false, rowHeight: Math.round(rb.height * 10) / 10 };
    const s = side.getBoundingClientRect();
    const m = main.getBoundingClientRect();
    const h = head ? head.getBoundingClientRect() : null;
    const thumbEl = el.querySelector("img.ht-thumb");
    const iconEl = el.querySelector(".ht-youtube-icon img");
    const titleEl = el.querySelector(".ht-title");
    const thumb = thumbEl ? thumbEl.getBoundingClientRect() : null;
    const icon = iconEl ? iconEl.getBoundingClientRect() : null;
    const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const childIndex = node => Array.prototype.indexOf.call(container.children, node);
    return {
      hasColumns: true,
      hasHeader: !!head,
      rowHeight: Math.round(rb.height * 10) / 10,
      headChildIndex: head ? childIndex(head) : null,
      sideChildIndex: childIndex(side),
      mainChildIndex: childIndex(main),
      titlePrecedesMedia: !!(titleEl && follows(titleEl, side)),
      mediaPrecedesText: follows(side, main),
      display: getComputedStyle(container).display,
      flexDirection: getComputedStyle(container).flexDirection,
      sideWidth: Math.round(s.width * 10) / 10,
      sideLeft: Math.round(s.left * 10) / 10,
      sideTop: Math.round(s.top * 10) / 10,
      sideBottom: Math.round(s.bottom * 10) / 10,
      headLeft: h ? Math.round(h.left * 10) / 10 : null,
      headTop: h ? Math.round(h.top * 10) / 10 : null,
      headBottom: h ? Math.round(h.bottom * 10) / 10 : null,
      mainLeft: Math.round(m.left * 10) / 10,
      mainTop: Math.round(m.top * 10) / 10,
      sideHasThumb: !!thumbEl && side.contains(thumbEl),
      sideHasIcon: !!iconEl && side.contains(iconEl),
      thumbBox: thumb ? { w: Math.round(thumb.width * 10) / 10, h: Math.round(thumb.height * 10) / 10, right: Math.round(thumb.right * 10) / 10, bottom: Math.round(thumb.bottom * 10) / 10 } : null,
      iconBox: icon ? { w: Math.round(icon.width * 10) / 10, h: Math.round(icon.height * 10) / 10, left: Math.round(icon.left * 10) / 10, top: Math.round(icon.top * 10) / 10 } : null,
      thumbnailOnOwnLine: !!(thumb && icon) && (icon.top >= thumb.bottom - 1),
      thumbBesideIcon: !!(thumb && icon) && (thumb.right <= icon.left + 1),
    };
  });
}

async function readOverflow(tab) {
  return tab.evaluate(() => {
    const selectors = [".hackertube", ".ht-compact", ".ht-compact-row", ".ht-compact-head", ".ht-compact-side",
      ".ht-youtube-compact", "img.ht-thumb", ".ht-youtube-icon"];
    const offenders = [];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (el.scrollWidth - el.clientWidth > 1) offenders.push(selector + " scrollWidth>clientWidth");
      if (rect.right > window.innerWidth + 1) offenders.push(selector + " right>viewport");
      if (rect.left < -1) offenders.push(selector + " left<0");
    }
    return { offenders, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
  });
}

async function readTabOrder(tab) {
  return tab.evaluate(() => {
    const card = document.querySelector("#videos .ht-compact");
    const focused = Array.from(card.querySelectorAll("a[href], button, input, select, textarea, [tabindex]"))
      .filter(el => el.getAttribute("tabindex") !== "-1" && !el.disabled);
    const describe = el => {
      const box = el.getBoundingClientRect();
      return { key: (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).trim(),
               top: Math.round(box.top), left: Math.round(box.left) };
    };
    const dom = focused.map(describe);
    const visual = focused.map(describe).sort((a, b) => (a.top - b.top) || (a.left - b.left));
    return { order: dom.map(x => x.key), matchesVisual: JSON.stringify(dom.map(x => x.key)) === JSON.stringify(visual.map(x => x.key)) };
  });
}

(async () => {
  const browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
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
    iconAspect: ICON_ASPECT,
    mediaColumnWidth: MEDIA_COLUMN_WIDTH,
    viewports: [],
  };
  try {
    for (const width of WIDTHS) {
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
        await compact.locator("img.ht-thumb").waitFor();
        await tab.waitForFunction(() => {
          const el = document.querySelector("#videos .ht-compact img.ht-thumb");
          return el && el.naturalWidth > 0;
        });
        const tap = await iconLink.evaluate(el => {
          const box = el.getBoundingClientRect();
          return { width: Math.round(box.width), height: Math.round(box.height) };
        });
        const mark = await readMark(iconLink);
        const compactThumb = await readThumb(tab, "#videos .ht-compact");
        assertUncropped(compactThumb, "compact row");
        assert.equal(await compact.getByText(NOTE, { exact: true }).count(), 1, "compact row keeps the short note");
        const layout = await readCompactRow(compact);
        const overflow = await readOverflow(tab);
        let tabOrder = null;
        if (width === 1280) {
          tabOrder = await readTabOrder(tab);
          // Heading navigation lands on the title; Tab from there must reach
          // THIS row's Watch link, then Save, then Dismiss.
          await tab.evaluate(() => {
            const title = document.querySelector("#videos .ht-compact .ht-title");
            title.setAttribute("tabindex", "-1");
            title.focus();
          });
          const fromTitle = [];
          for (let step = 0; step < 3; step += 1) {
            await tab.keyboard.press("Tab");
            fromTitle.push(await tab.evaluate(() =>
              (document.activeElement.getAttribute("aria-label") || document.activeElement.textContent || "").trim()));
          }
          tabOrder.fromTitle = fromTitle;
        }
        const compactThumb169 = await readCompactThumb169(browser, fixture, width);

        const fullCard = tab.locator("#ranked-feed article").first();
        const fullThumb = await readThumb(tab, "#ranked-feed");
        assertUncropped(fullThumb, "full card");
        const fullHeight = await fullCard.evaluate(el => Math.round(el.getBoundingClientRect().height * 10) / 10);
        const fullLink = fullCard.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' });
        const fullMark = await readMark(fullLink);

        if (expectNewLayout) {
          assert.ok(mark.visibleMarkHeight >= 100, "compact visible mark >= 100px: " + mark.visibleMarkHeight);
          assert.ok(tap.height >= 44 && tap.width >= 44, "compact tap target >= 44px: " + JSON.stringify(tap));
          assert.ok(compactThumb.boxWidth > mark.visibleMarkWidth,
            `at ${width}px the thumbnail is wider than the visible mark (${compactThumb.boxWidth} vs ${mark.visibleMarkWidth})`);
          assert.ok(compactThumb.boxHeight > mark.visibleMarkHeight,
            `at ${width}px the thumbnail is taller than the visible mark (${compactThumb.boxHeight} vs ${mark.visibleMarkHeight})`);
          assert.ok(Math.abs(compactThumb.boxWidth - 192) <= 1, "the 4:3 thumbnail box is 192px wide: " + compactThumb.boxWidth);
          assert.ok(Math.abs(compactThumb.boxHeight - 144) <= 1, "the 4:3 thumbnail box is 144px tall: " + compactThumb.boxHeight);
          assert.equal(compactThumb169.naturalHeight, 270, "the 16:9 fixture is 270px tall");
          assert.ok(Math.abs(compactThumb169.boxWidth - 192) <= 1, "the 16:9 thumbnail box is 192px wide: " + compactThumb169.boxWidth);
          assert.ok(Math.abs(compactThumb169.boxHeight - 108) <= 1,
            "the 16:9 thumbnail box is 108px tall, its own aspect and not a 4:3 crop: " + compactThumb169.boxHeight);
          assert.ok(Math.abs(compactThumb169.naturalAspect - compactThumb169.boxAspect) < 0.02,
            "the 16:9 thumbnail keeps its own aspect (uncropped): " + compactThumb169.naturalAspect.toFixed(3) + " vs " + compactThumb169.boxAspect.toFixed(3));
          assert.equal(layout.hasHeader, true, "the compact row has a header wrapper");
          assert.equal(layout.headChildIndex, 0, "the row header is the first child in the DOM");
          assert.equal(layout.sideChildIndex, 1, "the media is the second child in the DOM");
          assert.equal(layout.mainChildIndex, 2, "the rest of the text is the third child in the DOM");
          assert.equal(layout.titlePrecedesMedia, true,
            "the title precedes the media in the DOM, so heading navigation reaches this row's link before the next row's");
          assert.equal(layout.mediaPrecedesText, true, "the media precedes the rest of the text in the DOM");
          assert.equal(layout.sideHasThumb, true, "the thumbnail is in the media column");
          assert.equal(layout.sideHasIcon, true, "the Icon is in the media column");
          if (width >= 768) {
            assert.equal(layout.display, "grid", `at ${width} the media column sits left of the text via grid areas`);
            assert.ok(layout.sideLeft < layout.headLeft, "the media column sits left of the header");
            assert.ok(layout.sideLeft < layout.mainLeft, "the media column sits left of the text");
            assert.ok(Math.abs(layout.headLeft - layout.mainLeft) <= 1,
              `at ${width} the header and the text start at the same x (${layout.headLeft} vs ${layout.mainLeft})`);
            assert.ok(layout.headBottom <= layout.mainTop + 1, `at ${width} the header sits above the rest of the text`);
            assert.ok(Math.abs(layout.sideWidth - MEDIA_COLUMN_WIDTH) <= 1, "the media column has the fixed width: " + layout.sideWidth);
            assert.equal(layout.thumbBesideIcon, true, `at ${width} the thumbnail and Icon share one line`);
          } else {
            assert.equal(layout.display, "flex", `at ${width} the compact row stacks`);
            assert.ok(layout.headBottom <= layout.sideTop + 1, `at ${width} the header stacks above the media`);
            assert.ok(layout.sideBottom <= layout.mainTop + 1, `at ${width} the media stacks above the rest of the text`);
            // 320 and 390 cannot fit the 192px thumbnail beside the 217px Icon
            // (421px + the gap); 767 has the room for one line.
            assert.equal(layout.thumbnailOnOwnLine, width <= 390,
              `at ${width} the thumbnail is on its own line with the Icon after it when they cannot share one`);
            assert.deepEqual(overflow.offenders, [], `at ${width} no owning box overflows horizontally`);
            assert.ok(overflow.scrollWidth <= overflow.innerWidth + 1, `at ${width} the document does not scroll horizontally`);
          }
          assert.ok(fullMark.visibleMarkHeight >= 100, "full card visible mark >= 100px: " + fullMark.visibleMarkHeight);
          if (tabOrder) {
            assert.equal(tabOrder.matchesVisual, true, "at 1280px Tab order matches the painted order: " + JSON.stringify(tabOrder.order));
            assert.match(tabOrder.fromTitle[0] || "", /^Watch "/,
              "Tab from the title reaches this row's Watch link: " + JSON.stringify(tabOrder.fromTitle));
            assert.equal(tabOrder.fromTitle[1], "Save", "Tab then reaches this row's Save: " + JSON.stringify(tabOrder.fromTitle));
            assert.equal(tabOrder.fromTitle[2], "Dismiss", "Tab then reaches this row's Dismiss: " + JSON.stringify(tabOrder.fromTitle));
          }
        }

        if (shots) {
          await tab.screenshot({ path: path.join(out, `discover-${width}.png`), fullPage: true });
          await tab.locator("#videos").screenshot({ path: path.join(out, `videos-${width}.png`) });
        }

        // --- Search results ------------------------------------------
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
        if (shots) {
          await tab.locator("#hackertube-results").screenshot({ path: path.join(out, `search-${width}.png`) });
        }

        measures.viewports.push({ width, compactTapTarget: tap, mark, layout, compactThumb, compactThumb169, fullHeight, fullMark, overflow, tabOrder, searchThumb });
      } finally {
        await tab.close();
        await fixture.close();
      }
    }
    fs.writeFileSync(path.join(out, `geometry-${label}.json`), JSON.stringify(measures, null, 2) + "\n");
    console.log(JSON.stringify(measures.viewports.map(v => ({ width: v.width, display: v.layout.display, rowHeight: v.layout.rowHeight,
      headChildIndex: v.layout.headChildIndex, sideChildIndex: v.layout.sideChildIndex, mainChildIndex: v.layout.mainChildIndex,
      titlePrecedesMedia: v.layout.titlePrecedesMedia,
      thumb: [v.compactThumb.boxWidth, v.compactThumb.boxHeight], thumb169: [v.compactThumb169.boxWidth, v.compactThumb169.boxHeight],
      mark: [v.mark.visibleMarkWidth, v.mark.visibleMarkHeight],
      thumbnailOnOwnLine: v.layout.thumbnailOnOwnLine, thumbBesideIcon: v.layout.thumbBesideIcon, overflow: v.overflow.offenders,
      tabMatchesVisual: v.tabOrder ? v.tabOrder.matchesVisual : null, tabFromTitle: v.tabOrder ? v.tabOrder.fromTitle : null })), null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
