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

/* Every measured width in six runs, because three separate defects hide behind
 * "in light and dark":
 *
 *   * `padding` — the host CardContent padding the fixture draws. At the host's
 *     own padding (11.25px 15px) the ring is clear of the plugin's clip WHATEVER
 *     the plugin's wrapper declares, so reverting the wrapper rule stays GREEN
 *     here; with the padding at 0 only the plugin's own box can keep the ring,
 *     which is what makes that revert fail a BEHAVIOUR test and not only the
 *     stylesheet-text contract in test_dashboard_page.js.
 *   * `scheme` — four entries. `light`: OS light, no `.dark`. `dark`: the host's
 *     own `.dark` ANCESTOR class with the OS scheme left light (how the host
 *     switches its dark variants, `is(.dark *)`). `os-dark`:
 *     `emulateMedia({colorScheme: "dark"})` with NO `.dark` class, which is the
 *     entry a plugin rule under `@media (prefers-color-scheme: dark)` needs.
 *     `os-dark-ancestor`: both at once.
 *
 * The two rules this drives are: at least 95% of each side painted (with 97% the
 * CONTROL ring that has to clear that threshold, not the threshold itself), and
 * 3:1 on every painted pixel. */
const RING_RUNS = [320, 390, 768, 1280].flatMap((width) => [
  {width, scheme: "light", padding: "host"},
  {width, scheme: "dark", padding: "host"},
  {width, scheme: "light", padding: 0},
  {width, scheme: "dark", padding: 0},
  {width, scheme: "os-dark", padding: "host"},
  {width, scheme: "os-dark-ancestor", padding: "host"},
]);

/* Enter a colour scheme the way the host does, and leave the other entry alone
 * so the run proves which one darkened the surface.
 *
 *   * `dark` puts the host's class on an ANCESTOR of the plugin that is not the
 *     root element — `body` — and leaves the OS scheme light;
 *   * `os-dark` emulates the OS scheme and adds no class;
 *   * `os-dark-ancestor` does both.
 *
 * The class has to be installed as an init script so it is present in the
 * document under test, not only in the blank page the test starts from. */
async function enterScheme(ui, scheme) {
  const osDark = scheme === "os-dark" || scheme === "os-dark-ancestor";
  const ancestorDark = scheme === "dark" || scheme === "os-dark-ancestor";
  if (osDark) await ui.emulateMedia({colorScheme: "dark"});
  if (ancestorDark) {
    await ui.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        document.body.classList.add("dark");
      });
    });
  }
}

/* The focus ring as it is actually PAINTED, not as computed style describes it.
 * `outlineColor` alone cannot see a ring's real strength: it drops alpha
 * (`outline-color: rgba(24,24,27,.25)` paints 1.71:1), it ignores `opacity`
 * (`.3` on the focused link paints 1.97:1), and it misreads non-`rgb()` syntax
 * (`color(srgb .6 .6 .6)` paints 2.59:1 but parses as near-black). Decode
 * Chromium's own screenshots in canvas and, at EVERY point along each side's
 * centreline, compare the FOCUSED pixel (the ring) with the UNFOCUSED pixel at
 * the same point (the surface the ring is painted over).
 *
 * Two separate readings come back per side, because two separate defects look
 * identical if they are collapsed into one number:
 *
 *   * `min`    — the minimum ratio over PAINTED pixels only: how strong the ring
 *                actually is where it is drawn. Unpainted pixels are excluded;
 *                they are a COVERAGE finding for the rule below, not a contrast
 *                reading of 1:1. (Before this change the minimum was taken over
 *                every sampled pixel, so any unpainted pixel made a side read
 *                1:1 and the >= 95% coverage rule could never be reached — it
 *                was dead code, and a ring that lost 3% of its pixels was
 *                reported as a contrast failure.)
 *   * `minAll` — the same minimum over every sampled pixel, reported only so the
 *                difference is visible in a failure message and in the receipt.
 *
 * A pixel is PAINTED when at least half of it carries the ring: its channel
 * distance from the surface at that point is at least 50% of the strongest the
 * side shows (`full`). A pixel between the 5% and 50% marks is neither the ring
 * nor the clean surface and is counted as `partial` — a COVERAGE finding for the
 * coverage rule, never a contrast reading. (An anti-aliased edge pixel of a 1px
 * gap reads 1.73:1; under the old fixed `delta > 20` painted test it counted as
 * painted, so a coverage defect was reported as a contrast one.)
 *
 * Also returned: the painted and partly-painted pixel counts (the coverage
 * readings) and — so a side that is clipped away is reported rather than
 * silently measured as 1:1 — which sides the ring falls outside of a clipping
 * ancestor on. */
