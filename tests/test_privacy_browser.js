"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {startFixture, fixtureItems, loadNodeModule} = require("./browser_net_harness");

test("privacy gates real rendered features; deletion failure retains state and success revokes access", async () => {
  const fixture = await startFixture(fixtureItems(1), {accepted:false, rejectDelete:true});
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    await ui.route("https://covers.openlibrary.org/**", route => route.abort());
    await ui.goto(fixture.origin);
    await ui.getByRole("heading", {name:"HackerTube privacy and terms"}).waitFor();
    assert.equal(fixture.served.filter(x => /\/(catalog|feed|profile|status)$/.test(x.path)).length,0);
    const agree = ui.getByRole("button", {name:"Agree and continue"});
    assert.equal(await agree.isDisabled(),true);
    assert.equal(await ui.getByRole("link",{name:"YouTube Terms of Service"}).getAttribute("href"),"https://www.youtube.com/t/terms");
    await ui.getByLabel("I agree to the HackerTube privacy policy",{exact:false}).check();
    await agree.click();
    await ui.getByRole("heading",{name:"Discover",exact:true}).waitFor();
    const accepted = fixture.served.find(x => x.method === "POST" && x.path.endsWith("/privacy"));
    assert.deepEqual(JSON.parse(accepted.body),{version:"test",accepted:true});
    await ui.getByRole("button",{name:"Privacy",exact:true}).click();
    await ui.getByLabel("Delete all HackerTube data in this profile").check();
    await ui.getByRole("button",{name:"Delete HackerTube data and revoke agreement"}).click();
    await ui.getByRole("alert").filter({hasText:"Deletion did not complete"}).waitFor();
    assert.equal(await ui.getByRole("heading",{name:"Discover",exact:true}).count(),1);
    await ui.getByRole("button",{name:"Delete HackerTube data and revoke agreement"}).click();
    await agree.waitFor();
    assert.equal(await ui.getByRole("heading",{name:"Discover",exact:true}).count(),0);
    assert.equal(await agree.isDisabled(),true);
  } finally { await browser.close(); await fixture.close(); }
});


test("YouTube attribution renders without an authenticated image request", async () => {
  const items=fixtureItems(1);
  items[0]={...items[0], item_id:"youtube:LCEmiRjPEtQ", format:"video", title:"AI introduction",
    destination:"https://www.youtube.com/watch?v=LCEmiRjPEtQ", art_url:null,art_hotlink:false};
  const fixture=await startFixture(items);
  const browser=await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui=await browser.newPage();
    // A normal <img> cannot supply Hermes SDK's Authorization header.
    await ui.route("**/branding/youtube.png",route=>route.fulfill({status:401,body:"Unauthorized"}));
    await ui.goto(fixture.origin);
    const logo=ui.getByRole("img",{name:"YouTube",exact:true}).first();
    await logo.waitFor();
    const src=await logo.getAttribute("src");
    assert.match(src,/^data:image\/png;base64,/);
    const bytes=Buffer.from(src.split(",")[1],"base64");
    assert.equal(require("node:crypto").createHash("sha256").update(bytes).digest("hex"),"1027b1b0517727adb9697155a270744381c3ce9b047b1c8bd8a9389dc7d07a83","official asset must remain unmodified");
    await ui.waitForFunction(()=>document.querySelector('img[alt="YouTube"]').naturalWidth>0);
    // 186px file box -> 100px visible mark (the asset's 578/1075 clear space).
    assert.equal(await logo.evaluate(el=>el.getBoundingClientRect().height),186);
    const action=ui.locator("article").first().getByRole("link",{name:'Watch "AI introduction" on YouTube'});
    assert.equal(await action.count(),1);
    const text=action.getByText("Watch on YouTube",{exact:true});
    await text.waitFor();
    const geometry=await text.evaluate(el=>{
      const label=el.getBoundingClientRect();
      const art=el.closest(".ht-art").getBoundingClientRect();
      const icon=el.parentElement.querySelector("img").getBoundingClientRect();
      return {gap:label.top-icon.bottom,visible:label.top>=art.top && label.bottom<=art.bottom};
    });
    assert.ok(geometry.gap>=40,"keep the icon's existing clear space before the text");
    assert.equal(geometry.visible,true,"action must not be clipped by the art container");
  } finally {await browser.close();await fixture.close();}
});


test("the privacy disclosure reports its expanded state and accepting it moves focus to the page heading", async () => {
  const fixture=await startFixture(fixtureItems(1), {accepted:false, unbatchedPrivacy:true});
  const browser=await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui=await browser.newPage();
    await ui.route("https://covers.openlibrary.org/**", route => route.abort());
    await ui.goto(fixture.origin);
    const toggle=ui.getByRole("button",{name:"Privacy",exact:true});
    await toggle.waitFor();
    // While the policy is unaccepted it is forced open, so the toggle reports
    // the state of the section it controls rather than a stale flag.
    assert.equal(await toggle.getAttribute("aria-expanded"),"true");
    assert.equal(await toggle.getAttribute("aria-controls"),"hackertube-privacy-policy");
    assert.equal(await ui.getByRole("region",{name:"Privacy policy"}).count(),1);
    await ui.getByLabel("I agree to the HackerTube privacy policy",{exact:false}).check();
    await ui.getByRole("button",{name:"Agree and continue"}).click();
    await ui.getByRole("heading",{name:"Discover",exact:true}).waitFor();
    // The gate hands focus to the page it mounts instead of dropping it.
    assert.equal(await ui.evaluate(()=>document.activeElement&&document.activeElement.id),"discover");
    assert.equal(await toggle.getAttribute("aria-expanded"),"false");
    assert.equal(await ui.getByRole("region",{name:"Privacy policy"}).count(),0);
    assert.equal(await ui.locator("#hackertube-privacy-policy").count(),1,"aria-controls target remains mounted");
    assert.equal(await ui.locator("#hackertube-privacy-policy").getAttribute("hidden"),"");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"),"true");
    await ui.getByRole("region",{name:"Privacy policy"}).waitFor();
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"),"false");
    assert.equal(await ui.getByRole("region",{name:"Privacy policy"}).count(),0);
  } finally {await browser.close();await fixture.close();}
});

/* ------------------------------------------------------------------ *
 * YouTube branding: compact Icon, unaltered thumbnail, computed badges.
 * ------------------------------------------------------------------ */

const THUMB = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg";

/* A YouTube thumbnail must reach the viewer unaltered: no corner clip, no
 * clip-path, no filter, and the rendered box must keep the image's own aspect
 * ratio. Measured from computed style and layout, not from the stylesheet.
 *
 * An ancestor can clip it just as a rule on the image can: a wrapper with a
 * border-radius plus `overflow: hidden`/`clip`, a clip-path, or a filter
 * alters the pixels the reader sees. So the walk does not stop at the image:
 * it climbs every ancestor up to the card and fails if any of them clips. */
async function assertUnalteredThumbnail(thumb, label) {
  const paint = await thumb.evaluate(el => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      borderRadius: style.borderRadius,
      clipPath: style.clipPath,
      filter: style.filter,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      boxWidth: box.width,
      boxHeight: box.height,
    };
  });
  assert.equal(paint.borderRadius, "0px", label + ": the thumbnail corners are not clipped by a border radius");
  assert.equal(paint.clipPath, "none", label + ": no clip-path alters the thumbnail");
  assert.equal(paint.filter, "none", label + ": no filter alters the thumbnail");
  assert.ok(paint.naturalWidth > 0 && paint.naturalHeight > 0, label + ": the fixture image decoded");
  const natural = paint.naturalWidth / paint.naturalHeight;
  const rendered = paint.boxWidth / paint.boxHeight;
  assert.ok(
    Math.abs(natural - rendered) / natural <= 0.01,
    label + ": the rendered aspect ratio matches the image within 1% (" +
      natural.toFixed(4) + " natural vs " + rendered.toFixed(4) + " rendered)",
  );
  await assertNoAncestorClips(thumb, label);
}

