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