async function measurePaintedRing(ui, link, before, after, geometry) {
  const allClippers = await link.evaluate(el => {
    const found = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      const clipsX = s.overflowX !== "visible";
      const clipsY = s.overflowY !== "visible";
      if (clipsX || clipsY) {
        const r = node.getBoundingClientRect();
        found.push({
          name: (typeof node.className === "string" && node.className) || node.tagName,
          clipsX, clipsY,
          left: r.left + parseFloat(s.borderLeftWidth),
          top: r.top + parseFloat(s.borderTopWidth),
          right: r.right - parseFloat(s.borderRightWidth),
          bottom: r.bottom - parseFloat(s.borderBottomWidth),
        });
      }
    }
    return found;
  });
  const sides = await ui.evaluate(async ({before, after, box, offset, thickness}) => {
    async function pixels(base64) {
      const image = new Image();
      image.src = "data:image/png;base64," + base64;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return {data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height};
    }
    const a = await pixels(before), b = await pixels(after);
    const spread = offset + thickness / 2;
    const lines = {
      left: [box.left - spread, box.top + 12, box.left - spread, box.bottom - 12],
      right: [box.right + spread, box.top + 12, box.right + spread, box.bottom - 12],
      top: [box.left + 12, box.top - spread, box.right - 12, box.top - spread],
      bottom: [box.left + 12, box.bottom + spread, box.right - 12, box.bottom + spread],
    };
    // WCAG relative luminance and contrast ratio (non-text contrast, 3:1).
    const channel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    const ratio = (fg, bg) => {
      const l1 = luminance(fg), l2 = luminance(bg);
      const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    };
    const out = {};
    for (const [side, [x1, y1, x2, y2]] of Object.entries(lines)) {
      // The strength a pixel is measured against is a FRACTION OF THE RING on
      // that side, not a fixed channel delta: the pixel carrying the most paint
      // is the ring's full colour (whatever alpha or colour syntax the rule
      // used), and every pixel is read against it. A fixed delta (> 20) counts
      // an anti-aliased edge pixel as fully painted, and that is what reported a
      // coverage defect as a 1.73:1 contrast reading.
      let full = 0;
      for (let y = Math.floor(y1); y <= Math.floor(y2); y++) {
        for (let x = Math.floor(x1); x <= Math.floor(x2); x++) {
          if (x < 0 || y < 0 || x >= a.width || y >= a.height) continue;
          const i = 4 * (y * a.width + x);
          const held = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i+1] - b.data[i+1]),
                                Math.abs(a.data[i+2] - b.data[i+2]));
          if (held > full) full = held;
        }
      }
      let painted = 0, partial = 0, total = 0, min = Infinity, minAll = Infinity, minAt = null, unpaintedAt = null, partialAt = null;
      const partialFractions = {};
      for (let y = Math.floor(y1); y <= Math.floor(y2); y++) {
        for (let x = Math.floor(x1); x <= Math.floor(x2); x++) {
          if (x < 0 || y < 0 || x >= a.width || y >= a.height) continue;
          total += 1;
          const i = 4 * (y * a.width + x);
          const surface = [a.data[i], a.data[i+1], a.data[i+2]];
          const ring = [b.data[i], b.data[i+1], b.data[i+2]];
          const held = Math.max(Math.abs(surface[0] - ring[0]), Math.abs(surface[1] - ring[1]), Math.abs(surface[2] - ring[2]));
          const fraction = full > 0 ? held / full : 0;
          const isPainted = fraction >= 0.5;
          // Three states, not two: PAINTED (>= 50% of the ring), cleanly
          // UNPAINTED (<= 5% — the plain surface), and PARTLY painted. A
          // partly-painted pixel is neither, and is a COVERAGE finding — the
          // ring does not line up with the pixel grid or is only half drawn
          // there — so it must not be reported as a contrast reading.
          if (isPainted) painted += 1;
          else if (fraction > 0.05) {
            partial += 1;
            const key = fraction.toFixed(2);
            partialFractions[key] = (partialFractions[key] || 0) + 1;
            if (!partialAt || fraction < partialAt.fraction) {
              partialAt = {x, y, surface, ring, fraction: Number(fraction.toFixed(3))};
            }
          }
          const r = ratio(ring, surface);
          if (r < minAll) { minAll = r; if (!isPainted) unpaintedAt = {x, y, surface, ring, fraction: Number(fraction.toFixed(3))}; }
          if (isPainted && r < min) { min = r; minAt = {x, y, surface, ring}; }
        }
      }
      out[side] = {painted, partial, partialFractions, total, full, minAt, unpaintedAt, partialAt,
                   min: Number.isFinite(min) ? Number(min.toFixed(3)) : null,
                   minAll: Number.isFinite(minAll) ? Number(minAll.toFixed(3)) : null};
    }
    return out;
  }, {before: before.toString("base64"), after: after.toString("base64"), box: geometry.box,
      offset: geometry.outlineOffset, thickness: geometry.outlineWidth});
  // A side whose ring span falls outside a clipping ancestor is not painted at
  // all; that is a clipping finding to report, not a contrast reading of 1:1.
  const spread = geometry.outlineWidth + geometry.outlineOffset;
  const ring = {
    left: geometry.box.left - spread, right: geometry.box.right + spread,
    top: geometry.box.top - spread, bottom: geometry.box.bottom + spread,
  };
  const EPS = 0.5;
  const cut = {};
  for (const side of Object.keys(sides)) {
    cut[side] = allClippers.filter(side === "left" ? c => c.clipsX && ring.left < c.left - EPS
      : side === "right" ? c => c.clipsX && ring.right > c.right + EPS
      : side === "top" ? c => c.clipsY && ring.top < c.top - EPS
      : c => c.clipsY && ring.bottom > c.bottom + EPS);
  }
  // The scheme the run actually landed in, read from the page rather than
  // assumed: the resolved ring token, and whether the dark surface can only
  // have come from the `.dark` ancestor class (class present, OS scheme light).
  const scheme = await link.evaluate((el) => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    return {
      // The token as the ring's own consumer resolves it (the plugin inherits it
      // from whatever ancestor declares the theme).
      resolvedRingToken: getComputedStyle(el).getPropertyValue("--color-ring").trim(),
      ancestorDark: !!(document.body && document.body.classList.contains("dark")),
      osDark: media.matches,
    };
  });
  return {
    sides, cut, clippers: allClippers, ring,
    resolvedRingToken: scheme.resolvedRingToken,
    osDark: scheme.osDark,
    ancestorDark: scheme.ancestorDark,
    darkFromAncestor: scheme.ancestorDark && !scheme.osDark,
  };
}

