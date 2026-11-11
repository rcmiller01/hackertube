"use strict";
// Clean-profile render: loads the dashboard assets installed in a fresh
// HERMES_HOME (not the working tree) and exercises the thumbnail failure paths
// this card names. This is the browser half of the clean-profile probe;
// clean_profile_probe.py is the backend half.
//
// post-#35 additions: the installed compact row's header sits one row gap above
// the rest of its text at 768 and 1280, and the installed full card's Watch link
// (with its ring) stays inside the card at 320 and 390.
//
//   failure 1: a thumbnail URL on the look-alike host i.ytimg.com.evil.example
//   failure 2: a thumbnail URL on the suffix look-alike host xi.ytimg.com
//   failure 3: a thumbnail URL on an unrelated host (images.example.com)
//   failure 4: an official-host thumbnail that fails to load
//
// In every case the row keeps the linked official Icon, no broken image, and the
// short YouTube note. Failures 1-3 must also make no request to that host.
// It also reads the installed layout: the media is the first child in the DOM,
// the switch is at 768 (media on top below, media left beside at and above),
// the media column is 430px, the thumbnail is 192px and bigger than the visible
// mark, and no owning box overflows at 320/390/767.
const assert = require("node:assert/strict");
const { startFixture, loadNodeModule, THUMB_PNG } = require("../../../tests/browser_net_harness");

const home = process.env.HERMES_HOME;
const page = process.env.HACKERTUBE_PAGE_PATH;
const style = process.env.HACKERTUBE_STYLE_PATH;
if (!home || !page || !style) {
  console.error("HERMES_HOME, HACKERTUBE_PAGE_PATH and HACKERTUBE_STYLE_PATH are required");
  process.exit(2);
}

const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const LOOKALIKE = "https://i.ytimg.com.evil.example/vi/LCEmiRjPEtQ/hqdefault.jpg";
const SUFFIX = "https://xi.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const FOREIGN = "https://images.example.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
const NOTE = "Metadata from YouTube. Explanations and library actions are HackerTube\u2019s.";
const base = {
  item_id: "youtube:LCEmiRjPEtQ",
  format: "video",
  title: "Jane Austen introduction",
  destination: "https://www.youtube.com/watch?v=LCEmiRjPEtQ",
  capture_order: 1,
  contributors: ["A channel"],
  duration_seconds: null,
  art_hotlink: true,
  art_http_status: 200,
  art_checked_at: "2026-11-06T12:22:23Z",
};

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
      fileHeight: Math.round(box.height * 10) / 10,
      fileWidth: Math.round(box.width * 10) / 10,
      aspect: Math.round((box.width / box.height) * 10000) / 10000,
      markRatioY: Math.round(ratioY * 10000) / 10000,
      visibleMarkHeight: Math.round(box.height * ratioY * 100) / 100,
      visibleMarkWidth: Math.round(box.width * ratioX * 100) / 100,
    };
  });
}

async function assertFallback(browser, artUrl, routeRule, label) {
  const fixture = await startFixture([{ ...base, art_url: artUrl }]);
  const record = { label };
  try {
    const tab = await browser.newPage();
    await routeRule(tab);
    await tab.goto(fixture.origin);
    await tab.locator("#ranked-feed article").first().waitFor();
    const card = tab.locator("#ranked-feed article").first();
    record.fullCardThumbs = await card.locator("img.ht-thumb").count();
    record.fullCardIcon = await card.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }).count();
    record.fullCardNote = await card.locator(".ht-note").textContent();
    const fullCardLink = card.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' });
    record.fullCardIconBox = await fullCardLink.boundingBox();
    record.fullCardMark = await readMark(fullCardLink);
    const row = tab.locator("#videos .ht-compact").first();
    await row.waitFor();
    record.compactThumbs = await row.locator("img.ht-thumb").count();
    record.compactIcon = await row.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }).count();
    record.compactNote = await row.locator(".ht-note").textContent();
    assert.equal(record.fullCardThumbs, 0, label + ": the full card has no broken image hole");
    assert.equal(record.fullCardIcon, 1, label + ": the full card keeps the linked Icon");
    assert.ok(record.fullCardIconBox && record.fullCardIconBox.height > 0, label + ": the Icon is laid out");
    assert.equal(record.fullCardNote, NOTE, label + ": the short note remains");
    assert.ok(record.fullCardMark.fileHeight >= 185.5, label + ": the installed CSS draws the full card icon at ~186px (" + record.fullCardMark.fileHeight + ")");
    assert.ok(record.fullCardMark.visibleMarkHeight >= 100, label + ": the full card's visible mark is >= 100px (" + record.fullCardMark.visibleMarkHeight + ")");
    assert.equal(record.compactThumbs, 0, label + ": the compact row has no broken image hole");
    assert.equal(record.compactIcon, 1, label + ": the compact row keeps the linked Icon");
    assert.equal(record.compactNote, NOTE, label + ": the compact row keeps the short note");
    return record;
  } finally {
    await fixture.close();
  }
}