/* Walk the ancestors of the thumbnail up to its card and report any that clip. */
async function assertNoAncestorClips(thumb, label) {
  const offenders = await thumb.evaluate(el => {
    const found = [];
    const name = (node) => node.tagName.toLowerCase() +
      (node.className ? "." + String(node.className).trim().split(/\s+/).join(".") : "");
    let node = el.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      if (style.clipPath && style.clipPath !== "none") found.push(name(node) + " clip-path:" + style.clipPath);
      if (style.filter && style.filter !== "none") found.push(name(node) + " filter:" + style.filter);
      const overflow = [style.overflow, style.overflowX, style.overflowY];
      const clips = overflow.some((value) => value === "hidden" || value === "clip");
      const radius = style.borderRadius || "0px";
      const rounded = !/^0px(\s+0px)*$/.test(radius.trim());
      if (clips && rounded) {
        found.push(name(node) + " radius:" + radius + " overflow:" + overflow.filter(Boolean).join("/"));
      }
      // The card is the boundary: everything above it is page chrome, not the
      // card's own presentation.
      if (node.tagName === "ARTICLE" || node.classList.contains("ht-card")) break;
      node = node.parentElement;
    }
    return found;
  });
  assert.deepEqual(offenders, [], label + ": no ancestor clips the thumbnail up to the card");
}

function youtubeRow(overrides) {
  return {
    item_id: "youtube:LCEmiRjPEtQ",
    format: "video",
    title: "AI introduction",
    destination: "https://www.youtube.com/watch?v=LCEmiRjPEtQ",
    capture_order: 1,
    contributors: ["A channel"],
    duration_seconds: null,
    art_url: THUMB,
    art_hotlink: true,
    art_http_status: 200,
    art_checked_at: "2026-11-06T12:22:23Z",
    ...overrides,
  };
}

function sectionRows() {
  return [
    youtubeRow(),
    { item_id: "p1", format: "podcast_show", title: "Austen Notes", destination: "https://example.com/show",
      capture_order: 2, contributors: [], duration_seconds: null, art_url: null, art_hotlink: false },
    { item_id: "p2", format: "podcast_episode", title: "Emma, part one", destination: "https://example.com/episode",
      capture_order: 3, contributors: [], duration_seconds: 1800, art_url: null, art_hotlink: false },
    { item_id: "b1", format: "book", title: "Emma", destination: "https://openlibrary.org/works/OL66513W",
      capture_order: 4, contributors: ["Jane Austen"], duration_seconds: null, art_url: null, art_hotlink: false },
    { item_id: "a1", format: "audiobook", title: "Emma, read aloud", destination: "https://librivox.org/emma",
      capture_order: 5, contributors: ["Jane Austen"], duration_seconds: 3600, art_url: null, art_hotlink: false },
  ];
}

test("compact format badges are measured in the browser, not read from the stylesheet", async () => {
  const fixture = await startFixture(sectionRows());
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:require("./browser_net_harness").PIXEL_PNG}));
    await ui.route("https://covers.openlibrary.org/**", route => route.abort());
    await ui.goto(fixture.origin);
    // `attached`, not the default `visible`: the badge must be in the DOM for
    // getComputedStyle to report its display value, and a hidden badge is
    // exactly what this test measures.
    await ui.locator("#podcasts .ht-compact .ht-format").first().waitFor({ state: "attached" });
    const measured = await ui.evaluate(() => {
      const rows = {};
      for (const id of ["videos", "podcasts", "books", "audiobooks"]) {
        const badge = document.querySelector("#" + id + " .ht-compact .ht-format");
        rows[id] = badge
          ? {display: getComputedStyle(badge).display, rendered: badge.getClientRects().length > 0}
          : null;
      }
      return rows;
    });
    assert.equal(measured.videos.display, "none", "Videos repeats the section heading");
    assert.equal(measured.books.display, "none", "Books repeats the section heading");
    assert.equal(measured.audiobooks.display, "none", "Audiobooks repeats the section heading");
    assert.notEqual(measured.podcasts.display, "none", "Podcasts keeps its Show vs Episode badge");
    assert.equal(measured.podcasts.rendered, true, "the Podcasts badge is actually laid out");
    // The markup assertion still holds: Podcasts rows carry both labels.
    const labels = await ui.locator("#podcasts .ht-compact .ht-format").allTextContents();
    assert.deepEqual(labels.slice().sort(), ["Episode", "Show"]);
  } finally { await browser.close(); await fixture.close(); }
});

test("a YouTube card hotlinks the unaltered thumbnail beside the linked Icon", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const fixture = await startFixture([youtubeRow()]);
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    let thumbRequests = 0;
    await ui.route("https://i.ytimg.com/**", route => { thumbRequests += 1; return route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}); });
    await ui.goto(fixture.origin);
    const card = ui.locator("#ranked-feed article").first();
    const thumb = card.locator("img.ht-thumb");
    await thumb.waitFor();
    assert.equal(await thumb.getAttribute("src"), THUMB, "the stored Data API URL is hotlinked");
    assert.equal(thumbRequests, 1, "one public image read, no Data API call");
    await ui.waitForFunction(() => document.querySelector("#ranked-feed img.ht-thumb").naturalWidth > 0);
    const shape = await thumb.evaluate(el => ({
      objectFit: getComputedStyle(el).objectFit,
      className: el.getAttribute("class"),
      insideLink: !!el.closest("a"),
      overlays: el.querySelectorAll("*").length,
    }));
    assert.doesNotMatch(shape.className, /ht-cover/, "no cover fit on a YouTube thumbnail");
    assert.notEqual(shape.objectFit, "cover", "the image is never cropped by CSS");
    assert.equal(shape.insideLink, false, "no play control or link is laid over the image");
    assert.equal(shape.overlays, 0, "the thumbnail carries no overlay");
    await assertUnalteredThumbnail(thumb, "ranked-feed YouTube card");
    const icon = card.getByRole("link", {name:'Watch "AI introduction" on YouTube'});
    assert.equal(await icon.count(), 1, "the official Icon is the linked attribution");
    assert.equal(await card.getByText("Metadata from YouTube. Explanations and library actions are HackerTube’s.", {exact:true}).count(), 1);
    assert.equal(thumbRequests, 1, "the public host was read once for this card");
  } finally { await browser.close(); await fixture.close(); }
});

test("a YouTube thumbnail that fails to load leaves the linked Icon and no broken image", async () => {
  const fixture = await startFixture([youtubeRow()]);
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    await ui.route("https://i.ytimg.com/**", route => route.abort());
    await ui.goto(fixture.origin);
    await ui.locator("#ranked-feed article").first().waitFor();
    await ui.waitForFunction(() => !document.querySelector("#ranked-feed img.ht-thumb"));
    const card = ui.locator("#ranked-feed article").first();
    assert.equal(await card.locator("img.ht-thumb").count(), 0, "the failed image is removed, not left as a hole");
    const icon = card.getByRole("link", {name:'Watch "AI introduction" on YouTube'});
    await icon.waitFor();
    const box = await icon.boundingBox();
    assert.ok(box && box.height > 0 && box.width > 0, "the attribution link is still laid out");
    const brand = await card.locator(".ht-art.ht-youtube-brand").boundingBox();
    assert.ok(brand && brand.height >= 180, "the brand block keeps its height");
    assert.equal(await card.getByText("AI introduction", {exact:true}).count(), 1, "the title still renders");
    assert.equal(await card.getByText("Metadata from YouTube. Explanations and library actions are HackerTube’s.", {exact:true}).count(), 1);
  } finally { await browser.close(); await fixture.close(); }
});

