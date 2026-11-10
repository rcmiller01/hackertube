"use strict";
// Fixed-state capture for t_0544b6fb. Offline fixture with the real compiled
// Hermes dashboard stylesheet plus the plugin stylesheet, a selected long
// synthetic model id, at a 390px viewport. Unlike the historical
// model-picker-390.js capture, this one asserts the passing containment that the
// layout fix delivers and writes under its own names so the parent receipt's
// failing measurement stays intact. No provider call, no Search submission.
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
      const box = sel => {
        const el = document.querySelector(sel);
        return {selector:sel,rect_width:el.getBoundingClientRect().width,
          client_width:el.clientWidth,scroll_width:el.scrollWidth,
          clipped:el.scrollWidth>el.clientWidth+0.5,right:el.getBoundingClientRect().right};
      };
      const select = document.querySelector("#hackertube-search-model");
      return {
        viewport_width:innerWidth,document_scroll_width:document.documentElement.scrollWidth,
        root_scroll_width:document.querySelector(".hackertube").scrollWidth,
        picker_width:document.querySelector(".ht-model-picker").getBoundingClientRect().width,
        select_width:select.getBoundingClientRect().width,
        selected_value:select.value,selected_label:select.selectedOptions[0].textContent,
        picker_display:getComputedStyle(document.querySelector(".ht-model-picker")).display,
        picker_wrap:getComputedStyle(document.querySelector(".ht-model-picker")).flexWrap,
        select_min_width:getComputedStyle(select).minWidth,
        form_min_width:getComputedStyle(document.querySelector("form#hackertube-search-panel")).minWidth,
        body_font:getComputedStyle(document.body).fontFamily,
        host_stylesheet_loaded:[...document.styleSheets].some(s=>s.href && s.href.endsWith("/host-dashboard.css") && s.cssRules.length>0),
        boxes:[".hackertube",".ht-search","form#hackertube-search-panel",".ht-model-picker","#hackertube-search-model"].map(box),
      };
    });
    assert.equal(measured.host_stylesheet_loaded,true);
    assert.equal(measured.selected_value,JSON.stringify(["stub",model]));
    // The passing containment gate: no owning box is wider than the 390px
    // viewport and none clips its own content (the masked failure mode).
    measured.overflowing_elements = measured.boxes
      .filter(box=>box.clipped || box.right>measured.viewport_width+0.5 || box.rect_width>measured.viewport_width+0.5)
      .map(box=>box.selector);
    measured.host_css_path = fs.realpathSync(hostCss);
    measured.host_css_sha256 = crypto.createHash("sha256").update(css).digest("hex");
    measured.attempted_requests = attempted;
    assert.equal(fixture.served.filter(r=>r.path.endsWith("/search")).length,0);
    await ui.locator(".ht-search").screenshot({path:path.join(__dirname,"model-picker-reflow-fix.png")});
    fs.writeFileSync(path.join(__dirname,"model-picker-reflow-fix.json"),JSON.stringify(measured,null,2)+"\n");
    console.log(JSON.stringify(measured,null,2));
    assert.deepEqual(measured.overflowing_elements,[],"390px reflow gate: a box still overflows its container");
  } finally {await browser.close();await fixture.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