/* Assert the painted-pixel ring measurement for one focused Watch link. Every
 * side must be painted along its whole centreline, must reach 3:1 against the
 * surface it is painted over, and must not fall outside a clipping ancestor.
 * There is no aggregate allowance: a ring that paints 60% of its pixels is not
 * 60% of a focus indicator. Nor is there a per-side skip: a side that paints
 * nothing is either clipped by an ancestor or the ring is not drawn at all in
 * that colour, and both are defects.
 *
 * The coverage rule has two halves, because a pixel can fail it in two ways:
 *
 *   1. COVERAGE — at least 95% of the side's sampled pixels must be painted
 *      (`painted / total >= 0.95`), AND every remaining pixel must be CLEANLY
 *      unpainted (at most 5% of the ring's own strength on it). A pixel that is
 *      partly painted — the anti-aliased edge of a 1px gap is the real case —
 *      is neither the ring nor the clean surface, and is reported here. That is
 *      the difference between a coverage defect and a contrast reading: before
 *      this change the edge pixel counted as painted (any channel delta > 20)
 *      and the side failed at "1.73:1", which is a contrast number for a
 *      coverage defect.
 *   2. CONTRAST — 3:1 on every PAINTED pixel. The minimum is taken over painted
 *      pixels only: an unpainted pixel is 1:1 by definition and belongs to rule
 *      1, so counting it here would make rule 1 unreachable and would report a
 *      coverage defect as a contrast defect.
 *
 * `sample.minAll` (the minimum over every sampled pixel) is carried in the
 * contrast failure message so the two readings cannot be confused again. */
