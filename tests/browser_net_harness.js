"use strict";
/* Browser observation receipt, NOT the Python production ledger.
 * Serves the real page bundle against an explicitly stubbed local API.
 * The separate Python route harness exercises the real routes/store.
 * Playwright observes browser resource requests with artwork enabled;
 * external responses are fulfilled offline, so counts are browser attempts,
 * not live provider deliveries or an enforcement boundary shipped in the UI.
 * Unknown destinations are marked outside; they never inherit free status.
 */

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const PAGE_PATH = path.resolve(__dirname, "../hackertube/dashboard/dist/index.js");
const STYLE_PATH = path.resolve(__dirname, "../hackertube/dashboard/dist/style.css");

/** The approved external artwork host: a public read that costs nothing. */
const FREE_ART_HOST = "covers.openlibrary.org";

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const HARNESS_SOURCE = `
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const page = require(${JSON.stringify(PAGE_PATH)});
  window.__htPage = page;
  function Pass(props) {
    return React.createElement("div", { className: props.className }, props.children);
  }
  function Button(props) {
    return React.createElement("button", {
      type: props.type || "button",
      className: props.className,
      disabled: props.disabled,
      "aria-disabled": props["aria-disabled"],
      "aria-expanded": props["aria-expanded"],
      "aria-controls": props["aria-controls"],
      "aria-label": props["aria-label"],
      title: props.title,
      onClick: props.onClick,
    }, props.children);
  }
  function CardTitle(props) {
    return React.createElement("h3", props, props.children);
  }
  function Input(props) {
    return React.createElement("input", props);
  }
  function Label(props) {
    return React.createElement("label", { htmlFor: props.htmlFor }, props.children);
  }
  const Page = page.createPage({
    React,
    fetchJSON(url, init) {
      return fetch(url, init).then(function (response) { return response.json(); });
    },
    components: {
      Card: Pass,
      CardContent: Pass,
      CardTitle,
      Badge: Pass,
      Button,
      Input,
      Label,
      Separator: Pass,
    },
  });
  createRoot(document.getElementById("root")).render(React.createElement(Page));
`;

const NODE_MODULE_ROOTS = [
  path.resolve(__dirname, "../node_modules"),
  ...String(process.env.HACKERTUBE_NODE_MODULES || "").split(path.delimiter),
  ...String(process.env.NODE_PATH || "").split(path.delimiter),
  path.join(os.homedir(), ".hermes", "hermes-agent", "node_modules"),
].filter(Boolean);

function loadNodeModule(name) {
  for (const root of NODE_MODULE_ROOTS) {
    try {
      return require(require.resolve(name, { paths: [root] }));
    } catch (err) {
      // try the next root
    }
  }
  return require(name);
}

function pageApi() {
  return require(PAGE_PATH);
}

/** Five books, all with approved free artwork, as the feed and section rows. */
function fixtureItems(count) {
  const items = [];
  for (let index = 1; index <= (count || 5); index += 1) {
    items.push({
      item_id: "b" + index,
      format: "book",
      title: "Book " + index,
      destination: "https://openlibrary.org/works/OL" + (66550 + index) + "W",
      capture_order: index,
      contributors: ["Jane Austen"],
      duration_seconds: null,
      art_url: "https://" + FREE_ART_HOST + "/b/id/100" + index + "-M.jpg",
      art_hotlink: true,
    });
  }
  return items;
}

