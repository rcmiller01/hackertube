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
    assert.equal(await logo.evaluate(el=>el.getBoundingClientRect().height),100);
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
    await ui.locator("#podcasts .ht-compact .ht-format").first().waitFor();
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
  const { PIXEL_PNG } = require("./browser_net_harness");
  const fixture = await startFixture([youtubeRow()]);
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    let thumbRequests = 0;
    await ui.route("https://i.ytimg.com/**", route => { thumbRequests += 1; return route.fulfill({status:200, contentType:"image/png", body:PIXEL_PNG}); });
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
  const { PIXEL_PNG } = require("./browser_net_harness");
  const fixture = await startFixture(sectionRows());
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage();
    await ui.setViewportSize({width:390, height:900});
    await ui.route("https://i.ytimg.com/**", route => route.fulfill({status:200, contentType:"image/png", body:PIXEL_PNG}));
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
    const note = await row.getByText("Metadata from YouTube. Explanations and library actions are HackerTube’s.", {exact:true}).count();
    assert.equal(note, 1);
    // The row is still a compact row, not a full card.
    assert.equal(await row.evaluate(el => el.className), "ht-card ht-compact");
  } finally { await browser.close(); await fixture.close(); }
});
