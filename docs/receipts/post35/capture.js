"use strict";
// Post-#35 receipt: the real production bundle and plugin stylesheet plus the
// compiled Hermes host stylesheet; stub SDK components and a stub local API only.
//
// Records the measured claims this card makes at 320 / 390 / 767 / 768 / 1280:
//   - the compact row's HEADER sits exactly one row gap below the rest of its
//     text (grid-template-rows: auto 1fr), with the media column painted left and
//     the header level with the top of the row, at 768 and 1280 — including the
//     rows whose media column is taller than their text;
//   - at 320 the full card's Watch link fits inside the card and its focus ring
//     is inside every clipping ancestor, with the official mark at 186px (100px
//     visible) and the link still a 44px+ tap target;
//   - heading navigation to a compact row's title, then Tab, reaches THIS row's
//     Watch link, Save and Dismiss at 1280;
//   - the compact row heights and the full-card height, so this card can compare
//     them with the pre-fix head.
//
// The thumbnail image is an SVG fixture served for the i.ytimg.com host path; it
// is NOT a real YouTube image and this receipt makes no live request.
//
// Usage:
//   node capture.js --label head --shots     # geometry-head.json + PNGs
//   node capture.js --label base             # geometry-base.json only
// Asset paths come from HACKERTUBE_PAGE_PATH / HACKERTUBE_STYLE_PATH (the
// harness reads them), so the base run points at the pre-fix head's files.
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
const WIDTHS = [320, 390, 767, 768, 1280];
const ICON_ASPECT = 1255 / 1075;
const MEDIA_COLUMN_WIDTH = 430;

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
  { item_id: "youtube:AAAAAAAAAAA", format: "video", title: "A second YouTube video", destination: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
    capture_order: 2, contributors: [], duration_seconds: null, art_url: null, art_hotlink: false },
  { item_id: "youtube:BBBBBBBBBBB", format: "video", title: "A third YouTube video", destination: "https://www.youtube.com/watch?v=BBBBBBBBBBB",
    capture_order: 3, contributors: ["B channel"], duration_seconds: null,
    art_url: THUMB, art_hotlink: true, art_http_status: 200, art_checked_at: "2026-11-06T12:22:23Z", art_cache: false },
  { item_id: "podcast:show", format: "podcast_show", title: "Austen Notes", destination: "https://example.com/show",
    capture_order: 4, contributors: [], duration_seconds: null, art_url: null, art_hotlink: false },
  { item_id: "podcast:episode", format: "podcast_episode", title: "Reading Jane Austen", destination: "https://example.com/episode",
    capture_order: 5, contributors: [], duration_seconds: 29522, art_url: null, art_hotlink: false },
  { item_id: "book:emma", format: "book", title: "Emma", destination: "https://openlibrary.org/works/OL66513W",
    capture_order: 6, contributors: ["Jane Austen"], duration_seconds: null, art_url: null, art_hotlink: false },
  { item_id: "audiobook:emma", format: "audiobook", title: "Emma, read aloud", destination: "https://librivox.org/emma",
    capture_order: 7, contributors: ["Jane Austen"], duration_seconds: 36000, art_url: null, art_hotlink: false },
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

/* The visible red mark of the Icon: decode the data URI, find its alpha
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
      visibleMarkHeight: Math.round(box.height * ratioY * 100) / 100,
      visibleMarkWidth: Math.round(box.width * ratioX * 100) / 100,
    };
  });
}

/* Compact rows: is the header one row gap above the rest, and is the media
 * column painted left of the text (grid areas) at 768 and up? */