function assertPaintedRing(ring, label, scheme) {
  for (const [side, sample] of Object.entries(ring.sides)) {
    const clippers = ring.cut[side];
    assert.equal(
      clippers.length, 0,
      `${label}: no ancestor clips the ${side} ring (cut by ${clippers.map(c => c.name).join(", ")}; ` +
        `${sample.painted}/${sample.total} of the side is painted)`,
    );
    assert.ok(
      sample.total > 0 && sample.painted / sample.total >= 0.95,
      `${label}: at least 95% of the ${side} ring is painted (${sample.painted}/${sample.total} pixels` +
        `${sample.total ? `, ${(100 * sample.painted / sample.total).toFixed(1)}%` : ""})`,
    );
    const fractions = Object.entries(sample.partialFractions || {})
      .map(([fraction, count]) => `${count} at ${(100 * Number(fraction)).toFixed(0)}%`).join(", ");
    assert.equal(
      sample.partial, 0,
      `${label}: the ${side} ring is painted on whole pixels — its coverage reading is a paint/clean ` +
        `split, and ${sample.partial} of ${sample.total} pixels are partly painted` +
        `${sample.partialAt ? ` (weakest ring rgb(${sample.partialAt.ring.join(",")}) on surface ` +
          `rgb(${sample.partialAt.surface.join(",")}) at ${sample.partialAt.x},${sample.partialAt.y})` : ""}` +
        `${fractions ? ` [${fractions}]` : ""}; that is a COVERAGE defect, not a contrast reading`,
    );
    const where = sample.minAt;
    assert.ok(
      sample.min !== null && sample.min >= 3,
      `${label}: every painted pixel of the ${side} ring reaches >= 3:1` +
        ` (min over painted pixels ${sample.min === null ? "unpainted" : sample.min.toFixed(2) + ":1"}` +
        `${where ? `, ring rgb(${where.ring.join(",")}) on surface rgb(${where.surface.join(",")}) at ${where.x},${where.y}` : ""}` +
        `; min over every sampled pixel ${sample.minAll === null ? "n/a" : sample.minAll.toFixed(2) + ":1"}` +
        `${sample.painted === sample.total ? "" : `, ${sample.painted}/${sample.total} painted`})`,
    );
  }
  // The scheme is what the ring is measured against, so prove the run really
  // landed in it: a dark run that measured a light surface would pass for the
  // wrong reason, and the light run would never exercise a dark ring. Each dark
  // entry also asserts WHICH entry darkened it — the `.dark` ancestor class with
  // the OS scheme left light, the emulated OS scheme with no class, or both — so
  // an `emulateMedia` run cannot quietly be a `.dark` run (or the reverse).
  const dark = scheme !== "light";
  const sample = ring.sides.left.minAt || ring.sides.top.minAt;
  const surface = sample.surface;
  const channel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const luminance = 0.2126 * channel(surface[0]) + 0.7152 * channel(surface[1]) + 0.0722 * channel(surface[2]);
  if (dark) {
    assert.ok(luminance < 0.2,
      `${label}: the ${scheme} run measures a dark surface behind the ring (luminance ${luminance.toFixed(3)} on rgb(${surface.join(",")}))`);
  } else {
    assert.ok(luminance > 0.5,
      `${label}: the light run measures a light surface behind the ring (luminance ${luminance.toFixed(3)} on rgb(${surface.join(",")}))`);
  }
  if (scheme === "dark") {
    assert.equal(ring.darkFromAncestor, true,
      `${label}: the dark surface comes from the .dark ancestor class, with the OS scheme left light`);
  }
  if (scheme === "os-dark") {
    assert.equal(ring.osDark, true, `${label}: the OS colour scheme is dark, entered with emulateMedia`);
    assert.equal(ring.ancestorDark, false,
      `${label}: the OS-dark run carries no .dark class, so only an OS-scheme rule can be what darkens it`);
  }
  if (scheme === "os-dark-ancestor") {
    assert.equal(ring.osDark, true, `${label}: the OS colour scheme is dark, entered with emulateMedia`);
    assert.equal(ring.ancestorDark, true, `${label}: the .dark ancestor class is set as well`);
  }
  if (scheme === "light") {
    assert.equal(ring.osDark, false, `${label}: the light run's OS scheme is light`);
    assert.equal(ring.ancestorDark, false, `${label}: the light run carries no .dark class`);
  }
  assert.equal(ring.resolvedRingToken, dark ? "#ffe6cb" : "#18181b",
    `${label}: the ring token resolves to the measured host value for the scheme`);
}

/* The full card's Watch link was wider than the card on each side — 3.6px at
 * 320px — and the block that holds it clipped at its own edge, which is exactly
 * the link's edge, so the focus ring was cut away on every side. The card is
 * what constrains the link, not the viewport: a one-item ranked feed is a single
 * 17rem grid track at EVERY width, so the same overhang appears at 1280 too.
 * The link must fit inside the card, keep a 44px tap target, keep the official
 * mark at its published size and clear space, and have its ring inside every
 * clipping ancestor. */