/* The installed layout: media first in the DOM, a plain `row` at 768, the 430px
 * media column, the 192px thumbnail larger than the visible mark, and no
 * horizontal overflow at 320/390/767. */
async function readLayout(browser) {
  const fixture = await startFixture([{ ...base, art_url: THUMB }]);
  const record = [];
  try {
    for (const [width, expected] of [[320, "flex"], [390, "flex"], [767, "flex"], [768, "grid"], [1280, "grid"]]) {
      const tab = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await tab.route("https://i.ytimg.com/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: THUMB_PNG }));
        await tab.goto(fixture.origin);
        const row = tab.locator("#videos .ht-compact").first();
        await row.waitFor();
        await row.locator("img.ht-thumb").waitFor();
        const geometry = await row.evaluate((el) => {
          const container = el.querySelector(".ht-compact-row");
          const head = el.querySelector(".ht-compact-head");
          const main = el.querySelector(".ht-compact-main");
          const side = el.querySelector(".ht-compact-side");
          const thumbEl = el.querySelector("img.ht-thumb");
          const iconEl = el.querySelector(".ht-youtube-icon img");
          const titleEl = el.querySelector(".ht-title");
          const thumb = thumbEl.getBoundingClientRect();
          const icon = iconEl.getBoundingClientRect();
          const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
          const offenders = [];
          for (const selector of [".hackertube", ".ht-compact", ".ht-compact-row", ".ht-compact-head", ".ht-compact-side",
            ".ht-youtube-compact", "img.ht-thumb", ".ht-youtube-icon"]) {
            const node = document.querySelector(selector);
            if (!node) continue;
            const rect = node.getBoundingClientRect();
            if (node.scrollWidth - node.clientWidth > 1) offenders.push(selector + " scrollWidth>clientWidth");
            if (rect.right > window.innerWidth + 1) offenders.push(selector + " right>viewport");
          }
          return {
            headChildIndex: Array.prototype.indexOf.call(container.children, head),
            sideChildIndex: Array.prototype.indexOf.call(container.children, side),
            mainChildIndex: Array.prototype.indexOf.call(container.children, main),
            titlePrecedesMedia: follows(titleEl, side),
            mediaPrecedesText: follows(side, main),
            display: getComputedStyle(container).display,
            rowGap: parseFloat(getComputedStyle(container).rowGap),
            gapUnderHeader: Math.round((main.getBoundingClientRect().top - head.getBoundingClientRect().bottom) * 10) / 10,
            sideWidth: Math.round(side.getBoundingClientRect().width * 10) / 10,
            thumbBox: [Math.round(thumb.width * 10) / 10, Math.round(thumb.height * 10) / 10],
            thumbBesideIcon: thumb.right <= icon.left + 1,
            thumbnailOnOwnLine: icon.top >= thumb.bottom - 1,
            offenders,
          };
        });
        const mark = await readMark(row.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }));
        // The installed full card's Watch link must fit inside its card with its
        // focus ring inside every clipping ancestor at the narrow widths.
        const fullCard = tab.locator("#ranked-feed article").first();
        await fullCard.waitFor();
        const watch = await fullCard.getByRole("link", { name: 'Watch "Jane Austen introduction" on YouTube' }).evaluate((el) => {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
          const cardEl = el.closest(".ht-card");
          const cardBox = cardEl.getBoundingClientRect();
          const clippers = [];
          for (let node = el.parentElement; node; node = node.parentElement) {
            const s = getComputedStyle(node);
            if (s.overflowX !== "visible" || s.overflowY !== "visible") {
              const r = node.getBoundingClientRect();
              clippers.push({
                name: (node.className || node.tagName).toString().trim(),
                clipsX: s.overflowX !== "visible",
                clipsY: s.overflowY !== "visible",
                left: r.left + parseFloat(s.borderLeftWidth),
                top: r.top + parseFloat(s.borderTopWidth),
                right: r.right - parseFloat(s.borderRightWidth),
                bottom: r.bottom - parseFloat(s.borderBottomWidth),
              });
            }
            if (node === cardEl) break;
          }
          const img = el.querySelector("img").getBoundingClientRect();
          return {
            box: { left: box.left, right: box.right, height: box.height },
            ring: { left: box.left - spread, right: box.right + spread, top: box.top - spread, bottom: box.bottom + spread },
            card: { left: cardBox.left, right: cardBox.right },
            clippers,
            img: { left: img.left, right: img.right, top: img.top, bottom: img.bottom, height: img.height },
          };
        });
        assert.ok(watch.box.left >= watch.card.left - 0.01 && watch.box.right <= watch.card.right + 0.01,
          `at ${width} the installed Watch link fits inside its card (${watch.box.left.toFixed(1)}..${watch.box.right.toFixed(1)} in ${watch.card.left.toFixed(1)}..${watch.card.right.toFixed(1)})`);
        assert.ok(watch.box.height >= 44, `at ${width} the installed Watch link is a 44px+ tap target`);
        assert.ok(watch.ring.left >= watch.card.left - 0.01 && watch.ring.right <= watch.card.right + 0.01,
          `at ${width} the installed focus ring fits inside the card`);
        assert.ok(Math.abs(watch.img.height - 186) <= 0.6, `at ${width} the installed Icon keeps its 186px box`);
        for (const clipper of watch.clippers) {
          if (clipper.clipsX) {
            assert.ok(watch.ring.left >= clipper.left - 0.01 && watch.ring.right <= clipper.right + 0.01,
              `at ${width} ${clipper.name} clips the installed focus ring horizontally`);
          }
          if (clipper.clipsY) {
            assert.ok(watch.ring.top >= clipper.top - 0.01 && watch.ring.bottom <= clipper.bottom + 0.01,
              `at ${width} ${clipper.name} clips the installed focus ring vertically`);
          }
          assert.ok(watch.img.left >= clipper.left - 0.01 && watch.img.right <= clipper.right + 0.01
            && watch.img.top >= clipper.top - 0.01 && watch.img.bottom <= clipper.bottom + 0.01,
            `at ${width} ${clipper.name} clips the installed Icon`);
        }
        assert.equal(geometry.headChildIndex, 0, `at ${width} the installed bundle puts the header first in the DOM`);
        assert.equal(geometry.sideChildIndex, 1, `at ${width} the installed bundle puts the media second`);
        assert.equal(geometry.mainChildIndex, 2, `at ${width} the installed bundle puts the rest of the text third`);
        assert.equal(geometry.titlePrecedesMedia, true, `at ${width} the title precedes the media in the DOM`);
        assert.equal(geometry.mediaPrecedesText, true, `at ${width} the media precedes the rest of the text`);
        assert.equal(geometry.display, expected, `at ${width} the installed stylesheet uses ${expected}`);
        assert.ok(geometry.thumbBox[0] > mark.visibleMarkWidth,
          `at ${width} the thumbnail is wider than the visible mark (${geometry.thumbBox[0]} vs ${mark.visibleMarkWidth})`);
        assert.ok(geometry.thumbBox[1] > mark.visibleMarkHeight,
          `at ${width} the thumbnail is taller than the visible mark (${geometry.thumbBox[1]} vs ${mark.visibleMarkHeight})`);
        if (width >= 768) {
          assert.ok(Math.abs(geometry.gapUnderHeader - geometry.rowGap) <= 0.6,
            `at ${width} the installed header sits one row gap (${geometry.rowGap}px) above its text, not ${geometry.gapUnderHeader}px`);
          assert.ok(Math.abs(geometry.sideWidth - 430) <= 1, `at ${width} the media column is 430px (${geometry.sideWidth})`);
          assert.equal(geometry.thumbBesideIcon, true, `at ${width} the thumbnail and Icon share one line`);
        } else {
          assert.equal(geometry.thumbnailOnOwnLine, width <= 390,
            `at ${width} the thumbnail is on its own line when it cannot share one`);
          assert.deepEqual(geometry.offenders, [], `at ${width} no owning box overflows horizontally`);
        }
        record.push({ width, mark, watch, ...geometry });
      } finally {
        await tab.close();
      }
    }
    return record;
  } finally {
    await fixture.close();
  }
}

