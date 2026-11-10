"use strict";
// Offline fixture. Real compiled Hermes dashboard CSS plus plugin CSS, not an
// installed-host render. Model inventory is synthetic and makes no provider call.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const {startFixture, fixtureItems, loadNodeModule} = require("../../../tests/browser_net_harness");
const hostCss = process.env.HACKERTUBE_HOST_CSS || path.join(process.env.HOME,
  ".hermes/hermes-agent/hermes_cli/web_dist/assets/index-CXKdN8QE.css");
const model = "offline-fixture/long-model-id-for-narrow-viewport-verification-2026-11-context-extended";

async function main() {
  const css = fs.readFileSync(hostCss);
  const fixture = await startFixture(fixtureItems(1));
  const browser = await loadNodeModule("playwright").chromium.launch({headless:true});
  try {
    const ui = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
    const attempted = [];
    ui.on("request", request => attempted.push(request.url()));
    await ui.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== fixture.origin) return route.abort();
      if (url.pathname === "/") {
        const response = await route.fetch();
        return route.fulfill({response,body:(await response.text()).replace(
          '<link rel="stylesheet" href="/style.css">',
          '<link rel="stylesheet" href="/host-dashboard.css"><link rel="stylesheet" href="/style.css">')});
      }
      if (url.pathname === "/host-dashboard.css") return route.fulfill({contentType:"text/css",body:css});
      if (url.pathname.startsWith("/assets/")) {
        const asset = path.join(path.dirname(hostCss),path.basename(url.pathname));
        if (fs.existsSync(asset)) return route.fulfill({path:asset});
        return route.abort();
      }
      if (url.pathname === "/api/model/auxiliary") return route.fulfill({json:{tasks:[]}});
      if (url.pathname === "/api/model/options") return route.fulfill({json:{providers:[
        {slug:"stub",label:"Offline stub",authenticated:true,models:[model]},
      ]}});
      return route.continue();
    });
    await ui.goto(fixture.origin);
    await ui.getByRole("button",{name:"Focused search",exact:true}).click();
    const select = ui.locator("#hackertube-search-model");
    await select.selectOption(JSON.stringify(["stub",model]));
    await ui.evaluate(() => document.fonts.ready);
    const measured = await ui.evaluate(() => {
      const picker = document.querySelector(".ht-model-picker");
      const select = document.querySelector("#hackertube-search-model");
      return {
        viewport_width:innerWidth,document_scroll_width:document.documentElement.scrollWidth,
        root_scroll_width:document.querySelector(".hackertube").scrollWidth,
        picker_width:picker.getBoundingClientRect().width,select_width:select.getBoundingClientRect().width,
        selected_value:select.value,selected_label:select.selectedOptions[0].textContent,
        picker_display:getComputedStyle(picker).display,picker_wrap:getComputedStyle(picker).flexWrap,
        body_font:getComputedStyle(document.body).fontFamily,
        host_stylesheet_loaded:[...document.styleSheets].some(s=>s.href && s.href.endsWith("/host-dashboard.css") && s.cssRules.length>0),
      };
    });
    assert.equal(measured.host_stylesheet_loaded,true);
    assert.equal(measured.selected_value,JSON.stringify(["stub",model]));
    // Evidence-only follow-up. Preserve a failing width measurement rather
    // than silently changing layout outside this card's requested fixes.
    measured.overflowing_elements = ["document_scroll_width","root_scroll_width","picker_width","select_width"]
      .filter(key=>measured[key]>390);
    measured.host_css_path = fs.realpathSync(hostCss);
    measured.host_css_sha256 = crypto.createHash("sha256").update(css).digest("hex");
    measured.attempted_requests = attempted;
    assert.equal(fixture.served.filter(r=>r.path.endsWith("/search")).length,0);
    await ui.locator(".ht-search").screenshot({path:path.join(__dirname,"model-picker-390.png")});
    fs.writeFileSync(path.join(__dirname,"model-picker-390.json"),JSON.stringify(measured,null,2)+"\n");
    console.log(JSON.stringify(measured,null,2));
    if (process.argv.includes("--check-reflow")) assert.deepEqual(measured.overflowing_elements,[],
      "390px reflow gate: the long model option overflows its container");
  } finally {await browser.close();await fixture.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
