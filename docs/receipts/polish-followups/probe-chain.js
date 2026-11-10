"use strict";
// Diagnostic probe (not shipped): walks the ancestor chain of the model select
// at 390px with the real host stylesheet, and reports each box's measured and
// intrinsic widths so the sizing owner is named, not guessed.
const fs = require("node:fs");
const path = require("node:path");
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

    const chain = await ui.evaluate(() => {
      function desc(el){
        const id = el.id ? "#"+el.id : "";
        const cls = el.className && typeof el.className === "string"
          ? "."+el.className.trim().split(/\s+/).join(".") : "";
        return el.tagName.toLowerCase()+id+cls;
      }
      function intrinsic(el, kind){
        // measure min-content / max-content via a clone in a shrink-to-fit bath
        const probe = el.cloneNode(true);
        const bath = document.createElement("div");
        bath.style.cssText = "position:absolute;left:-99999px;top:0;"+
          (kind==="min" ? "width:min-content;" : "width:max-content;")+
          "visibility:hidden;";
        bath.appendChild(probe);
        document.body.appendChild(bath);
        const w = probe.getBoundingClientRect().width;
        bath.remove();
        return Math.round(w*10)/10;
      }
      const out = [];
      let el = document.querySelector("#hackertube-search-model");
      while (el) {
        const cs = getComputedStyle(el);
        out.push({
          el: desc(el),
          rect_w: Math.round(el.getBoundingClientRect().width*10)/10,
          offset_w: el.offsetWidth,
          scroll_w: el.scrollWidth,
          client_w: el.clientWidth,
          overflowing: el.scrollWidth > el.clientWidth + 0.5,
          display: cs.display,
          flex: cs.flexDirection + " wrap=" + cs.flexWrap,
          align_items: cs.alignItems,
          width: cs.width,
          min_width: cs.minWidth,
          max_width: cs.maxWidth,
          overflow_x: cs.overflowX,
          min_content_w: intrinsic(el,"min"),
          max_content_w: intrinsic(el,"max"),
        });
        el = el.parentElement;
      }
      return {viewport: innerWidth, chain: out};
    });
    console.log(JSON.stringify(chain,null,2));
    fs.writeFileSync(path.join(__dirname,"probe-chain.json"),JSON.stringify(chain,null,2)+"\n");
  } finally {await browser.close();await fixture.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