async function startFixture(items, privacyOptions = {}) {
  let agreed = privacyOptions.accepted !== false;
  let rejectDelete = !!privacyOptions.rejectDelete;
  const esbuild = loadNodeModule("esbuild");
  const catalog = {
    catalog: {
      items,
      evidence: [],
      sources: [{ source_id: "openlibrary", name: "Open Library" }],
      editions: [],
    },
  };
  const feed = {
    schema: "hackertube.discovery/1",
    personalized: true,
    paid_calls: 0,
    interests: ["Jane Austen"],
    signals: ["matched interest"],
    feed: items.map((item) => item.item_id),
    why: Object.fromEntries(items.map((item) => [item.item_id, ["Matched interest"]])),
    sections: {
      videos: { matches: [], browse: [], match_count: 0, browse_count: 0 },
      podcasts: { matches: [], browse: [], match_count: 0, browse_count: 0 },
      books: {
        matches: items.map((item) => item.item_id),
        browse: [],
        match_count: items.length,
        browse_count: 0,
      },
      audiobooks: { matches: [], browse: [], match_count: 0, browse_count: 0 },
    },
  };
  let profile = { schema: "hackertube.profile/1", interests: ["Jane Austen"], items: [] };
  // The search panel reads the provider state from /status. The fixture
  // reports the key-gated live provider with no key, so the page shows its
  // "no request will be sent" note and the walk dispatches no search.
  const status = {
    name: "HackerTube",
    data_root: "/tmp/plugin-data/hackertube",
    model_key: "absent",
    provider: "live",
  };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-browser-boundary-"));
  const harness = path.join(dir, "harness.js");
  const bundle = path.join(dir, "bundle.js");
  // Flush each asynchronous privacy-acceptance setter separately, matching
  // pre-automatic-batching hosts even when the test runtime is modern React.
  const source = privacyOptions.unbatchedPrivacy ? HARNESS_SOURCE.replace(
    '    React,',
    `    React: Object.assign({}, React, { useState(initial) {
      const [value, setValue] = React.useState(initial);
      return [value, next => window.__unbatchedPrivacy
        ? require("react-dom").flushSync(() => setValue(next)) : setValue(next)];
    }}),`,
  ).replace(
    'return response.json();',
    `return response.json().then(body => {
      if (init && init.method === "POST" && url.endsWith("/privacy")) window.__unbatchedPrivacy = true;
      return body;
    });`,
  ) : HARNESS_SOURCE;
  fs.writeFileSync(harness, source);
  await esbuild.build({
    entryPoints: [harness],
    bundle: true,
    format: "iife",
    outfile: bundle,
    platform: "browser",
    absWorkingDir: dir,
    nodePaths: NODE_MODULE_ROOTS,
  });
  const style = fs.readFileSync(STYLE_PATH);

  const served = [];
  const sendJson = (response, body) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const record = (body) => served.push({ method: request.method, path: url.pathname, body: body || null });
    if (url.pathname === "/") {
      record();
      response.writeHead(200, { "content-type": "text/html" });
      response.end(
        '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head>'
          + '<body><div id="root"></div><script src="/bundle.js"></script></body></html>',
      );
      return;
    }
    if (url.pathname === "/style.css") {
      record();
      response.writeHead(200, { "content-type": "text/css" });
      response.end(style);
      return;
    }
    if (url.pathname === "/bundle.js") {
      record();
      response.writeHead(200, { "content-type": "application/javascript" });
      response.end(fs.readFileSync(bundle));
      return;
    }
    if (url.pathname === "/api/plugins/hackertube/privacy") {
      if (request.method === "POST") {
        let body = "";
        request.on("data", chunk => { body += chunk; });
        request.on("end", () => {
          record(body);
          const value = JSON.parse(body);
          if (value.version === "test" && value.accepted === true) agreed = true;
          sendJson(response, {version:"test", text:"Fixture policy", accepted:agreed});
        });
      } else { record(); sendJson(response, {version:"test", text:"Fixture policy", accepted:agreed}); }
      return;
    }
    if (url.pathname === "/api/plugins/hackertube/privacy/delete") {
      record();
      if (rejectDelete) { rejectDelete = false; sendJson(response, {error:"search_busy"}); }
      else { agreed = false; profile = pageApi().emptyProfile(); sendJson(response, {version:"test", text:"Fixture policy", accepted:false}); }
      return;
    }
    if (url.pathname === "/api/plugins/hackertube/catalog") {
      record();
      sendJson(response, catalog);
      return;
    }
    if (url.pathname === "/api/plugins/hackertube/feed") {
      record();
      sendJson(response, feed);
      return;
    }
    if (url.pathname === "/api/plugins/hackertube/status") {
      record();
      sendJson(response, status);
      return;
    }
    if (url.pathname.indexOf("/api/plugins/hackertube/profile") === 0) {
      if (request.method !== "POST") {
        record();
        sendJson(response, profile);
        return;
      }
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        record(body);
        const api = pageApi();
        const payload = JSON.parse(body || "{}");
        if (url.pathname.endsWith("/saves") && payload.item_id) {
          profile = api.applySave(profile, payload.item_id);
        } else if (url.pathname.endsWith("/dismissals") && payload.item_id) {
          profile = api.applyDismiss(profile, payload.item_id);
        } else if (url.pathname.endsWith("/opens") && payload.item_id) {
          profile = api.applyOpen(profile, payload.item_id, "2026-11-06T12:00:00Z");
        } else if (url.pathname.endsWith("/interests") && payload.text) {
          profile = payload.remove === true
            ? { ...profile, interests: profile.interests.filter(text => text !== payload.text) }
            : api.addInterest(profile, payload.text);
        } else {
          response.writeHead(400, { "content-type": "application/json" });
          response.end("{}");
          return;
        }
        sendJson(response, profile);
      });
      return;
    }
    record();
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  return {
    origin,
    served,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Independent, closed inventory for this fixture's observed requests. */
function labelOf(url, fixture) {
  const target = new URL(url);
  const local = ["/api/plugins/hackertube/privacy", "/", "/style.css", "/bundle.js", "/api/plugins/hackertube/catalog",
    "/api/plugins/hackertube/feed", "/api/plugins/hackertube/profile",
    "/api/plugins/hackertube/status",
    "/api/model/auxiliary",
    "/api/model/options",
    "/api/model/set",
    "/api/plugins/hackertube/sources",
    "/api/plugins/hackertube/profile/saves", "/api/plugins/hackertube/profile/dismissals",
    "/api/plugins/hackertube/profile/opens", "/api/plugins/hackertube/profile/interests"];
  if (target.origin === fixture.origin && local.includes(target.pathname)) return "local";
  if (target.origin === "https://" + FREE_ART_HOST && /^\/b\/id\/100[1-5]-M\.jpg$/.test(target.pathname)
      && !target.search) return "free";
  return "outside";
}

const imgSources = (nodes) => Array.from(new Set(nodes.map((node) => node.getAttribute("src"))));

/**
 * Serve the page, observe every browser request, and walk the ordinary
 * browsing, Show more, save, dismiss, and reopen paths.
 */
async function runBrowserWalk(items) {
  const fixture = await startFixture(items);
  const { chromium } = loadNodeModule("playwright");
  let browser;
  const phases = [];
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const outside = [];
    const artwork = [];
    await context.route("**/*", (route) => {
      const url = route.request().url();
      const label = labelOf(url, fixture);
      if (label === "local") return route.continue();
      if (label === "free") artwork.push(url);
      else outside.push(url);
      return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG });
    });
    const page = await context.newPage();
    const requests = [];
    context.on("request", (request) => requests.push(request.url()));

    const phase = async (name, action) => {
      const marks = {
        requests: requests.length,
        served: fixture.served.length,
        artwork: artwork.length,
        outside: outside.length,
      };
      await action();
      await page.waitForLoadState("networkidle");
      phases.push({
        phase: name,
        requests: requests.slice(marks.requests).map((url) => ({ url, label: labelOf(url, fixture) })),
        served: fixture.served.slice(marks.served),
        artwork: artwork.slice(marks.artwork),
        outside: outside.slice(marks.outside),
      });
    };

    await phase("feed load", async () => {
      await page.goto(fixture.origin + "/");
      await page.locator("#ranked-feed").waitFor();
      await page.locator("img").first().waitFor();
    });
    const renderedAtLoad = await page.$$eval("img", imgSources);

    await phase("show more", async () => {
      await page.locator("#ranked-feed").getByRole("button", { name: "Show more" }).click();
      await page.locator("#ht-expanded-ranked").waitFor();
      await page.waitForTimeout(250);
    });

    await phase("section browse", async () => {
      await page.locator('a[href="#books"]').first().click();
      await page.locator("#books").waitFor();
    });

    await phase("save", async () => {
      const refetched = Promise.all([
        page.waitForResponse((response) => response.url().endsWith("/api/plugins/hackertube/catalog")),
        page.waitForResponse((response) => response.url().endsWith("/api/plugins/hackertube/feed")),
      ]);
      // The second ranked card, so the saved item and the dismissed item are
      // different rows and the persisted reopen can be told apart.
      await page.locator("#ranked-feed").getByRole("button", { name: "Save" }).nth(1).click();
      await refetched;
      await page.locator("#ranked-feed").getByRole("button", { name: "Saved" }).first().waitFor();
    });

    await phase("dismiss", async () => {
      const refetched = Promise.all([
        page.waitForResponse((response) => response.url().endsWith("/api/plugins/hackertube/catalog")),
        page.waitForResponse((response) => response.url().endsWith("/api/plugins/hackertube/feed")),
      ]);
      await page.locator("#ranked-feed").getByRole("button", { name: "Dismiss" }).first().click();
      await refetched;
      await page.waitForFunction(
        () => !document.querySelector("#ranked-feed").textContent.includes("Book 1"),
      );
    });

    await phase("reopen", async () => {
      const loaded = Promise.all([
        page.waitForResponse((response) => response.url().endsWith("/api/plugins/hackertube/profile")),
        page.waitForResponse((response) => response.url().endsWith("/api/plugins/hackertube/feed")),
        page.waitForResponse((response) => response.url().endsWith("/api/plugins/hackertube/catalog")),
      ]);
      await page.reload();
      await loaded;
      await page.locator("#ranked-feed").waitFor();
      await page.waitForTimeout(250);
    });
    const rankedAfterReopen = await page.locator("#ranked-feed").textContent();

    await phase("library", async () => {
      await page.locator('a[href="#library"]').first().click();
      await page.waitForFunction(() => document.getElementById("books").textContent.includes("Book 2"));
    });
    const libraryAfterReopen = await page.locator("#books").textContent();

    const counters = { local: 0, free: 0, metered: 0, paid: 0, refused: 0 };
    for (const url of requests) {
      const label = labelOf(url, fixture);
      counters[label] = (counters[label] || 0) + 1;
    }

    return {
      origin: fixture.origin,
      counters,
      phases,
      outside,
      artwork,
      requests,
      rendered: {
        at_load: renderedAtLoad,
        after_reopen: await page.$$eval("img", imgSources),
      },
      reopened: {
        ranked_mentions_dismissed_item: rankedAfterReopen.includes("Book 1"),
        library_mentions_saved_item: libraryAfterReopen.includes("Book 2"),
        library_mentions_dismissed_item: libraryAfterReopen.includes("Book 1"),
      },
    };
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
}

module.exports = {
  FREE_ART_HOST,
  PIXEL_PNG,
  fixtureItems,
  labelOf,
  loadNodeModule,
  pageApi,
  runBrowserWalk,
  startFixture,
};