test("a compact YouTube row keeps the official linked Icon with a 44px tap target", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const fixture = await startFixture(sectionRows());
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    await ui.setViewportSize({width:390, height:900});
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
    await ui.goto(fixture.origin);
    const row = ui.locator("#videos .ht-compact").first();
    await row.waitFor();
    const link = row.getByRole("link", {name:'Watch "AI introduction" on YouTube'});
    await link.waitFor();
    const geometry = await link.evaluate(el => {
      const box = el.getBoundingClientRect();
      const mark = el.querySelector("img");
      const markBox = mark.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        markHeight: markBox.height,
        src: mark.getAttribute("src"),
        alt: mark.getAttribute("alt"),
      };
    });
    assert.ok(geometry.height >= 44, "tap target height >= 44px: " + geometry.height);
    assert.ok(geometry.width >= 44, "tap target width >= 44px: " + geometry.width);
    assert.ok(geometry.markHeight >= 100, "the official mark is not shrunk below the brand-site minimum: " + geometry.markHeight);
    assert.equal(geometry.alt, "YouTube");
    assert.match(geometry.src, /^data:image\/png;base64,/, "the official asset is served inline, unaltered");
    const thumb = row.locator("img.ht-thumb");
    assert.equal(await thumb.count(), 1, "the compact row keeps the thumbnail beside the Icon");
    await ui.waitForFunction(() => {
      const el = document.querySelector("#videos .ht-compact img.ht-thumb");
      return el && el.naturalWidth > 0;
    });
    await assertUnalteredThumbnail(thumb, "compact YouTube row");
    const note = await row.getByText("Metadata from YouTube. Explanations and library actions are HackerTube’s.", {exact:true}).count();
    assert.equal(note, 1);
    // The thumbnail is now bigger than the mark (post-#34), so at 390px it no
    // longer fits beside the Icon on one line: it takes its own line and the
    // Icon follows it, both unaltered, with the link still carrying no padding.
    const line = await link.evaluate(el => {
      const iconEl = el.querySelector("img");
      const icon = iconEl.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const thumbEl = el.closest(".ht-compact").querySelector("img.ht-thumb");
      const thumb = thumbEl.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        padding: style.paddingTop + " " + style.paddingLeft,
        linkWidth: box.width, linkHeight: box.height,
        iconWidth: icon.width, iconHeight: icon.height,
        iconBelowThumb: icon.top >= thumb.bottom - 1,
        thumbBeforeIcon: !!(thumbEl.compareDocumentPosition(iconEl) & Node.DOCUMENT_POSITION_FOLLOWING),
        noOverlap: thumb.right <= icon.left + 1 || icon.top >= thumb.bottom - 1,
      };
    });
    assert.equal(line.padding, "0px 0px", "the link carries no padding; the file's clear space is the icon's");
    assert.equal(line.iconBelowThumb, true,
      "at 390px the thumbnail is on its own line with the Icon after it");
    assert.equal(line.thumbBeforeIcon, true, "the thumbnail precedes the Icon in the DOM");
    assert.equal(line.noOverlap, true, "the thumbnail and the Icon do not overlap");
    assert.ok(Math.abs(line.linkWidth - line.iconWidth) <= 1, "the link box is the icon box, so touching the icon opens it");
    assert.ok(Math.abs(line.linkHeight - line.iconHeight) <= 1, "the link box is the icon box in height too");
    // The row is still a compact row, not a full card.
    assert.equal(await row.evaluate(el => el.className), "ht-card ht-compact");
  } finally { await browser.close(); await fixture.close(); }
});

/* ------------------------------------------------------------------ *
 * Post-#32 follow-ups: the visible mark, the side column, and the
 * render-time host check.
 * ------------------------------------------------------------------ */

/* The brand site's 100px minimum applies to the visible red mark, not to the
 * PNG file box: the official asset ships with built-in clear space. Measure the
 * mark itself by decoding the served data URI and finding the pixel bounding
 * box, then multiply by the rendered height. This is the only measurement that
 * can tell a 100px mark from a 100px file box. */
async function measureVisibleMark(link) {
  return link.evaluate(async (el) => {
    const img = el.querySelector("img");
    const box = img.getBoundingClientRect();
    const asset = new Image();
    await new Promise((resolve, reject) => {
      asset.onload = resolve;
      asset.onerror = reject;
      asset.src = img.getAttribute("src");
    });
    const canvas = document.createElement("canvas");
    canvas.width = asset.naturalWidth;
    canvas.height = asset.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(asset, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        // alpha coverage: the mark and its antialiased edge, not the clear space
        if (data[(y * canvas.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const ratioY = (maxY - minY + 1) / canvas.height;
    const ratioX = (maxX - minX + 1) / canvas.width;
    return {
      fileHeight: box.height,
      fileWidth: box.width,
      naturalWidth: asset.naturalWidth,
      naturalHeight: asset.naturalHeight,
      markRatioY: ratioY,
      visibleMarkHeight: box.height * ratioY,
      visibleMarkWidth: box.width * ratioX,
      assetSha256: null,
    };
  });
}

test("the compact YouTube mark's visible red area is at least 100px at 390 and 1280", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const width of [390, 1280]) {
      const fixture = await startFixture(sectionRows());
      const ui = await browser.newPage();
      await ui.setViewportSize({ width, height: 900 });
      await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
      await ui.goto(fixture.origin);
      const row = ui.locator("#videos .ht-compact").first();
      await row.waitFor();
      const link = row.getByRole("link", { name: 'Watch "AI introduction" on YouTube' });
      await link.waitFor();
      const mark = await measureVisibleMark(link);
      assert.ok(
        mark.fileHeight >= 185.5,
        `at ${width}px the icon image is drawn at ~186px (file box ${mark.fileHeight})`,
      );
      assert.ok(
        Math.abs(mark.markRatioY - 578 / 1075) <= 0.01,
        `at ${width}px the asset still has its built-in clear space (mark ratio ${mark.markRatioY.toFixed(4)})`,
      );
      assert.ok(
        mark.visibleMarkHeight >= 100,
        `at ${width}px the visible red mark is >= 100px (measured ${mark.visibleMarkHeight.toFixed(2)}px from a ${mark.fileHeight.toFixed(1)}px file box)`,
      );
      await ui.close();
      await fixture.close();
    }
  } finally { await browser.close(); }
});

test("the full feed card's YouTube mark's visible red area is at least 100px at 390 and 1280", async () => {
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const width of [390, 1280]) {
      const items = fixtureItems(1);
      items[0] = {...items[0], item_id:"youtube:LCEmiRjPEtQ", format:"video", title:"AI introduction",
        destination:"https://www.youtube.com/watch?v=LCEmiRjPEtQ", art_url:null, art_hotlink:false};
      const fixture = await startFixture(items);
      const ui = await browser.newPage();
      try {
        await ui.setViewportSize({ width, height: 900 });
        await ui.goto(fixture.origin);
        const card = ui.locator("article").first();
        await card.waitFor();
        const link = card.getByRole("link", { name: 'Watch "AI introduction" on YouTube' });
        await link.waitFor();
        const mark = await measureVisibleMark(link);
        assert.ok(
          mark.fileHeight >= 185.5,
          `at ${width}px the full card draws the icon at ~186px like compact rows (file box ${mark.fileHeight})`,
        );
        assert.ok(
          Math.abs(mark.markRatioY - 578 / 1075) <= 0.01,
          `at ${width}px the asset still has its built-in clear space (mark ratio ${mark.markRatioY.toFixed(4)})`,
        );
        assert.ok(
          mark.visibleMarkHeight >= 100,
          `at ${width}px the full card's visible red mark is >= 100px (measured ${mark.visibleMarkHeight.toFixed(2)}px from a ${mark.fileHeight.toFixed(1)}px file box)`,
        );
        const overflow = await ui.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(
          overflow <= 1,
          `at ${width}px the full card does not overflow horizontally (overflow ${overflow}px)`,
        );
      } finally {
        await ui.close();
        await fixture.close();
      }
    }
  } finally { await browser.close(); }
});