test("the full card's Watch link and its focus ring stay inside the card, at 320 through 1280, in light and dark", async (t) => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const { width, scheme, padding } of RING_RUNS) {
      const fixture = await startFixture([youtubeRow()], {}, {cardPadding: padding});
      const ui = await browser.newPage();
      await enterScheme(ui, scheme);
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
      // Keep the whole ring in the screenshot, even near the fold. Capture
      // before focusing so a computed outline cannot stand in for actual paint.
      await ui.setViewportSize({ width, height: 1600 });
      await link.scrollIntoViewIfNeeded();
      await link.evaluate(el => el.blur());
      const unfocused = await ui.screenshot();
      // Reach the Watch link the way a keyboard user does: focus the card's
      // own title (a heading, reached by heading navigation) and press Tab. No
      // link.focus() shortcut, so the focused state proves the link is
      // reachable by keyboard in this row's own focus order.
      await ui.evaluate(() => {
        const title = document.querySelector("#ranked-feed .ht-title");
        title.setAttribute("tabindex", "-1");
        title.focus();
      });
      await ui.keyboard.press("Tab");
      assert.equal(
        await link.evaluate(el => document.activeElement === el),
        true,
        `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} Tab from the card title reaches the Watch link`,
      );
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
          focused: document.activeElement === el,
          outlineStyle: style.outlineStyle,
          outlineColor: style.outlineColor,
          outlineWidth: parseFloat(style.outlineWidth),
          outlineOffset: parseFloat(style.outlineOffset),
          padding: style.padding,
          box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
          ring: { left: box.left - spread, right: box.right + spread, top: box.top - spread, bottom: box.bottom + spread, spread },
          card: { left: cardBox.left, right: cardBox.right },
          clippers,
          img: { left: imgBox.left, right: imgBox.right, top: imgBox.top, bottom: imgBox.bottom, width: imgBox.width, height: imgBox.height },
          imgRadius: getComputedStyle(img).borderRadius,
        };
      });
      assert.equal(geometry.focused, true, "measure the focused Watch link");
      assert.notEqual(geometry.outlineStyle, "none", "the focused link must have an outline");
      assert.ok(geometry.outlineWidth > 0, "the focus outline has nonzero width");
      assert.ok(geometry.ring.spread > 0, "the link carries a real focus ring to keep: " + geometry.ring.spread);
      const focused = await ui.screenshot();
      // WCAG 2.4.11 / 1.4.11: the focus indicator must reach 3:1 against the
      // surface it is PAINTED over, at every existing viewport width, on every
      // side and at every point along it. The old check read the ring colour
      // from computed `outlineColor` and one surface pixel per side, which
      // alpha, `opacity` and non-`rgb()` syntax all slip past; this measures
      // the focused screenshot pixel against the unfocused pixel at the same
      // point instead, and keeps the computed-style checks above as preconditions.
      const ring = await measurePaintedRing(ui, link, unfocused, focused, geometry);
      assertPaintedRing(ring, `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the full card's Watch link`, scheme);
      assert.ok(
        geometry.box.left >= geometry.card.left - 0.01 && geometry.box.right <= geometry.card.right + 0.01,
        `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the Watch link fits inside the card (${geometry.box.left.toFixed(1)}..${geometry.box.right.toFixed(1)} in ${geometry.card.left.toFixed(1)}..${geometry.card.right.toFixed(1)})`,
      );
      assert.ok(
        geometry.ring.left >= geometry.card.left - 0.01 && geometry.ring.right <= geometry.card.right + 0.01,
        `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the focus ring fits inside the card`,
      );
      for (const clipper of geometry.clippers) {
        if (clipper.clipsX) {
          assert.ok(
            geometry.ring.left >= clipper.left - 0.01 && geometry.ring.right <= clipper.right + 0.01,
            `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} ${clipper.name} clips the ring horizontally (ring ${geometry.ring.left.toFixed(1)}..${geometry.ring.right.toFixed(1)} in ${clipper.left.toFixed(1)}..${clipper.right.toFixed(1)})`,
          );
        }
        if (clipper.clipsY) {
          assert.ok(
            geometry.ring.top >= clipper.top - 0.01 && geometry.ring.bottom <= clipper.bottom + 0.01,
            `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} ${clipper.name} clips the ring vertically (ring ${geometry.ring.top.toFixed(1)}..${geometry.ring.bottom.toFixed(1)} in ${clipper.top.toFixed(1)}..${clipper.bottom.toFixed(1)})`,
          );
        }
        // The official mark is never clipped either.
        assert.ok(
          geometry.img.left >= clipper.left - 0.01 && geometry.img.right <= clipper.right + 0.01
            && geometry.img.top >= clipper.top - 0.01 && geometry.img.bottom <= clipper.bottom + 0.01,
          `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} ${clipper.name} clips the Icon`,
        );
      }
      assert.ok(geometry.box.height >= 44, `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the Watch link is a 44px+ tap target (${geometry.box.height})`);
      assert.ok(Math.abs(geometry.img.height - 186) <= 0.6, `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the Icon keeps its 186px box (${geometry.img.height})`);
      assert.ok(
        Math.abs(geometry.img.width / geometry.img.height - 1255 / 1075) <= 0.01,
        `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the Icon keeps its own aspect (${(geometry.img.width / geometry.img.height).toFixed(4)})`,
      );
      assert.equal(geometry.imgRadius, "0px", "the Icon is not rounded");
      const mark = await measureVisibleMark(link);
      assert.ok(mark.visibleMarkHeight >= 100, `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the visible mark stays >= 100px (${mark.visibleMarkHeight})`);
      assert.ok(mark.visibleMarkWidth >= 140, `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the visible mark stays >= 140px wide (${mark.visibleMarkWidth})`);
    }
  } finally { await browser.close(); }
});

