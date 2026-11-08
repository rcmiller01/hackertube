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
    await ui.getByRole("heading",{name:"HackerTube",exact:true}).waitFor();
    const accepted = fixture.served.find(x => x.method === "POST" && x.path.endsWith("/privacy"));
    assert.deepEqual(JSON.parse(accepted.body),{version:"test",accepted:true});
    await ui.getByRole("button",{name:"Privacy",exact:true}).click();
    await ui.getByLabel("Delete all HackerTube data in this profile").check();
    await ui.getByRole("button",{name:"Delete HackerTube data and revoke agreement"}).click();
    await ui.getByRole("alert").filter({hasText:"Deletion did not complete"}).waitFor();
    assert.equal(await ui.getByRole("heading",{name:"HackerTube",exact:true}).count(),1);
    await ui.getByRole("button",{name:"Delete HackerTube data and revoke agreement"}).click();
    await agree.waitFor();
    assert.equal(await ui.getByRole("heading",{name:"HackerTube",exact:true}).count(),0);
    assert.equal(await agree.isDisabled(),true);
  } finally { await browser.close(); await fixture.close(); }
});