async function readCompactRows(tab) {
  return tab.evaluate(() => Array.from(document.querySelectorAll("#videos .ht-compact")).map(el => {
    const container = el.querySelector(".ht-compact-row");
    const head = el.querySelector(".ht-compact-head");
    const main = el.querySelector(".ht-compact-main");
    const side = el.querySelector(".ht-compact-side");
    const style = getComputedStyle(container);
    const hb = head.getBoundingClientRect();
    const mb = main.getBoundingClientRect();
    const sb = side.getBoundingClientRect();
    const rb = el.getBoundingClientRect();
    const round = (value) => Math.round(value * 10) / 10;
    return {
      title: el.querySelector(".ht-title").textContent,
      display: style.display,
      gridTemplateRows: style.gridTemplateRows,
      rowGap: parseFloat(style.rowGap),
      gapUnderHeader: round(mb.top - hb.bottom),
      headerTopDelta: round(hb.top - sb.top),
      mediaTallerThanText: sb.height > (mb.bottom - hb.top),
      mediaOverhang: round(sb.bottom - mb.bottom),
      mediaLeft: round(sb.left), headLeft: round(hb.left), mainLeft: round(mb.left),
      mediaWidth: round(sb.width),
      rowHeight: round(rb.height),
      headChildIndex: Array.prototype.indexOf.call(container.children, head),
      sideChildIndex: Array.prototype.indexOf.call(container.children, side),
      mainChildIndex: Array.prototype.indexOf.call(container.children, main),
    };
  }));
}

/* The full card's Watch link: does it, its focus ring and the official mark all
 * sit inside the card and inside every ancestor that clips? */
async function readWatchLink(card) {
  const link = card.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' });
  await link.waitFor();
  return link.evaluate(el => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    const cardEl = el.closest(".ht-card");
    const cardBox = cardEl.getBoundingClientRect();
    const round = (value) => Math.round(value * 10) / 10;
    const clippers = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      const clipsX = s.overflowX !== "visible";
      const clipsY = s.overflowY !== "visible";
      if (clipsX || clipsY) {
        const r = node.getBoundingClientRect();
        clippers.push({
          name: (node.className || node.tagName).toString().trim(),
          clipsX, clipsY,
          left: round(r.left + parseFloat(s.borderLeftWidth)),
          top: round(r.top + parseFloat(s.borderTopWidth)),
          right: round(r.right - parseFloat(s.borderRightWidth)),
          bottom: round(r.bottom - parseFloat(s.borderBottomWidth)),
        });
      }
      if (node === cardEl) break;
    }
    const img = el.querySelector("img");
    const imgBox = img.getBoundingClientRect();
    return {
      padding: style.padding,
      outline: { width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset), spread },
      box: { left: round(box.left), right: round(box.right), top: round(box.top), bottom: round(box.bottom), width: round(box.width), height: round(box.height) },
      ring: { left: round(box.left - spread), right: round(box.right + spread), top: round(box.top - spread), bottom: round(box.bottom + spread) },
      card: { left: round(cardBox.left), right: round(cardBox.right), width: round(cardBox.width) },
      clippers,
      img: { left: round(imgBox.left), right: round(imgBox.right), top: round(imgBox.top), bottom: round(imgBox.bottom), width: round(imgBox.width), height: round(imgBox.height) },
      imgAspect: Math.round((imgBox.width / imgBox.height) * 10000) / 10000,
    };
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

/* Focus-ring evidence at 320: the SAME clip twice, focused and not, so a pixel
 * diff isolates the ring and its bounding box can be compared with the link's
 * own box. Two 1x1-ish files per width pair are written for the README. */
