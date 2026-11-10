"use strict";
// Post-#29 follow-ups: real production bundle and plugin + compiled host CSS;
// stub API/SDK only. Screenshots plus the measurements the card asks for.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startFixture, fixtureItems, loadNodeModule } = require('../../../tests/browser_net_harness');
const out = __dirname;
const hostDir = '/Users/robert/.hermes/hermes-agent/hermes_cli/web_dist/assets';
const hostPath = process.env.HACKERTUBE_HOST_CSS || path.join(hostDir, fs.readdirSync(hostDir).filter(x => /^index-.*\.css$/.test(x))[0]);
const T28 = 'Metadata from YouTube. Explanations and library actions are HackerTube’s.';
(async () => {
  const items = fixtureItems(5);
  items[0] = {...items[0], item_id:'youtube:visual', title:'Jane Austen introduction', format:'video', destination:'https://www.youtube.com/watch?v=visual', art_url:null};
  items[1] = {...items[1], format:'podcast_episode', title:'Reading Jane Austen', contributors:[], duration_seconds:29522, art_url:null};
  const fixture = await startFixture(items);
  const browser = await loadNodeModule('playwright').chromium.launch({headless:true});
  const measures = {hostStylesheet:hostPath, scope:'Production bundle and stylesheet in React fixture with stub SDK/API. No installed dashboard or live provider claim.', viewports:[]};
  try {
    for (const width of [1280, 390]) {
      const tab = await browser.newPage({viewport:{width, height: width===390?844:900}});
      await tab.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== fixture.origin) return route.abort();
        if (url.pathname === '/') {
          const response = await route.fetch();
          return route.fulfill({response, body:(await response.text()).replace('<head>','<head><link rel="stylesheet" href="/host.css">')});
        }
        if (url.pathname === '/host.css') return route.fulfill({contentType:'text/css', body:fs.readFileSync(hostPath)});
        if (url.pathname === '/api/plugins/hackertube/catalog') return route.fulfill({json:{catalog:{items,evidence:items.map(item=>({item_id:item.item_id,source_id:'fixture',kind:'catalog',endorsement:'not_applicable',retrieved_at:'2026-11-06T12:22:22Z'})),sources:[{source_id:'fixture',name:'Recorded fixture'}],editions:[]}}});
        if (url.pathname === '/api/plugins/hackertube/feed') {
          const sections = Object.fromEntries(['videos','podcasts','books','audiobooks'].map(key=>[key,{matches:[],browse:[],match_count:0,browse_count:0}]));
          for (const item of items) { const group=sections[({video:'videos',podcast_episode:'podcasts',book:'books'})[item.format]]; group.matches.push(item.item_id); group.match_count++; }
          return route.fulfill({json:{schema:'hackertube.discovery/1',personalized:true,paid_calls:0,interests:['Jane Austen'],signals:['matched interest'],feed:items.map(item=>item.item_id),why:Object.fromEntries(items.map(item=>[item.item_id,['Matched interest']])),sections}});
        }
        if (url.pathname === '/api/model/auxiliary') return route.fulfill({json:{tasks:[]}});
        if (url.pathname === '/api/plugins/hackertube/sources') return route.fulfill({json:{sources:[]}});
        if (url.pathname === '/api/model/options') return route.fulfill({json:{providers:[{slug:'openrouter',label:'OpenRouter',models:['anthropic/some-very-long-model-identifier-preview-2026-10']}]}});
        return route.continue();
      });
      await tab.goto(fixture.origin);
      await tab.locator('#ranked-feed article').first().waitFor();
      await tab.waitForTimeout(300);

      // 1. T28 note text, exactly. (The ranked feed sits in a closed disclosure,
      // so read textContent; innerText is empty for unrendered content.)
      const noteText = await tab.locator('#ranked-feed article').filter({hasText:'Jane Austen introduction'}).locator('.ht-note').first().evaluate(el=>el.textContent);
      assert.equal(noteText, T28, 'T28 short YouTube note');

      // 2. Compact rows hide the badge in CSS; full cards keep it.
      const compactBadges = await tab.locator('#books .ht-compact .ht-format').count();
      assert.ok(compactBadges > 0, 'compact rows still carry the badge node');
      const compactDisplay = await tab.locator('#books .ht-compact .ht-format').first().evaluate(el=>getComputedStyle(el).display);
      assert.equal(compactDisplay, 'none', 'compact row badge is hidden');
      const fullBadges = await tab.locator('#ranked-feed .ht-card:not(.ht-compact) .ht-format').count();
      assert.ok(fullBadges > 0, 'full cards carry the badge');
      const fullDisplay = await tab.locator('#ranked-feed .ht-card:not(.ht-compact) .ht-format').first().evaluate(el=>getComputedStyle(el).display);
      assert.notEqual(fullDisplay, 'none', 'full card badge stays visible');

      await tab.screenshot({path:path.join(out,`discover-${width}.png`), fullPage:true});

      if (!(await tab.locator('.ht-feed-controls').evaluate(el=>el.open))) {
        await tab.locator('.ht-feed-controls > summary').focus();
        await tab.keyboard.press('Enter');
      }
      await tab.getByRole('button',{name:'Focused search',exact:true}).click();
      await tab.locator('#hackertube-question').waitFor();
      await tab.locator('#hackertube-search-model option').filter({hasText:'some-very-long-model-identifier'}).waitFor({state:'attached'});
      await tab.locator('#hackertube-search-model').selectOption({label:'OpenRouter · anthropic/some-very-long-model-identifier-preview-2026-10'});

      // 3. 44px targets on the management link and the select.
      const targets = await tab.evaluate(() => {
        const link = [...document.querySelectorAll('#hackertube-search-panel a')].find(a => a.textContent.trim() === 'Manage providers in Hermes');
        const select = document.querySelector('#hackertube-search-model');
        const box = el => ({height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, display: getComputedStyle(el).display});
        return {link: box(link), select: box(select)};
      });
      assert.ok(targets.link.height >= 44, 'management link is at least 44px tall: ' + JSON.stringify(targets.link));
      assert.ok(targets.select.height >= 44, 'model select is at least 44px tall: ' + JSON.stringify(targets.select));

      const geometry = await tab.locator('#hackertube-search-panel').evaluate(el=>[el,...el.querySelectorAll('select,input:not([type=checkbox]),.ht-disclosure,.ht-model-picker,a')].map(n=>({tag:n.tagName,id:n.id,class:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth})));
      for (const box of geometry) {
        assert.ok(box.right <= width + 1, 'nothing clips the viewport: ' + JSON.stringify(box));
        assert.ok(box.scrollWidth <= box.clientWidth + 1, 'owning box does not scroll sideways: ' + JSON.stringify(box));
      }
      await tab.screenshot({path:path.join(out,`search-${width}.png`), fullPage:true});
      measures.viewports.push({width, noteText, compactBadges, compactDisplay, fullBadges, fullDisplay, targets, searchBoxes:geometry});
      await tab.close();
    }
    fs.writeFileSync(path.join(out,'geometry.json'), JSON.stringify(measures,null,2)+'\n');
    console.log(JSON.stringify(measures,null,2));
  } finally { await browser.close(); await fixture.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
