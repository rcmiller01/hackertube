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

test("a compact YouTube row puts the logo and thumbnail in a side column at 1280 and stacks them at 390", async () => {
  const { THUMB_PNG } = require("./browser_net_harness");
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    for (const [width, expected] of [[1280, "beside"], [390, "above"]]) {
      const fixture = await startFixture(sectionRows());
      const ui = await browser.newPage();
      await ui.setViewportSize({ width, height: 900 });
      await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:THUMB_PNG}));
      await ui.goto(fixture.origin);
      const row = ui.locator("#videos .ht-compact").first();
      await row.waitFor();
      await row.locator("img.ht-thumb").waitFor();
      const geometry = await row.evaluate((el) => {
        const side = el.querySelector(".ht-compact-side");
        const main = el.querySelector(".ht-compact-main");
        if (!side || !main) return { hasColumns: false };
        const s = side.getBoundingClientRect();
        const m = main.getBoundingClientRect();
        const thumb = el.querySelector("img.ht-thumb");
        const logo = el.querySelector(".ht-youtube-icon img");
        return {
          hasColumns: true,
          sideLeft: s.left, sideRight: s.right, sideTop: s.top, sideBottom: s.bottom,
          mainLeft: m.left, mainTop: m.top,
          sideHasThumb: !!thumb && side.contains(thumb),
          sideHasLogo: !!logo && side.contains(logo),
        };
      });
      assert.equal(geometry.hasColumns, true, `at ${width}px the row has a side column and a text column`);
      assert.equal(geometry.sideHasThumb, true, `at ${width}px the thumbnail is in the side column`);
      assert.equal(geometry.sideHasLogo, true, `at ${width}px the logo is in the side column`);
      if (expected === "beside") {
        assert.ok(
          geometry.sideRight <= geometry.mainLeft + 1,
          `at ${width}px the side column (right ${geometry.sideRight.toFixed(1)}) sits left of the text (left ${geometry.mainLeft.toFixed(1)})`,
        );
        assert.ok(
          Math.abs(geometry.sideTop - geometry.mainTop) <= 2,
          `at ${width}px the side column and the text share the row (tops ${geometry.sideTop.toFixed(1)} vs ${geometry.mainTop.toFixed(1)})`,
        );
      } else {
        assert.ok(
          geometry.sideBottom <= geometry.mainTop + 1,
          `at ${width}px the art stacks above the text (art bottom ${geometry.sideBottom.toFixed(1)}, text top ${geometry.mainTop.toFixed(1)})`,
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