/* The compact row's Watch link carries the same ring as the full card's, one
 * breakpoint lower and at the very edge of its row. At 320px and 390px the
 * media column starts at the inner `.hackertube`'s content edge, so with the
 * host's CardContent padding at 0 the ring's left stroke survives only because
 * the PLUGIN's own wrapper reserves the ring's 4px inside its own padding box.
 * An earlier fixture stubbed CardContent as a bare div, which manufactured a
 * 4px clip the dashboard does not have and let a clipped ring pass as a
 * "reported" side.
 *
 * Both host paddings are measured, for the reason the padding-0 runs exist: at
 * the host's own measured padding (15px inline) the ring clears the wrapper's
 * clip WHATEVER the wrapper declares, so reverting the wrapper rule leaves these
 * runs green and only the stylesheet-text contract notices. RING_RUNS therefore
 * carries a padding-0 entry beside every scheme: only there does the plugin's
 * own box decide, and reverting the wrapper rule fails a BEHAVIOUR test — the
 * left ring is cut by `hackertube` at 0/163 painted. No side is exempt in either
 * case: every side must be painted, unclipped and >= 3:1. */
test("a compact YouTube row's Watch link focus ring reaches 3:1 against the surface it paints over, in light and dark", async (t) => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const { width, scheme, padding } of RING_RUNS) {
      const fixture = await startFixture(sectionRows(), {}, {cardPadding: padding});
      const ui = await browser.newPage();
      await enterScheme(ui, scheme);
      t.after(async () => {
        await ui.close().catch(() => {});
        await fixture.close().catch(() => {});
      });
      await ui.setViewportSize({ width, height: 900 });
      await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
      await ui.goto(fixture.origin);
      await ui.locator("#videos .ht-compact").first().waitFor();
      const link = ui.locator("#videos .ht-compact").first().locator(".ht-youtube-icon");
      await link.waitFor();
      // Keep the whole ring in the screenshot, even near the fold. Capture
      // before focusing so a computed outline cannot stand in for actual paint.
      await ui.setViewportSize({ width, height: 1600 });
      await link.scrollIntoViewIfNeeded();
      await link.evaluate(el => el.blur());
      const unfocused = await ui.screenshot();
      // Reach the compact row's Watch link the way a keyboard user does: focus
      // the row's own title (a heading, reached by heading navigation) and Tab.
      await ui.evaluate(() => {
        const title = document.querySelector("#videos .ht-compact .ht-title");
        title.setAttribute("tabindex", "-1");
        title.focus();
      });
      await ui.keyboard.press("Tab");
      assert.equal(
        await link.evaluate(el => document.activeElement === el),
        true,
        `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} Tab from the compact row's title reaches its own Watch link`,
      );
      const geometry = await link.evaluate(el => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        return {
          focused: document.activeElement === el,
          outlineStyle: style.outlineStyle,
          outlineColor: style.outlineColor,
          outlineWidth: parseFloat(style.outlineWidth),
          outlineOffset: parseFloat(style.outlineOffset),
          box: {left: box.left, right: box.right, top: box.top, bottom: box.bottom},
          ring: {left: box.left - spread, right: box.right + spread, top: box.top - spread, bottom: box.bottom + spread, spread},
        };
      });
      assert.equal(geometry.focused, true, `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} measure the focused compact Watch link`);
      assert.notEqual(geometry.outlineStyle, "none", `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the focused compact link must have an outline`);
      assert.ok(geometry.outlineWidth > 0, `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the compact focus outline has nonzero width`);
      assert.ok(geometry.ring.spread > 0, `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the compact link carries a real focus ring to keep: ${geometry.ring.spread}`);
      const focused = await ui.screenshot();
      const ring = await measurePaintedRing(ui, link, unfocused, focused, geometry);
      assertPaintedRing(ring, `at ${width}px ${scheme}${padding === 0 ? " host-padding-0" : ""} the compact row's Watch link`, scheme);
    }
  } finally { await browser.close(); }
});

