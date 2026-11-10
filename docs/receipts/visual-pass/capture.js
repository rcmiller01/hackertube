"use strict";
// Real production bundle and plugin + compiled host CSS; stub API/SDK only.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startFixture, fixtureItems, loadNodeModule } = require('../../../tests/browser_net_harness');
const out = __dirname;
const hostDir = '/Users/robert/.hermes/hermes-agent/hermes_cli/web_dist/assets';
const hostPath = process.env.HACKERTUBE_HOST_CSS || path.join(hostDir, fs.readdirSync(hostDir).filter(x => /^index-.*\.css$/.test(x))[0]);
const phase = process.argv[2];
(async () => {
  const items = fixtureItems(5);
  items[0] = {...items[0], item_id:'youtube:visual', title:'Jane Austen introduction', format:'video', destination:'https://www.youtube.com/watch?v=visual', art_url:null};
  items[1] = {...items[1], format:'podcast_episode', title:'Reading Jane Austen', contributors:[], duration_seconds:29522, art_url:null};
  const fixture = await startFixture(items);
  const browser = await loadNodeModule('playwright').chromium.launch({headless:true});
  const measures = {phase, hostStylesheet:hostPath, scope:'Production bundle and stylesheet in React fixture with stub SDK/API. No installed dashboard or live provider claim.', viewports:[]};
  try {
    for (const width of [1280,390]) {
      const tab = await browser.newPage({viewport:{width,height:width===390?844:900}});
      await tab.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== fixture.origin) return route.abort();
        if (url.pathname === '/') {
          const response = await route.fetch();
          return route.fulfill({response,body:(await response.text()).replace('<head>','<head><link rel="stylesheet" href="/host.css">')});
        }
        if (url.pathname === '/host.css') return route.fulfill({contentType:'text/css',body:fs.readFileSync(hostPath)});
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
      const first = await tab.locator('#ranked-feed article').first().evaluate(el=>el.getBoundingClientRect().top + scrollY);
      const controlsOpen = await tab.locator('.ht-feed-controls').evaluate(el=>el.open);
      if (phase==='after') assert.equal(controlsOpen,false,'stored interests collapse controls in real React');
      await tab.screenshot({path:path.join(out,`${phase}-discover-${width}.png`),fullPage:true});
      if (!controlsOpen) { await tab.locator('.ht-feed-controls > summary').focus(); await tab.keyboard.press('Enter'); }
      await tab.getByRole('button',{name:'Focused search',exact:true}).click();
      await tab.locator('#hackertube-question').waitFor();
      await tab.locator('#hackertube-search-model option').filter({hasText:'some-very-long-model-identifier'}).waitFor({state:'attached'});
      await tab.locator('#hackertube-search-model').selectOption({label:'OpenRouter · anthropic/some-very-long-model-identifier-preview-2026-10'});
      const geometry = await tab.locator('#hackertube-search-panel').evaluate(el=>[el,...el.querySelectorAll('select,input:not([type=checkbox]),.ht-disclosure,.ht-model-picker,a')].map(n=>({tag:n.tagName,id:n.id,class:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth})));
      const art = await tab.locator('#ranked-feed .ht-youtube-brand').first().evaluate(el=>({width:el.getBoundingClientRect().width,parent:el.parentElement.getBoundingClientRect().width}));
      if (phase==='after') {
        for(const box of geometry) { assert.ok(box.right<=width+1,JSON.stringify(box)); assert.ok(box.scrollWidth<=box.clientWidth+1,JSON.stringify(box)); }
        assert.ok(art.width<=art.parent+1);
        assert.equal(await tab.locator('#books .ht-art').count(),0);
        assert.equal(await tab.locator('#ranked-feed > div > .ht-explain').getByText('How this feed is ordered').count(),1);
        assert.equal(await tab.getByRole('link',{name:'Manage providers in Hermes'}).evaluate(el=>getComputedStyle(el).textDecorationLine),'underline');
      }
      await tab.screenshot({path:path.join(out,`${phase}-search-${width}.png`),fullPage:true});
      measures.viewports.push({width,firstFeedCardTop:first,controlsOpen,searchBoxes:geometry,youTubeArt:art});
      await tab.close();
    }
    fs.writeFileSync(path.join(out,`${phase}-geometry.json`),JSON.stringify(measures,null,2)+'\n');
    console.log(JSON.stringify(measures,null,2));
  } finally {await browser.close(); await fixture.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