(async () => {
  const browser = await loadNodeModule("playwright").chromium.launch({ headless: true });
  const record = { home, page, style };
  try {
    let lookalikeRequests = 0;
    record.lookalikeHost = await assertFallback(browser, LOOKALIKE, async (tab) => {
      await tab.route("https://i.ytimg.com.evil.example/**", (route) => {
        lookalikeRequests += 1;
        return route.fulfill({ status: 200, contentType: "image/png", body: THUMB_PNG });
      });
    }, "look-alike host");
    assert.equal(lookalikeRequests, 0, "the look-alike host is never requested");
    record.lookalikeHost.lookalikeRequests = lookalikeRequests;

    let suffixRequests = 0;
    record.suffixHost = await assertFallback(browser, SUFFIX, async (tab) => {
      await tab.route("https://xi.ytimg.com/**", (route) => {
        suffixRequests += 1;
        return route.fulfill({ status: 200, contentType: "image/png", body: THUMB_PNG });
      });
    }, "suffix look-alike host");
    assert.equal(suffixRequests, 0, "the suffix look-alike host is never requested");
    record.suffixHost.suffixRequests = suffixRequests;

    let foreignRequests = 0;
    record.foreignHost = await assertFallback(browser, FOREIGN, async (tab) => {
      await tab.route("https://images.example.com/**", (route) => {
        foreignRequests += 1;
        return route.fulfill({ status: 200, contentType: "image/png", body: THUMB_PNG });
      });
    }, "unrelated host");
    assert.equal(foreignRequests, 0, "the unrelated host is never requested");
    record.foreignHost.foreignRequests = foreignRequests;

    record.failedLoad = await assertFallback(browser, THUMB, async (tab) => {
      await tab.route("https://i.ytimg.com/**", (route) => route.abort());
    }, "official host, image fails to load");

    record.layout = await readLayout(browser);
    console.log(JSON.stringify(record, null, 2));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