/* The >= 95% painted rule has to be REACHABLE, and it has to be the rule that
 * speaks when a ring loses a few per-cent of its pixels. Before this change the
 * 3:1 check took its minimum over EVERY sampled pixel, so one unpainted pixel
 * made a side read 1:1 and the coverage rule could never fire at all: a ring
 * that was 97% painted was reported as "1:1 contrast", and the 95% threshold was
 * dead code. The minimum is now taken over painted pixels only, so the two rules
 * read two different things and both are live.
 *
 * This control pins all three readings on ONE measurement of a ring that is
 * 96.9% painted on the left stroke. The pixels are removed with a `clip-path`
 * slit cut through the MIDDLE of the focused link, which is the only way to drop
 * a few per-cent of the ring's own pixels without a clipping ANCESTOR — an
 * ancestor clip is caught first, by the cut check, because that check reads
 * geometry and would report the clip.
 *
 *   * 158/163 = 96.9% painted        -> the coverage rule passes,
 *   * min over PAINTED pixels is the ring's own contrast -> the contrast rule passes,
 *   * min over EVERY pixel  = 1.0    -> what the old rule read (it failed here).
 *
 * The same slit widened to 94% must FAIL the coverage rule, so the threshold is
 * shown to bite in both directions.
 *
 * The third case is the 1px GAP, and it is the one that used to be MISREPORTED.
 * A 1px slit whose edges fall on a fractional pixel row leaves its two boundary
 * rows partly painted. The old painted test (any channel delta > 20) counted
 * those rows as painted, so the coverage rule never saw the gap and the side was
 * reported as a CONTRAST failure at the partially-painted pixel's ratio
 * (~1.73:1) — a coverage defect wearing a contrast number. Under the >= 50%
 * painted rule the boundary row is neither painted nor clean, and the coverage
 * rule is what speaks. The gap is only one pixel of a 163-pixel side, so its
 * PAINTED fraction (99.4%) clears 95% on its own: the partly-painted half of the
 * coverage rule, not the fraction, is what catches it — which is exactly why the
 * rule has both halves. */