test("a compact YouTube row leads with its header, then its media, then its text, in a media column at 768 and up", async (t) => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    // 767 is the last stacked width, 768 the first side-column width: the
    // breakpoint is pinned on both sides, not just sampled far from it.
    for (const [width, expected] of [[767, "below"], [768, "beside"], [1280, "beside"]]) {
      const fixture = await startFixture(sectionRows());
      const ui = await browser.newPage();
      // An assertion failure must FAIL this test, not leave the fixture server
      // open and hang the runner: close both however the iteration ends.
      t.after(async () => {
        await ui.close().catch(() => {});
        await fixture.close().catch(() => {});
      });
      await ui.setViewportSize({ width, height: 900 });
      await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
      await ui.goto(fixture.origin);
      const row = ui.locator("#videos .ht-compact").first();
      await row.waitFor();
      await row.locator("img.ht-thumb").waitFor();
      const geometry = await row.evaluate((el) => {
        const head = el.querySelector(".ht-compact-head");
        const side = el.querySelector(".ht-compact-side");
        const main = el.querySelector(".ht-compact-main");
        const container = el.querySelector(".ht-compact-row");
        if (!head || !side || !main || !container) return { hasColumns: false };
        const h = head.getBoundingClientRect();
        const s = side.getBoundingClientRect();
        const m = main.getBoundingClientRect();
        const thumb = el.querySelector("img.ht-thumb");
        const logo = el.querySelector(".ht-youtube-icon img");
        const title = el.querySelector(".ht-title");
        const badge = el.querySelector(".ht-format");
        const actions = el.querySelector(".ht-actions");
        // DOM order: the header (badge, title, creator) comes first, then the
        // media column (thumbnail then Watch link), then the rest of the text
        // with its actions, so heading navigation to the title reaches THIS
        // row's Watch link before Save and Dismiss, not the next row's link
        // (WCAG 1.3.2 reading order, 2.4.3 focus order).
        const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        const style = getComputedStyle(container);
        return {
          hasColumns: true,
          headChildIndex: Array.prototype.indexOf.call(container.children, head),
          sideChildIndex: Array.prototype.indexOf.call(container.children, side),
          mainChildIndex: Array.prototype.indexOf.call(container.children, main),
          titleInsideHead: !!(title && head.contains(title)),
          titlePrecedesMedia: !!(title && follows(title, side)),
          badgePrecedesMedia: badge ? follows(badge, side) : null,
          mediaPrecedesMain: follows(side, main),
          mediaPrecedesActions: !!(actions && follows(side, actions)),
          headLeft: h.left, headTop: h.top, headBottom: h.bottom,
          sideLeft: s.left, sideRight: s.right, sideTop: s.top, sideBottom: s.bottom,
          sideWidth: s.width,
          mainLeft: m.left, mainTop: m.top,
          display: style.display,
          flexDirection: style.flexDirection,
          sideHasThumb: !!thumb && side.contains(thumb),
          sideHasLogo: !!logo && side.contains(logo),
        };
      });
      assert.equal(geometry.hasColumns, true, `at ${width}px the row has a header, a media column and a text column`);
      assert.equal(geometry.headChildIndex, 0, `at ${width}px the row header is the first child in the DOM`);
      assert.equal(geometry.sideChildIndex, 1, `at ${width}px the media is the second child in the DOM`);
      assert.equal(geometry.mainChildIndex, 2, `at ${width}px the rest of the text is the third child in the DOM`);
      assert.equal(geometry.titleInsideHead, true, `at ${width}px the title is in the first DOM child`);
      assert.equal(geometry.titlePrecedesMedia, true,
        `at ${width}px the title precedes the media in the DOM, so heading navigation reaches this row's link before the next row's`);
      if (geometry.badgePrecedesMedia !== null) {
        assert.equal(geometry.badgePrecedesMedia, true, `at ${width}px the badge precedes the media`);
      }
      assert.equal(geometry.mediaPrecedesMain, true, `at ${width}px the media precedes the rest of the text in the DOM`);
      assert.equal(geometry.mediaPrecedesActions, true, `at ${width}px the media precedes Save and Dismiss in the DOM`);
      assert.equal(geometry.sideHasThumb, true, `at ${width}px the thumbnail is in the media column`);
      assert.equal(geometry.sideHasLogo, true, `at ${width}px the logo is in the media column`);
      if (expected === "beside") {
        assert.equal(geometry.display, "grid",
          `at ${width}px the media column sits left of the text via grid areas, so the item Tab reaches first is painted first`);
        assert.ok(
          geometry.sideRight <= geometry.headLeft + 1,
          `at ${width}px the media column (right ${geometry.sideRight.toFixed(1)}) sits left of the header (left ${geometry.headLeft.toFixed(1)})`,
        );
        assert.ok(
          geometry.sideRight <= geometry.mainLeft + 1,
          `at ${width}px the media column sits left of the text (left ${geometry.mainLeft.toFixed(1)})`,
        );
        assert.ok(
          Math.abs(geometry.headLeft - geometry.mainLeft) <= 1,
          `at ${width}px the header and the text start at the same x so thumbnail-less rows align (${geometry.headLeft.toFixed(1)} vs ${geometry.mainLeft.toFixed(1)})`,
        );
        assert.ok(
          Math.abs(geometry.sideTop - geometry.headTop) <= 2,
          `at ${width}px the media column and the header share the row top (tops ${geometry.sideTop.toFixed(1)} vs ${geometry.headTop.toFixed(1)})`,
        );
        assert.ok(
          geometry.headBottom <= geometry.mainTop + 1,
          `at ${width}px the header sits above the rest of the text (header bottom ${geometry.headBottom.toFixed(1)}, text top ${geometry.mainTop.toFixed(1)})`,
        );
        assert.ok(
          Math.abs(geometry.sideWidth - 430) <= 1,
          `at ${width}px the media column has the fixed width so thumbnail-less rows align (width ${geometry.sideWidth.toFixed(1)})`,
        );
      } else {
        assert.equal(geometry.display, "flex", `at ${width}px the compact row stacks`);
        assert.equal(geometry.flexDirection, "column", `at ${width}px the compact row stacks in a column`);
        assert.ok(
          geometry.headBottom <= geometry.sideTop + 1,
          `at ${width}px the header stacks above the media (header bottom ${geometry.headBottom.toFixed(1)}, media top ${geometry.sideTop.toFixed(1)})`,
        );
        assert.ok(
          geometry.sideBottom <= geometry.mainTop + 1,
          `at ${width}px the media stacks above the rest of the text (media bottom ${geometry.sideBottom.toFixed(1)}, text top ${geometry.mainTop.toFixed(1)})`,
        );
      }
      await ui.close();
      await fixture.close();
    }
  } finally { await browser.close(); }
});