async function captureRingShots(tab, card, width) {
  const link = card.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' });
  // A taller viewport so the whole ring + margin fits: the clip is taken from
  // the viewport, and a short one crops the bottom of the ring away.
  const previous = tab.viewportSize();
  await tab.setViewportSize({ width, height: 1400 });
  await link.scrollIntoViewIfNeeded();
  const geometry = await link.evaluate(el => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      left: box.left, right: box.right, top: box.top, bottom: box.bottom,
      spread: parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset),
    };
  });
  const margin = geometry.spread + 8;
  const clip = {
    x: Math.max(0, Math.floor(geometry.left - margin)),
    y: Math.max(0, Math.floor(geometry.top - margin)),
    width: Math.ceil(geometry.right - geometry.left + margin * 2),
    height: Math.ceil(geometry.bottom - geometry.top + margin * 2),
  };
  await tab.evaluate(() => document.activeElement && document.activeElement.blur());
  await tab.screenshot({ path: path.join(out, `watch-ring-${label}-${width}-off.png`), clip });
  await link.evaluate(el => el.focus());
  await tab.screenshot({ path: path.join(out, `watch-ring-${label}-${width}-on.png`), clip });
  await tab.evaluate(() => document.activeElement && document.activeElement.blur());
  await tab.setViewportSize(previous);
  return {
    clip,
    linkInClip: {
      left: Math.round((geometry.left - clip.x) * 10) / 10,
      right: Math.round((geometry.right - clip.x) * 10) / 10,
      top: Math.round((geometry.top - clip.y) * 10) / 10,
      bottom: Math.round((geometry.bottom - clip.y) * 10) / 10,
    },
    ringSpread: Math.round(geometry.spread * 100) / 100,
  };
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

        const compact = tab.locator("#videos .ht-compact").first();
        const iconLink = compact.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' });
        await iconLink.waitFor();
        const mark = await readMark(iconLink);
        const rows = await readCompactRows(tab);

        let tabOrder = null;
        if (width === 1280) {
          tabOrder = await readTabOrder(tab);
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

        const fullCard = tab.locator("#ranked-feed article").first();
        await fullCard.waitFor();
        const fullHeight = await fullCard.evaluate(el => Math.round(el.getBoundingClientRect().height * 10) / 10);
        const watch = await readWatchLink(fullCard);
        const fullMark = await readMark(fullCard.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }));
        let ring = null;
        if (width <= 320) ring = await captureRingShots(tab, fullCard, width);

        if (expectNewLayout) {
          assert.ok(rows.length >= 2, "there is more than one compact row to measure");
          for (const [index, row] of rows.entries()) {
            if (width >= 768) {
              assert.equal(row.display, "grid", `at ${width} row ${index} is the side-column grid`);
              assert.ok(Math.abs(row.gapUnderHeader - row.rowGap) <= 0.6,
                `at ${width} row ${index} the header sits one row gap (${row.rowGap}px) above the text, not ${row.gapUnderHeader}px`);
              assert.ok(Math.abs(row.headerTopDelta) <= 0.6,
                `at ${width} row ${index} the header hugs the top of the row`);
              assert.ok(row.mediaLeft < row.headLeft, `at ${width} row ${index} the media column is painted left of the header`);
              assert.ok(Math.abs(row.headLeft - row.mainLeft) <= 1, `at ${width} row ${index} the header and the text start at the same x`);
              assert.ok(Math.abs(row.mediaWidth - MEDIA_COLUMN_WIDTH) <= 1, `at ${width} row ${index} the media column keeps its width`);
            } else {
              assert.equal(row.display, "flex", `at ${width} row ${index} stacks`);
            }
          }
          if (width === 1280) {
            assert.ok(rows.some(row => row.mediaTallerThanText),
              "at 1280 at least one row's media column is taller than its text, the case this fix targets");
          }
          assert.ok(mark.visibleMarkHeight >= 100, "compact visible mark >= 100px: " + mark.visibleMarkHeight);
          assert.ok(mark.visibleMarkWidth >= 143, "compact visible mark >= 143px wide: " + mark.visibleMarkWidth);
          assert.ok(Math.abs(watch.img.height - 186) <= 0.6, "full-card Icon keeps its 186px box: " + watch.img.height);
          assert.ok(Math.abs(watch.imgAspect - ICON_ASPECT) <= 0.01, "full-card Icon keeps its own aspect: " + watch.imgAspect);
          assert.ok(fullMark.visibleMarkHeight >= 100, "full-card visible mark >= 100px: " + fullMark.visibleMarkHeight);
          assert.ok(fullMark.visibleMarkWidth >= 140, "full-card visible mark >= 140px wide: " + fullMark.visibleMarkWidth);
          assert.ok(watch.box.height >= 44, "the Watch link is a 44px+ tap target: " + watch.box.height);
          assert.ok(watch.box.left >= watch.card.left - 0.01 && watch.box.right <= watch.card.right + 0.01,
            `at ${width} the Watch link fits inside the card (${watch.box.left}..${watch.box.right} in ${watch.card.left}..${watch.card.right})`);
          assert.ok(watch.ring.left >= watch.card.left - 0.01 && watch.ring.right <= watch.card.right + 0.01,
            `at ${width} the focus ring fits inside the card`);
          for (const clipper of watch.clippers) {
            if (clipper.clipsX) {
              assert.ok(watch.ring.left >= clipper.left - 0.01 && watch.ring.right <= clipper.right + 0.01,
                `at ${width} ${clipper.name} clips the ring horizontally`);
            }
            if (clipper.clipsY) {
              assert.ok(watch.ring.top >= clipper.top - 0.01 && watch.ring.bottom <= clipper.bottom + 0.01,
                `at ${width} ${clipper.name} clips the ring vertically`);
            }
            assert.ok(watch.img.left >= clipper.left - 0.01 && watch.img.right <= clipper.right + 0.01
              && watch.img.top >= clipper.top - 0.01 && watch.img.bottom <= clipper.bottom + 0.01,
              `at ${width} ${clipper.name} clips the Icon`);
          }
          if (tabOrder) {
            assert.equal(tabOrder.matchesVisual, true, "at 1280 Tab order matches the painted order: " + JSON.stringify(tabOrder.order));
            assert.match(tabOrder.fromTitle[0] || "", /^Watch "/,
              "Tab from the title reaches this row's Watch link: " + JSON.stringify(tabOrder.fromTitle));
            assert.equal(tabOrder.fromTitle[1], "Save", "Tab then reaches this row's Save: " + JSON.stringify(tabOrder.fromTitle));
            assert.equal(tabOrder.fromTitle[2], "Dismiss", "Tab then reaches this row's Dismiss: " + JSON.stringify(tabOrder.fromTitle));
          }
        }

        if (shots) {
          await tab.screenshot({ path: path.join(out, `discover-${width}.png`), fullPage: true });
          await tab.locator("#videos").screenshot({ path: path.join(out, `videos-${width}.png`) });
          await tab.locator("#ranked-feed article").first().screenshot({ path: path.join(out, `feed-card-${width}.png`) });
        }

        await revealControls(tab);
        await tab.getByRole("button", { name: "Focused search", exact: true }).click();
        await tab.locator("#hackertube-question").fill("Jane Austen videos");
        await tab.locator("#hackertube-disclosure-ack").check();
        await tab.getByRole("button", { name: "Search", exact: true }).click();
        await tab.locator("#hackertube-results").waitFor();
        await tab.locator(".ht-result").first().locator("article").waitFor();
        if (shots) {
          await tab.locator("#hackertube-results").screenshot({ path: path.join(out, `search-${width}.png`) });
        }

        measures.viewports.push({ width, mark, rows, fullHeight, watch, ring, tabOrder });
      } finally {
        await tab.close();
        await fixture.close();
      }
    }
    fs.writeFileSync(path.join(out, `geometry-${label}.json`), JSON.stringify(measures, null, 2) + "\n");
    console.log(JSON.stringify(measures.viewports.map(v => ({
      width: v.width,
      display: v.rows.map(r => r.display).join(","),
      rowGaps: v.rows.map(r => r.rowGap),
      gapUnderHeader: v.rows.map(r => r.gapUnderHeader),
      mediaTaller: v.rows.map(r => r.mediaTallerThanText),
      rowHeight: v.rows.map(r => r.rowHeight),
      mark: [v.mark.visibleMarkWidth, v.mark.visibleMarkHeight],
      watchBox: [v.watch.box.left, v.watch.box.right],
      watchCard: [v.watch.card.left, v.watch.card.right],
      watchPadding: v.watch.padding,
      ring: v.ring ? v.ring.linkInClip : null,
      tabFromTitle: v.tabOrder ? v.tabOrder.fromTitle : null,
    })), null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