test("a ring that is 97% painted passes the coverage rule while the old all-pixel minimum would not; a 1px gap fails as coverage", async (t) => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
  // A `clip-path` slit through the middle of the focused link: `rows` pixel
  // rows of the link's outline are removed, starting at an INTEGER pixel row
  // plus `offsetFraction`, so `offsetFraction` 0 removes whole pixel rows and
  // leaves no boundary pixel half-blended, while a fractional offset splits the
  // boundary. The slit runs from left of the ring to 60% of the link's width, so
  // it cuts the LEFT stroke's middle and leaves the right, top and bottom
  // strokes whole.
  const slit = (y0, y1) => "polygon(" +
    "-20px -20px, calc(100% + 20px) -20px, calc(100% + 20px) calc(100% + 20px), -20px calc(100% + 20px), " +
    `-20px ${y1}px, 60% ${y1}px, 60% ${y0}px, -20px ${y0}px)`;
  async function measureWithSlit(rows, offsetFraction = 0) {
    const fixture = await startFixture(sectionRows());
    const ui = await browser.newPage();
    t.after(async () => {
      await ui.close().catch(() => {});
      await fixture.close().catch(() => {});
    });
    await ui.setViewportSize({width: 320, height: 900});
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
    await ui.goto(fixture.origin);
    await ui.locator("#videos .ht-compact").first().waitFor();
    const link = ui.locator("#videos .ht-compact").first().locator(".ht-youtube-icon");
    await link.waitFor();
    await ui.setViewportSize({width: 320, height: 1600});
    await link.scrollIntoViewIfNeeded();
    // The slit is part of BOTH captures, so the unfocused pixel at each sampled
    // point is still the surface that pixel paints over.
    const band = await link.evaluate((el, options) => {
      const b = el.getBoundingClientRect();
      const top = Math.round(b.top + b.height / 2 - options.rows / 2) + options.offsetFraction;
      return {y0: top - b.top, y1: top - b.top + options.rows};
    }, {rows, offsetFraction});
    await link.evaluate((el, path) => { el.style.clipPath = path; }, slit(band.y0, band.y1));
    await link.evaluate(el => el.blur());
    const unfocused = await ui.screenshot();
    await ui.evaluate(() => {
      const title = document.querySelector("#videos .ht-compact .ht-title");
      title.setAttribute("tabindex", "-1");
      title.focus();
    });
    await ui.keyboard.press("Tab");
    assert.equal(
      await link.evaluate(el => document.activeElement === el),
      true,
      `the ${rows}-row slit control reaches the compact row's Watch link`,
    );
    const geometry = await link.evaluate(el => {
      const style = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      return {
        focused: document.activeElement === el,
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
        outlineOffset: parseFloat(style.outlineOffset),
        box: {left: b.left, right: b.right, top: b.top, bottom: b.bottom},
        ring: {left: b.left - spread, right: b.right + spread, top: b.top - spread, bottom: b.bottom + spread, spread},
      };
    });
    assert.equal(geometry.focused, true, `the ${rows}-row slit control measures the focused link`);
    assert.notEqual(geometry.outlineStyle, "none", `the ${rows}-row slit control has a real outline to cut`);
    const focused = await ui.screenshot();
    return measurePaintedRing(ui, link, unfocused, focused, geometry);
  }

  const green = await measureWithSlit(5);
  for (const side of ["left"]) {
    const sample = green.sides[side];
    const fraction = sample.painted / sample.total;
    assert.ok(
      fraction >= 0.95 && fraction < 1,
      `the 97% control really is partly painted on the ${side} (${sample.painted}/${sample.total} = ${(100 * fraction).toFixed(1)}%)`,
    );
    assert.ok(
      sample.min !== null && sample.min >= 3,
      `the 97% control's painted pixels still reach 3:1 on the ${side} (min over painted pixels ${sample.min})`,
    );
    assert.ok(
      sample.minAll !== null && sample.minAll < 3,
      `the old all-pixel minimum reads the unpainted pixels on the ${side} as 1:1 (${sample.minAll})`,
    );
  }
  // The rules the suite actually ships: the 97%-painted ring passes both.
  assertPaintedRing(green, "the 97%-painted ring control", "light");

  // And the same defect, wider, must fail the coverage rule — so the 95%
  // threshold is shown to bite rather than to be satisfied by anything.
  const red = await measureWithSlit(12);
  const redFraction = red.sides.left.painted / red.sides.left.total;
  assert.ok(
    redFraction < 0.95,
    `the 94% control really is under the threshold on the left (${red.sides.left.painted}/${red.sides.left.total} = ${(100 * redFraction).toFixed(1)}%)`,
  );
  assert.throws(
    () => assertPaintedRing(red, "the 94%-painted ring control", "light"),
    /at least 95% of the left ring is painted/,
    "a ring under 95% painted fails the coverage rule",
  );

  // And the 1px gap — the case that used to be reported as a CONTRAST failure.
  // Its slit's edges fall on a fractional pixel row, so the two rows it touches
  // are partly painted; the old painted test (any channel delta > 20) counted
  // both, so the coverage rule never fired and the side failed at the partial
  // pixel's own ratio. Now the partial row is neither painted nor clean and the
  // coverage rule speaks.
  const gap = await measureWithSlit(1, 0.25);
  const gapSide = gap.sides.left;
  assert.ok(
    gapSide.painted / gapSide.total >= 0.95,
    `the 1px-gap control's PAINTED fraction clears the 95% threshold on its own ` +
      `(${gapSide.painted}/${gapSide.total}), so only the partly-painted half of the coverage rule can catch it`,
  );
  assert.ok(
    gapSide.partial > 0,
    `the 1px-gap control really leaves a partly-painted pixel on the left (${JSON.stringify(gapSide.partialFractions)})`,
  );
  assert.ok(
    gapSide.min !== null && gapSide.min >= 3,
    `the 1px-gap control's PAINTED pixels still clear 3:1 on the left (min over painted pixels ` +
      `${gapSide.min}:1, min over every sampled pixel ${gapSide.minAll}:1) — the old rule read the ` +
      `partly-painted pixel as painted and failed on ITS ratio instead`,
  );
  assert.throws(
    () => assertPaintedRing(gap, "the 1px-gap ring control", "light"),
    /partly painted/,
    "a 1px gap fails as a COVERAGE finding, not as a contrast reading",
  );
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