test("a thumbnail from a non-YouTube host falls back to the linked Icon at render time", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const foreign = "https://images.example.com/vi/LCEmiRjPEtQ/hqdefault.jpg";
  const fixture = await startFixture([youtubeRow({ art_url: foreign })]);
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    let foreignRequests = 0;
    await ui.route("https://images.example.com/**", route => {
      foreignRequests += 1;
      return route.fulfill({ status: 200, contentType: "image/png", body: THUMB_PNG });
    });
    await ui.goto(fixture.origin);
    const note = "Metadata from YouTube. Explanations and library actions are HackerTube’s.";
    for (const scope of ["#ranked-feed", "#videos"]) {
      const card = ui.locator(scope + " article").first();
      await card.waitFor();
      assert.equal(
        await card.locator("img.ht-thumb").count(), 0,
        `${scope}: a non-YouTube host is never rendered as a thumbnail`,
      );
      const icon = card.getByRole("link", { name: 'Watch "AI introduction" on YouTube' });
      assert.equal(await icon.count(), 1, `${scope}: the linked Icon remains`);
      assert.equal(await card.getByText(note, { exact: true }).count(), 1, `${scope}: the short note remains`);
    }
    assert.equal(foreignRequests, 0, "the foreign host is never requested");
  } finally { await browser.close(); await fixture.close(); }
});

test("the unaltered check fails when an ancestor clips the thumbnail, and passes once it is removed", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const fixture = await startFixture([youtubeRow()]);
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
    await ui.goto(fixture.origin);
    const card = ui.locator("#ranked-feed article").first();
    const thumb = card.locator("img.ht-thumb");
    await thumb.waitFor();
    await ui.waitForFunction(() => document.querySelector("#ranked-feed img.ht-thumb").naturalWidth > 0);
    await assertUnalteredThumbnail(thumb, "unmutated card");
    // A wrapper that clips, exactly the regression the walk exists to catch.
    await thumb.evaluate((el) => {
      const wrapper = el.parentElement;
      wrapper.style.borderRadius = "12px";
      wrapper.style.overflow = "hidden";
    });
    await assert.rejects(
      () => assertUnalteredThumbnail(thumb, "mutated card"),
      /no ancestor clips the thumbnail up to the card/,
      "an ancestor radius + overflow must fail the unaltered check",
    );
    // Removing the clip restores the green result: the failure was the clip.
    await thumb.evaluate((el) => {
      const wrapper = el.parentElement;
      wrapper.style.borderRadius = "";
      wrapper.style.overflow = "";
    });
    await assertUnalteredThumbnail(thumb, "restored card");
  } finally { await browser.close(); await fixture.close(); }
});

/* ------------------------------------------------------------------ *
 * Post-#33 follow-ups: the Icon box aspect, side-column alignment, and
 * the look-alike thumbnail host.
 * ------------------------------------------------------------------ */

/* The official asset is 1255x1075. A height-only rule that is not paired with
 * `width: auto` squashes the icon, so a `width: 150px` icon would still draw a
 * 69px visible mark and pass a height-multiplying check. Assert the box's own
 * aspect ratio within 1% on BOTH the compact row and the full card. */
const YOUTUBE_ICON_ASPECT = 1255 / 1075;

async function readIconBox(link) {
  return link.locator("img").evaluate(el => {
    const box = el.getBoundingClientRect();
    return {
      width: box.width, height: box.height,
      naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight,
      heightPx: getComputedStyle(el).height,
      widthPx: getComputedStyle(el).width,
    };
  });
}

test("the official Icon keeps its 1255:1075 box aspect on compact rows and full cards", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const width of [390, 1280]) {
      // ---- compact row ----
      const sections = await startFixture(sectionRows());
      const ui = await browser.newPage();
      try {
        await ui.setViewportSize({ width, height: 900 });
        await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
        await ui.goto(sections.origin);
        const row = ui.locator("#videos .ht-compact").first();
        await row.waitFor();
        const compactLink = row.getByRole("link", { name: 'Watch "AI introduction" on YouTube' });
        await compactLink.waitFor();
        await ui.waitForFunction(() => {
          const el = document.querySelector("#videos .ht-compact .ht-youtube-icon img");
          return el && el.naturalWidth > 0;
        });
        const compact = await readIconBox(compactLink);
        assert.equal(compact.naturalWidth, 1255, `compact row at ${width}px serves the official 1255px asset`);
        assert.equal(compact.naturalHeight, 1075, `compact row at ${width}px serves the official 1075px asset`);
        const compactRatio = compact.width / compact.height;
        assert.ok(
          Math.abs(compactRatio - YOUTUBE_ICON_ASPECT) / YOUTUBE_ICON_ASPECT <= 0.01,
          `compact row at ${width}px keeps the icon box aspect (${compactRatio.toFixed(4)} vs ${YOUTUBE_ICON_ASPECT.toFixed(4)})`,
        );
        assert.ok(compact.height >= 185.5, `compact row at ${width}px draws the box at ~186px (${compact.height})`);
      } finally {
        await ui.close();
        await sections.close();
      }

      // ---- full card ----
      const items = fixtureItems(1);
      items[0] = {...items[0], item_id:"youtube:LCEmiRjPEtQ", format:"video", title:"AI introduction",
        destination:"https://www.youtube.com/watch?v=LCEmiRjPEtQ", art_url:null, art_hotlink:false};
      const feed = await startFixture(items);
      const tab = await browser.newPage();
      try {
        await tab.setViewportSize({ width, height: 900 });
        await tab.goto(feed.origin);
        const card = tab.locator("article").first();
        await card.waitFor();
        const fullLink = card.getByRole("link", { name: 'Watch "AI introduction" on YouTube' });
        await fullLink.waitFor();
        await tab.waitForFunction(() => {
          const el = document.querySelector('article img[alt="YouTube"]');
          return el && el.naturalWidth > 0;
        });
        const full = await readIconBox(fullLink);
        assert.equal(full.naturalWidth, 1255, `full card at ${width}px serves the official 1255px asset`);
        assert.equal(full.naturalHeight, 1075, `full card at ${width}px serves the official 1075px asset`);
        const fullRatio = full.width / full.height;
        assert.ok(
          Math.abs(fullRatio - YOUTUBE_ICON_ASPECT) / YOUTUBE_ICON_ASPECT <= 0.01,
          `full card at ${width}px keeps the icon box aspect (${fullRatio.toFixed(4)} vs ${YOUTUBE_ICON_ASPECT.toFixed(4)})`,
        );
      } finally {
        await tab.close();
        await feed.close();
      }
    }
  } finally { await browser.close(); }
});

test("a compact YouTube row with no thumbnail starts its text at the same x as one with", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const rows = [
    youtubeRow(),
    youtubeRow({ item_id: "youtube:AAAAAAAAAAA", title: "Second video", capture_order: 2,
      destination: "https://www.youtube.com/watch?v=AAAAAAAAAAA", art_url: null, art_hotlink: false }),
  ];
  const fixture = await startFixture(rows);
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    await ui.setViewportSize({ width: 1280, height: 900 });
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
    await ui.goto(fixture.origin);
    await ui.locator("#videos .ht-compact").first().waitFor();
    await ui.locator("#videos .ht-compact img.ht-thumb").waitFor();
    const measured = await ui.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("#videos .ht-compact"));
      return cards.map(card => {
        const main = card.querySelector(".ht-compact-main");
        const side = card.querySelector(".ht-compact-side");
        return {
          title: card.querySelector(".ht-title").textContent,
          mainLeft: main.getBoundingClientRect().left,
          sideWidth: side ? side.getBoundingClientRect().width : null,
          hasThumb: !!card.querySelector("img.ht-thumb"),
        };
      });
    });
    assert.equal(measured.length, 2, "both YouTube rows render");
    const withThumb = measured.find(row => row.hasThumb);
    const withoutThumb = measured.find(row => !row.hasThumb);
    assert.ok(withThumb && withoutThumb, "one row has a thumbnail and one does not");
    assert.ok(
      Math.abs(withThumb.mainLeft - withoutThumb.mainLeft) <= 1,
      `both rows start their text at the same x (${withThumb.mainLeft.toFixed(1)} vs ${withoutThumb.mainLeft.toFixed(1)})`,
    );
    assert.ok(
      Math.abs(withThumb.sideWidth - withoutThumb.sideWidth) <= 1,
      `the side column has the same fixed width in both rows (${withThumb.sideWidth.toFixed(1)} vs ${withoutThumb.sideWidth.toFixed(1)})`,
    );
  } finally { await browser.close(); await fixture.close(); }
});

test("a look-alike i.ytimg.com host falls back to the linked Icon at render time", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  // A host that only PREFIX-matches the official one: indexOf/suffix checks pass
  // for it, an exact host match does not. Nothing may be requested from it.
  const lookalike = "https://i.ytimg.com.evil.example/vi/LCEmiRjPEtQ/hqdefault.jpg";
  const fixture = await startFixture([youtubeRow({ art_url: lookalike })]);
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    let lookalikeRequests = 0;
    await ui.route("https://i.ytimg.com.evil.example/**", route => {
      lookalikeRequests += 1;
      return route.fulfill({ status: 200, contentType: "image/png", body: THUMB_PNG });
    });
    await ui.goto(fixture.origin);
    const note = "Metadata from YouTube. Explanations and library actions are HackerTube’s.";
    for (const scope of ["#ranked-feed", "#videos"]) {
      const card = ui.locator(scope + " article").first();
      await card.waitFor();
      assert.equal(
        await card.locator("img.ht-thumb").count(), 0,
        `${scope}: a look-alike host is never rendered as a thumbnail`,
      );
      const icon = card.getByRole("link", { name: 'Watch "AI introduction" on YouTube' });
      assert.equal(await icon.count(), 1, `${scope}: the linked Icon remains`);
      assert.equal(await card.getByText(note, { exact: true }).count(), 1, `${scope}: the short note remains`);
    }
    assert.equal(lookalikeRequests, 0, "the look-alike host is never requested");
  } finally { await browser.close(); await fixture.close(); }
});

/* ------------------------------------------------------------------ *
 * Post-#34 follow-ups: the compact thumbnail's size, no narrow-viewport
 * overflow, Tab order, and suffix host matches.
 * ------------------------------------------------------------------ */

/* The visible mark is 143x100 on a compact row. The compact thumbnail must be
 * larger than that in BOTH dimensions at every width, unaltered: its own
 * aspect ratio, no crop, no radius, no overlay. Both the 4:3 `hqdefault` frame
 * and the 16:9 `maxresdefault` frame are measured — with only a 4:3 fixture a
 * `object-fit: cover` (or a fixed height) crop of a 16:9 image would go
 * unnoticed, because a 4:3 source fills a 4:3 box exactly. The box is the
 * image's own 192x144 (4:3) or 192x108 (16:9). */
test("the compact thumbnail is larger than the official mark in both dimensions at 390, 767, 768 and 1280", async (t) => {
  const { THUMB_PNG, THUMB16_9_PNG } = require("./browser_net_harness");
  const frames = [
    { name: "4:3 hqdefault", body: THUMB_PNG, natural: [480, 360], boxHeight: 144 },
    { name: "16:9 maxres", body: THUMB16_9_PNG, natural: [480, 270], boxHeight: 108 },
  ];
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const width of [390, 767, 768, 1280]) {
      for (const frame of frames) {
        const fixture = await startFixture(sectionRows());
        const ui = await browser.newPage();
        t.after(async () => {
          await ui.close().catch(() => {});
          await fixture.close().catch(() => {});
        });
        await ui.setViewportSize({ width, height: 900 });
        await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:frame.body}));
        await ui.goto(fixture.origin);
        const row = ui.locator("#videos .ht-compact").first();
        await row.waitFor();
        const link = row.getByRole("link", { name: 'Watch "AI introduction" on YouTube' });
        await link.waitFor();
        const thumb = row.locator("img.ht-thumb").first();
        await thumb.waitFor();
        await ui.waitForFunction(() => {
          const el = document.querySelector("#videos .ht-compact img.ht-thumb");
          return el && el.naturalWidth > 0;
        });
        const mark = await measureVisibleMark(link);
        const box = await thumb.evaluate(el => {
          const b = el.getBoundingClientRect();
          return { width: b.width, height: b.height, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight,
            naturalAspect: el.naturalWidth / el.naturalHeight, boxAspect: b.width / b.height };
        });
        await assertUnalteredThumbnail(thumb, `the ${frame.name} compact thumbnail at ${width}px`);
        assert.equal(box.naturalWidth, frame.natural[0], `the ${frame.name} fixture is ${frame.natural[0]} wide`);
        assert.equal(box.naturalHeight, frame.natural[1], `the ${frame.name} fixture is ${frame.natural[1]} tall`);
        assert.ok(
          box.width > mark.visibleMarkWidth,
          `at ${width}px the ${frame.name} thumbnail is wider than the visible mark (${box.width.toFixed(1)} vs ${mark.visibleMarkWidth.toFixed(1)})`,
        );
        assert.ok(
          box.height > mark.visibleMarkHeight,
          `at ${width}px the ${frame.name} thumbnail is taller than the visible mark (${box.height.toFixed(1)} vs ${mark.visibleMarkHeight.toFixed(1)})`,
        );
        assert.ok(Math.abs(box.width - 192) <= 1,
          `at ${width}px the ${frame.name} thumbnail box is 192px wide (${box.width.toFixed(1)})`);
        assert.ok(Math.abs(box.height - frame.boxHeight) <= 1,
          `at ${width}px the ${frame.name} thumbnail box is ${frame.boxHeight}px tall, its own aspect and not a 4:3 crop (${box.height.toFixed(1)})`);
        assert.ok(Math.abs(box.naturalAspect - box.boxAspect) < 0.02,
          `at ${width}px the ${frame.name} rendered box keeps the image's own aspect, so the thumbnail is uncropped (${box.naturalAspect.toFixed(3)} vs ${box.boxAspect.toFixed(3)})`);
        await ui.close();
        await fixture.close();
      }
    }
  } finally { await browser.close(); }
});

/* A wider thumbnail must not push a narrow row off the screen. The host clips
 * document overflow, so assert each owning box's own box, like the 390px
 * layout fix: scrollWidth <= clientWidth per box and right edge <= viewport. */
test("a compact YouTube row does not overflow horizontally at 320, 390 and 767", async (t) => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const width of [320, 390, 767]) {
      const fixture = await startFixture(sectionRows());
      const ui = await browser.newPage();
      t.after(async () => {
        await ui.close().catch(() => {});
        await fixture.close().catch(() => {});
      });
      await ui.setViewportSize({ width, height: 900 });
      await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
      await ui.goto(fixture.origin);
      await ui.locator("#videos .ht-compact").first().waitFor();
      await ui.locator("#videos .ht-compact img.ht-thumb").waitFor();
      const measured = await ui.evaluate(() => {
        const card = document.querySelector("#videos .ht-compact");
        const selectors = [".hackertube", ".ht-compact", ".ht-compact-row", ".ht-compact-head", ".ht-compact-side",
          ".ht-youtube-compact", "img.ht-thumb", ".ht-youtube-icon"];
        const offenders = [];
        for (const selector of selectors) {
          const el = selector === ".ht-compact" ? card : document.querySelector(selector);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (el.scrollWidth - el.clientWidth > 1) {
            offenders.push(`${selector} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
          }
          if (rect.right > window.innerWidth + 1) {
            offenders.push(`${selector} right ${rect.right.toFixed(1)} > viewport ${window.innerWidth}`);
          }
          if (rect.left < -1) offenders.push(`${selector} left ${rect.left.toFixed(1)} < 0`);
        }
        return { offenders, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
      });
      assert.deepEqual(measured.offenders, [], `at ${width}px no owning box overflows horizontally`);
      assert.ok(
        measured.scrollWidth <= measured.innerWidth + 1,
        `at ${width}px the document does not scroll horizontally (${measured.scrollWidth} vs ${measured.innerWidth})`,
      );
      await ui.close();
      await fixture.close();
    }
  } finally { await browser.close(); }
});

/* Tab order must follow the painted order at 1280, and heading navigation to a
 * title must reach that SAME row's Watch link before Save and Dismiss — never
 * the next row's link. The row's DOM leads with the header (badge, title,
 * creator), then the media, then the rest, and the grid areas keep the media
 * column painted on the left, so the focusable order (Watch, Save, Dismiss)
 * still matches the painted order. */
test("a compact YouTube row's Tab order reaches its own Watch, Save and Dismiss after its title at 1280", async (t) => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const fixture = await startFixture(sectionRows());
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    t.after(async () => {
      await ui.close().catch(() => {});
      await fixture.close().catch(() => {});
    });
    await ui.setViewportSize({ width: 1280, height: 900 });
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
    await ui.goto(fixture.origin);
    await ui.locator("#videos .ht-compact").first().waitFor();
    await ui.locator("#videos .ht-compact img.ht-thumb").waitFor();
    const order = await ui.evaluate(() => {
      const card = document.querySelector("#videos .ht-compact");
      const focused = Array.from(card.querySelectorAll("a[href], button, input, select, textarea, [tabindex]"))
        .filter(el => el.getAttribute("tabindex") !== "-1" && !el.disabled);
      const describe = el => {
        const box = el.getBoundingClientRect();
        return {
          key: (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).trim(),
          top: Math.round(box.top),
          left: Math.round(box.left),
        };
      };
      const dom = focused.map(describe);
      const visual = focused.map(describe).sort((a, b) => (a.top - b.top) || (a.left - b.left));
      return { dom, visual };
    });
    assert.deepEqual(
      order.dom.map(entry => entry.key),
      order.visual.map(entry => entry.key),
      "the Tab order of the row's controls matches their painted order at 1280px",
    );
    const index = prefix => order.dom.findIndex(entry => entry.key.startsWith(prefix));
    assert.ok(index('Watch "') !== -1, "the Watch/thumbnail link is focusable");
    assert.ok(index('Watch "') < index("Save"), "the Watch/thumbnail link is reached before Save");
    assert.ok(index("Save") < index("Dismiss"), "Save is reached before Dismiss");

    // Heading navigation lands on the title (a heading is not a tab stop, so a
    // screen reader focuses it directly); Tab from there must reach THIS row's
    // Watch link, then Save, then Dismiss — not the next row's Watch link.
    const linkFollowsTitle = await ui.evaluate(() => {
      const card = document.querySelector("#videos .ht-compact");
      const title = card.querySelector(".ht-title");
      const link = card.querySelector(".ht-youtube-icon");
      return !!(title.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(linkFollowsTitle, true, "the title precedes this row's Watch link in the DOM");
    await ui.evaluate(() => {
      const title = document.querySelector("#videos .ht-compact .ht-title");
      title.setAttribute("tabindex", "-1");
      title.focus();
    });
    assert.equal(
      await ui.evaluate(() => document.activeElement.classList.contains("ht-title")),
      true,
      "the title holds focus before Tab",
    );
    const visited = [];
    for (let step = 0; step < 3; step += 1) {
      await ui.keyboard.press("Tab");
      visited.push(await ui.evaluate(() =>
        (document.activeElement.getAttribute("aria-label") || document.activeElement.textContent || "").trim()));
    }
    assert.match(visited[0], /^Watch "/, `Tab from the title reaches this row's Watch link first (${JSON.stringify(visited)})`);
    assert.equal(visited[1], "Save", `Tab then reaches this same row's Save (${JSON.stringify(visited)})`);
    assert.equal(visited[2], "Dismiss", `Tab then reaches this same row's Dismiss (${JSON.stringify(visited)})`);
  } finally { await browser.close(); await fixture.close(); }
});

/* The compact row is a grid at 768px and up. The media column spans both
 * tracks and is often the tallest thing in the row, so without an explicit row
 * template the grid grows BOTH tracks to absorb it and the header drifts down
 * inside a tall first track: the gap under the header read ~22px at 1280 while
 * the row gap is 0.3rem. `grid-template-rows: auto 1fr` caps the first track at
 * the header's own height and lets the second take the slack, so the header
 * hugs the top and the rest of the text starts exactly one row gap below it. */
test("a compact row's header sits one row gap above the rest of its text at 768 and 1280", async (t) => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const thirdRow = {
    item_id: "youtube:BBBBBBBBBBB", format: "video", title: "A third view",
    destination: "https://www.youtube.com/watch?v=BBBBBBBBBBB", capture_order: 3,
    contributors: ["A channel"], duration_seconds: null, art_url: THUMB, art_hotlink: true,
    art_http_status: 200, art_checked_at: "2026-11-06T12:22:23Z",
  };
  const secondRow = { ...thirdRow, item_id: "youtube:AAAAAAAAAAA", title: "A second view",
    destination: "https://www.youtube.com/watch?v=AAAAAAAAAAA", capture_order: 2,
    contributors: [], art_url: null, art_hotlink: false };
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const width of [768, 1280]) {
      const fixture = await startFixture([youtubeRow(), secondRow, thirdRow]);
      const ui = await browser.newPage();
      t.after(async () => {
        await ui.close().catch(() => {});
        await fixture.close().catch(() => {});
      });
      await ui.setViewportSize({ width, height: 900 });
      await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
      await ui.goto(fixture.origin);
      await ui.locator("#videos .ht-compact").first().waitFor();
      const rows = await ui.evaluate(() => Array.from(document.querySelectorAll("#videos .ht-compact")).map(el => {
        const container = el.querySelector(".ht-compact-row");
        const head = el.querySelector(".ht-compact-head");
        const main = el.querySelector(".ht-compact-main");
        const side = el.querySelector(".ht-compact-side");
        const style = getComputedStyle(container);
        const hb = head.getBoundingClientRect();
        const mb = main.getBoundingClientRect();
        const sb = side.getBoundingClientRect();
        return {
          display: style.display,
          rowGap: parseFloat(style.rowGap),
          gapUnderHeader: mb.top - hb.bottom,
          headerTopDelta: hb.top - sb.top,
          mediaOverhang: sb.bottom - mb.bottom,
          mediaTallerThanText: sb.height > (mb.bottom - hb.top),
        };
      }));
      assert.ok(rows.length >= 2, `at ${width}px there is more than one compact row to measure`);
      for (const [index, row] of rows.entries()) {
        assert.equal(row.display, "grid", `at ${width}px row ${index} is the side-column grid`);
        assert.ok(
          Math.abs(row.gapUnderHeader - row.rowGap) <= 0.6,
          `at ${width}px row ${index} the header sits one row gap (${row.rowGap}px) above the text, not ${row.gapUnderHeader.toFixed(1)}px`,
        );
        assert.ok(
          Math.abs(row.headerTopDelta) <= 0.6,
          `at ${width}px row ${index} the header hugs the top of the row, level with its media column`,
        );
      }
      if (width >= 1280) {
        assert.ok(
          rows.some(row => row.mediaTallerThanText),
          "at least one row's media column is taller than its text, which is the case this pins",
        );
      }
      await ui.close();
      await fixture.close();
    }
  } finally { await browser.close(); }
});

/* The full card's Watch link was wider than the card on each side — 3.6px at
 * 320px — and the block that holds it clipped at its own edge, which is exactly
 * the link's edge, so the focus ring was cut away on every side. The card is
 * what constrains the link, not the viewport: a one-item ranked feed is a single
 * 17rem grid track at EVERY width, so the same overhang appears at 1280 too.
 * The link must fit inside the card, keep a 44px tap target, keep the official
 * mark at its published size and clear space, and have its ring inside every
 * clipping ancestor. */
test("the full card's Watch link and its focus ring stay inside the card, at 320 through 1280", async (t) => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const width of [320, 390, 768, 1280]) {
      const fixture = await startFixture([youtubeRow()]);
      const ui = await browser.newPage();
      t.after(async () => {
        await ui.close().catch(() => {});
        await fixture.close().catch(() => {});
      });
      await ui.setViewportSize({ width, height: 900 });
      await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
      await ui.goto(fixture.origin);
      const card = ui.locator("#ranked-feed article").first();
      await card.waitFor();
      const link = card.getByRole("link", { name: 'Watch "AI introduction" on YouTube' });
      await link.waitFor();
      const geometry = await link.evaluate(el => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const cardEl = el.closest(".ht-card");
        const cardBox = cardEl.getBoundingClientRect();
        const clippers = [];
        for (let node = el.parentElement; node; node = node.parentElement) {
          const s = getComputedStyle(node);
          const clipsX = s.overflowX !== "visible";
          const clipsY = s.overflowY !== "visible";
          if (clipsX || clipsY) {
            const r = node.getBoundingClientRect();
            clippers.push({
              name: node.className || node.tagName,
              clipsX, clipsY,
              left: r.left + parseFloat(s.borderLeftWidth),
              top: r.top + parseFloat(s.borderTopWidth),
              right: r.right - parseFloat(s.borderRightWidth),
              bottom: r.bottom - parseFloat(s.borderBottomWidth),
            });
          }
          if (node === cardEl) break;
        }
        const img = el.querySelector("img");
        const imgBox = img.getBoundingClientRect();
        return {
          padding: style.padding,
          box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
          ring: { left: box.left - spread, right: box.right + spread, top: box.top - spread, bottom: box.bottom + spread, spread },
          card: { left: cardBox.left, right: cardBox.right },
          clippers,
          img: { left: imgBox.left, right: imgBox.right, top: imgBox.top, bottom: imgBox.bottom, width: imgBox.width, height: imgBox.height },
          imgRadius: getComputedStyle(img).borderRadius,
        };
      });
      assert.ok(geometry.ring.spread > 0, "the link carries a real focus ring to keep: " + geometry.ring.spread);
      assert.ok(
        geometry.box.left >= geometry.card.left - 0.01 && geometry.box.right <= geometry.card.right + 0.01,
        `at ${width}px the Watch link fits inside the card (${geometry.box.left.toFixed(1)}..${geometry.box.right.toFixed(1)} in ${geometry.card.left.toFixed(1)}..${geometry.card.right.toFixed(1)})`,
      );
      assert.ok(
        geometry.ring.left >= geometry.card.left - 0.01 && geometry.ring.right <= geometry.card.right + 0.01,
        `at ${width}px the focus ring fits inside the card`,
      );
      for (const clipper of geometry.clippers) {
        if (clipper.clipsX) {
          assert.ok(
            geometry.ring.left >= clipper.left - 0.01 && geometry.ring.right <= clipper.right + 0.01,
            `at ${width}px ${clipper.name} clips the ring horizontally (ring ${geometry.ring.left.toFixed(1)}..${geometry.ring.right.toFixed(1)} in ${clipper.left.toFixed(1)}..${clipper.right.toFixed(1)})`,
          );
        }
        if (clipper.clipsY) {
          assert.ok(
            geometry.ring.top >= clipper.top - 0.01 && geometry.ring.bottom <= clipper.bottom + 0.01,
            `at ${width}px ${clipper.name} clips the ring vertically (ring ${geometry.ring.top.toFixed(1)}..${geometry.ring.bottom.toFixed(1)} in ${clipper.top.toFixed(1)}..${clipper.bottom.toFixed(1)})`,
          );
        }
        // The official mark is never clipped either.
        assert.ok(
          geometry.img.left >= clipper.left - 0.01 && geometry.img.right <= clipper.right + 0.01
            && geometry.img.top >= clipper.top - 0.01 && geometry.img.bottom <= clipper.bottom + 0.01,
          `at ${width}px ${clipper.name} clips the Icon`,
        );
      }
      assert.ok(geometry.box.height >= 44, `at ${width}px the Watch link is a 44px+ tap target (${geometry.box.height})`);
      assert.ok(Math.abs(geometry.img.height - 186) <= 0.6, `at ${width}px the Icon keeps its 186px box (${geometry.img.height})`);
      assert.ok(
        Math.abs(geometry.img.width / geometry.img.height - 1255 / 1075) <= 0.01,
        `at ${width}px the Icon keeps its own aspect (${(geometry.img.width / geometry.img.height).toFixed(4)})`,
      );
      assert.equal(geometry.imgRadius, "0px", "the Icon is not rounded");
      const mark = await measureVisibleMark(link);
      assert.ok(mark.visibleMarkHeight >= 100, `at ${width}px the visible mark stays >= 100px (${mark.visibleMarkHeight})`);
      assert.ok(mark.visibleMarkWidth >= 140, `at ${width}px the visible mark stays >= 140px wide (${mark.visibleMarkWidth})`);
      await ui.close();
      await fixture.close();
    }
  } finally { await browser.close(); }
});
/* The render-time host check is an EXACT match. A host that only ends with
 * `i.ytimg.com` (`xi.ytimg.com`, `evil-i.ytimg.com`) or prefixes it
 * (`noti.ytimg.com`) must be refused, and nothing may be requested from it. */
test("an endsWith-style i.ytimg.com host falls back to the linked Icon at render time", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const lookalikes = ["https://xi.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg",
    "https://evil-i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg",
    "https://noti.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg"];
  const note = "Metadata from YouTube. Explanations and library actions are HackerTube’s.";
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const host of lookalikes) {
      const fixture = await startFixture([youtubeRow({ art_url: host })]);
      const ui = await browser.newPage();
      let requests = 0;
      await ui.route(new URL(host).origin + "/**", route => {
        requests += 1;
        return route.fulfill({ status: 200, contentType: "image/png", body: THUMB_PNG });
      });
      try {
        await ui.goto(fixture.origin);
        for (const scope of ["#ranked-feed", "#videos"]) {
          const card = ui.locator(scope + " article").first();
          await card.waitFor();
          assert.equal(
            await card.locator("img.ht-thumb").count(), 0,
            `${scope}: a suffix host ${host} is never rendered as a thumbnail`,
          );
          assert.equal(
            await card.getByRole("link", { name: 'Watch "AI introduction" on YouTube' }).count(), 1,
            `${scope}: the linked Icon remains for ${host}`,
          );
          assert.equal(
            await card.getByText(note, { exact: true }).count(), 1,
            `${scope}: the short note remains for ${host}`,
          );
        }
        assert.equal(requests, 0, `${host} is never requested`);
      } finally {
        await ui.close();
        await fixture.close();
      }
    }
  } finally { await browser.close(); }
});
