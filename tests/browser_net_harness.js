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

const PAGE_PATH = process.env.HACKERTUBE_PAGE_PATH
  || path.resolve(__dirname, "../hackertube/dashboard/dist/index.js");
const STYLE_PATH = process.env.HACKERTUBE_STYLE_PATH
  || path.resolve(__dirname, "../hackertube/dashboard/dist/style.css");

/** The approved external artwork hosts: public reads that cost nothing. */
const FREE_ART_HOST = "covers.openlibrary.org";
/** The official YouTube thumbnail host. A hotlinked image read, never a Data API call. */
const THUMB_HOST = "i.ytimg.com";
/** Section each format belongs to, so a fixture row renders in its own section. */
const SECTION_OF_FORMAT = {
  video: "videos",
  podcast_episode: "podcasts",
  podcast_show: "podcasts",
  book: "books",
  audiobook: "audiobooks",
};

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/* A 480x360 (4:3) PNG, the frame shape of YouTube's official `hqdefault`
 * thumbnail, so a test can check that the rendered box keeps the image's own
 * aspect ratio instead of a square 1x1 pixel hiding a crop. */
const THUMB_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAeAAAAFoCAIAAAAAVb93AAAD1klEQVR42u3UIQEAAAzDsPmZf39zcHyQSChoCsBLkQDAoAEwaACDBsCgAQwaAIMGwKABDBoAgwYwaAAMGgCDBjBoAAwawKABMGgAgwbAoAEwaACDBsCgAQwaAIMGwKABDBoAgwYwaAAMGsCgATBoAAwawKABMGgAgwbAoAEwaACDBsCgAQwaAIMGMGgADBoAgwYwaAAMGsCgATBoAAwawKABMGgAgwbAoAEwaACDBsCgAQwaAIMGMGgADBoAgwYwaAAMGsCgATBoAAwawKABMGgAgwbAoAEMGgCDBsCgAQwaAIMGMGgADBoAgwYwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBsCgAQwaAIMGMGgADBoAgwYwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBsCgAQwaAIMGMGgADBrAoAEwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaAAMGsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwawKABMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwYwaAAMGgCDBjBoAAwawKABMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwYwaAAMGgCDBjBoAAwawKABMGgADBrAoAEwaACDBsCgAQwaAIMGwKABDBoAgwYwaAAMGgCDBjBoAAwawKABMGgAgwbAoAEwaACDBsCgAQwaAIMGwKABDBoAgwYwaAAMGsCgJQAwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBsCgAQwaAIMGMGgADBrAoAEwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaAAMGsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaAAMGsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwawKABMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwawKABMGgALgOsFTbtua4aFwAAAABJRU5ErkJggg==",
  "base64",
);

/* A 480x270 (16:9) PNG, the frame shape of YouTube's `maxresdefault`
 * thumbnail, so a test can check the compact box's height for a 16:9 image
 * (192x108, not the 4:3 192x144) and that a 16:9 image is not cropped to 4:3. */
const THUMB16_9_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAeAAAAEOCAIAAADe+FMwAAAC6ElEQVR42u3UMQ0AAAzDsAIrf1xlMe2wIeRICsBLkQDAoAEwaACDBsCgAQwaAIMGwKABDBoAgwYwaAAMGgCDBjBoAAwawKABMGgAgwbAoAEwaACDBsCgAQwaAIMGwKABDBoAgwYwaAAMGsCgATBoAAwawKABMGgAgwbAoAEwaACDBsCgAQwaAIMGMGgADBoAgwYwaAAMGsCgATBoAAwawKABMGgAgwbAoAEwaACDBsCgAQwaAIMGMGgADBoAgwYwaAAMGsCgATBoAAwawKABMGgAgwbAoAEMGgCDBsCgAQwaAIMGMGgADBoAgwYwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBsCgAQwaAIMGMGgADBoAgwYwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBsCgAQwaAIMGMGgADBrAoAEwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaAAMGsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwaAIMGMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwbAoAEMGgCDBjBoAAwawKABMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwYwaAAMGgCDBjBoAAwawKABMGgADBrAoAEwaACDBsCgATBoAIMGwKABDBoAgwYwaAAMGgCDBjBoAAwawKABMGgADBrAoAEwaACDBsCgAQwaAIMGwKABDBoAgwYwaAAMGgCDBjBoAAwawKABMGgAgwbAoAEwaACDBsCgAQwaAIMGwKABDBoAgwYwaAAMGsCgJQAwaAAMGsCgATBoAIMGwKABMGgAgwbAoAEMGoBrA9C3Cd0WL8DgAAAAAElFTkSuQmCC",
  "base64",
);

/* The plugin stylesheet consumes host design tokens (`var(--radius)`,
 * `var(--color-*)`, `var(--theme-*)`) and declares none of them itself. Without
 * a host token block a `var()` reference is invalid at computed-value time and
 * the property silently falls back to its initial value, so a computed-style
 * assertion about a tokenised property (border-radius here) would pass
 * vacuously whatever the plugin declared. The values are the compiled host's
 * (`hermes_cli/web_dist/assets/index-*.css`: `--radius: .5rem`); the real
 * dashboard scales rem through the host's own `html` font-size, so its effective
 * radius reads 7.5px at 390px. What matters for the assertion is only that the
 * token resolves to a NON-ZERO radius — that is what makes `"0px"` meaningful. */
/* The fixture's host CardContent padding line, and the ZERO variant. A ring run
 * can ask for the zero variant (see startFixture's renderOptions) so the ring is
 * proven to survive on the plugin's OWN overflow box: at the measured host
 * padding the ring is clear whatever the plugin's wrapper declares, which is
 * exactly how reverting the wrapper rule can stay green in a host-padding
 * fixture. The line is a constant so that a receipt's mutation can swap it and
 * so the measured value still appears in this file exactly once. */
const CARD_CONTENT_PADDING = ".ht-card-content { padding: 11.25px 15px; }";
const CARD_CONTENT_PADDING_ZERO = ".ht-card-content { padding: 0; }";
/* The surface a ring run paints over, as a GRADIENT rather than a flat colour.
 * A fully painted opaque ring over a gradient was misread as a coverage defect
 * ("140/163 painted; 23 partly painted") because every pixel was classified
 * against the side's STRONGEST difference, and a pixel over the lighter end of
 * the gradient holds less paint than that. `renderOptions.gradientSurface` appends
 * this block, which paints the compact row's own card content — the box the
 * compact Watch link's ring is drawn over (measured: the surface behind that ring
 * is the plain card background, rgb(255,255,255)) — with the gradient the finding
 * names (#fff to #e8e8e8). The ramp runs ACROSS the content box (90deg) rather
 * than down it, and that is measured rather than arbitrary:
 *
 *   * the compact Watch link sits BELOW the row's header at this width (the three
 *     parts stack in DOM order below 768px: head, media, rest), so a full-box
 *     VERTICAL ramp is nearly over by the time the ring is reached — a
 *     stroke-long slice of it varied only rgb(247,247,247) -> rgb(240,240,240), a
 *     strongest-difference fraction of 0.973, which is above the 0.95 band and so
 *     does NOT reproduce the finding;
 *   * pinning a vertical ramp to the link with a pixel offset or a ramp length
 *     would hard-code this fixture's own geometry;
 *   * across the box, the ring's TOP and BOTTOM strokes (193px of the content
 *     box's 272px, measured at 320px) see rgb(253,253,253) -> rgb(236,236,236),
 *     a strongest-difference fraction of ~0.93 — under the band, i.e. the
 *     finding's own shape. The two VERTICAL strokes are uniform on this surface
 *     and are the passing sides here.
 *
 * See `docs/receipts/post43/gap-probe.log` for the measurement. */
const GRADIENT_SURFACE_CSS = `.ht-card-content {
  background-image: linear-gradient(90deg, #ffffff, #e8e8e8);
}`;

/* The surface and the ring COLOUR of the two-tone ring fixture, appended by
 * `renderOptions.twoToneSurface`.
 *
 * A ring's painted colour is only the computed `outline-color` where the ring is
 * opaque. Any alpha in the outline composites with whatever is underneath, so a
 * ring drawn over a surface that changes colour is itself two-tone — and that is
 * the case Picasso's finding is about: the sampler used to take the single
 * most-changed pixel on a side as the side's "ring colour", so the weaker of two
 * legitimate ring tones was measured against the stronger one and reported as a
 * coverage defect. The two tones here are composites of ONE outline colour over
 * two flat surfaces, so every pixel of the ring is the ring's own colour
 * composited over its own surface — which is what the classifier must accept:
 *
 *     over #ffffff:  rgba(112,112,112,.92) -> rgb(123,123,123), 4.23:1
 *     over #000000:  rgba(112,112,112,.92) -> rgb(103,103,103), 3.71:1
 *
 * Both clear 3:1, both are the ring, and the split is placed rather than guessed:
 * measured at 320px (`docs/receipts/post44/two-tone.json`), the compact card
 * content is 272px wide with its left edge at x=24, the compact Watch link's box
 * runs x=39..256, so the LEFT stroke's sample line sits 4.4% along the content and
 * the RIGHT stroke's at 86.4%; the top and bottom strokes span 9.9%..80.9%. A
 * boundary at 24% therefore leaves the left stroke wholly on the light band, the
 * right stroke wholly on the dark one, and puts ~20% of each horizontal stroke's
 * samples on the light band — the finding's own "20% of the stroke" shape, with
 * the dark band's ~80% the part that used to be misread.
 *
 * The 80% dark band is what makes the fixture a case the OLD classifier got
 * wrong (measured: 38/194 painted, 156 partly painted on the top stroke under
 * the strongest-pixel rule, 194/194 under the per-pixel composite). The fixture
 * is synthetic in exactly the way the gradient fixture is, and for the same
 * reason: it isolates the classifier from the plugin's own stylesheet. */
const TWO_TONE_SURFACE_CSS = `.ht-card-content {
  background-image: linear-gradient(90deg, #ffffff 0 24%, #000000 24% 100%);
}`;
/* The ring colour is declared with a HIGHER specificity than the plugin's own
 * `.hackertube :focus` rule, deliberately: the fixture's host block is written
 * before the plugin stylesheet, so an override at equal specificity would lose to
 * the plugin's `outline` shorthand and the fixture would quietly measure the
 * plugin's opaque ring. `.hackertube .hackertube :focus` (the page has two nested
 * `.hackertube` divs) and `.hackertube :focus:focus-visible` both out-specify it;
 * the test asserts the alpha it got, so a selector that stopped matching fails
 * loudly instead of measuring the wrong ring. */
const TWO_TONE_RING_CSS = `.hackertube .hackertube :focus,
.hackertube .hackertube :focus-visible,
.hackertube :focus:focus-visible {
  outline-color: rgba(112, 112, 112, 0.92);
}`;

const HOST_TOKENS_CSS = `:root {
  --radius: 0.5rem;
  --color-border: #d4d4d4;
  --color-muted: #f4f4f5;
  --color-muted-foreground: #52525b;
  --color-primary: #18181b;
  --color-primary-foreground: #fafafa;
  --color-ring: #18181b;
  --theme-font-display: system-ui, sans-serif;
  --theme-line-height: 1.55;
}
/* The host's CardContent is a div with class "p-4" (the host SDK renders
 * \`z("p-4", className)\`). MEASURED in the real dashboard at 320px, 390px, 768px
 * and 1280px, the compact row's CardContent element computes
 * \`padding: 11.25px 15px\` at the host's 15px root font — vertical 11.25px,
 * inline 15px, not 15px on every side. The two axes have two different owners,
 * and the block axis is the PLUGIN's own rule, not a host one: the host's
 * \`.p-4\` is a uniform \`padding: calc(calc(.25rem * var(--theme-spacing-mul,1))
 * * 4)\` (15px inline here), while
 * \`.hackertube .ht-compact > div { padding-block: .75rem }\` (style.css)
 * matches the CardContent element — it is a DIRECT child of the compact row's
 * card — and at the host's 15px root 0.75rem is exactly the measured 11.25px.
 * The plugin rule out-specifies \`.p-4\` and sets only the block axis, so the
 * inline value stays the host's 15px. The value is recorded with its provenance in
 * docs/receipts/post40/host-ring-fix.json (\`cardContent.padding\`, plus the
 * rules that matched) and cross-checked against
 * docs/receipts/post39/host-ring.json: the host's compact Watch link sits
 * 16px inside the inner .hackertube's left edge at 320/390, which is the host
 * card's 1px border plus this 15px inline padding. The fixture must draw the
 * same box: that padding, not the plugin's own root padding, is what holds the
 * compact Watch link's ring clear of the inner .hackertube clip at narrow
 * widths, and the fixture does not carry the host card's 1px border (its Card is
 * a plain div), so its clearance is 11px where the host's is 12px. */
${CARD_CONTENT_PADDING}
/* A dark host theme, in the host's OWN idiom and with the host's own measured
 * values. The dashboard's dark look is its palette (the default "Hermes Teal"
 * theme is a dark teal at every OS scheme), and its dark VARIANTS are keyed on a
 * \`.dark\` ancestor class (\`is(.dark *)\`), not on \`prefers-color-scheme\` — so
 * the tokens hang off \`.dark\` here and a \`.dark\`-ancestor-only run is covered.
 * Measured in the real dashboard: \`--color-ring\` resolves to #ffe6cb and the
 * page background to #041c1c (host-ring-fix.json \`theme\`). A dark run that only
 * emulated the OS scheme would measure a light surface under a light ring — the
 * scheme is proven in the run itself (see assertPaintedRing). The media-query
 * block below carries the same values so an OS-dark run measures the same
 * surface, but no test depends on it. */
:root.dark, .dark {
  --color-border: #1d4747;
  --color-muted: #073030;
  --color-muted-foreground: #cfe3e1;
  --color-primary: #ffe6cb;
  --color-primary-foreground: #041c1c;
  --color-ring: #ffe6cb;
}
.dark { background: #041c1c; color: #edf7f6; }
@media (prefers-color-scheme: dark) {
  :root {
    --color-border: #1d4747;
    --color-muted: #073030;
    --color-muted-foreground: #cfe3e1;
    --color-primary: #ffe6cb;
    --color-primary-foreground: #041c1c;
    --color-ring: #ffe6cb;
  }
  body { background: #041c1c; color: #edf7f6; }
}`;

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
  function CardContent(props) {
    // The host renders a div with class "p-4"; keep its padding (see
    // .ht-card-content in the host token block) so a ring measurement sees the
    // same box the dashboard draws.
    return React.createElement("div", {
      className: "ht-card-content" + (props.className ? " " + props.className : ""),
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
      CardContent,
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

async function startFixture(items, privacyOptions = {}, renderOptions = {}) {
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
  const bySection = { videos: [], podcasts: [], books: [], audiobooks: [] };
  items.forEach((item) => {
    const name = SECTION_OF_FORMAT[item.format];
    if (name) bySection[name].push(item.item_id);
  });
  const sections = {};
  Object.keys(bySection).forEach((name) => {
    sections[name] = {
      matches: bySection[name],
      browse: [],
      match_count: bySection[name].length,
      browse_count: 0,
    };
  });
  const feed = {
    schema: "hackertube.discovery/1",
    personalized: true,
    paid_calls: 0,
    interests: ["Jane Austen"],
    signals: ["matched interest"],
    feed: items.map((item) => item.item_id),
    why: Object.fromEntries(items.map((item) => [item.item_id, ["Matched interest"]])),
    sections,
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
  // The host CardContent padding a ring run asks for: the measured host value by
  // default, or 0 so the ring can only survive on the plugin's own wrapper.
  let hostCss = HOST_TOKENS_CSS;
  if (renderOptions.cardPadding === 0) {
    hostCss = HOST_TOKENS_CSS.split(CARD_CONTENT_PADDING).join(CARD_CONTENT_PADDING_ZERO);
    if (hostCss === HOST_TOKENS_CSS) {
      throw new Error("the fixture's host CardContent padding line is missing; cannot zero it");
    }
  }
  // The surface the ring paints over, as the gradient the finding names. The
  // card content the compact Watch link's ring is drawn over gets the gradient,
  // so that ring's surface varies along the stroke.
  if (renderOptions.gradientSurface) {
    hostCss = hostCss + "\n" + GRADIENT_SURFACE_CSS;
  }
  // The two-tone ring fixture: a semi-transparent outline colour over a two-tone
  // surface, so the painted ring itself has two legitimate tones. See
  // TWO_TONE_SURFACE_CSS above for the measurement behind the 24% split.
  if (renderOptions.twoToneSurface) {
    hostCss = hostCss + "\n" + TWO_TONE_SURFACE_CSS + "\n" + TWO_TONE_RING_CSS;
  }

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
        '<!doctype html><html><head><style>' + hostCss + '</style>'
          + '<link rel="stylesheet" href="/style.css"></head>'
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
  // A YouTube thumbnail is a hotlinked PUBLIC image: free, and never the Data API.
  if (target.origin === "https://" + THUMB_HOST
      && /^\/vi\/[A-Za-z0-9_-]{11}\/[a-z0-9]+\.(?:jpg|png|webp)$/.test(target.pathname)
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
      const controls = page.locator('details.ht-feed-controls');
      if (!(await controls.evaluate(el => el.open))) {
        await controls.locator(':scope > summary').focus();
        await page.keyboard.press('Enter');
      }
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
  THUMB_HOST,
  PIXEL_PNG,
  THUMB_PNG,
  THUMB16_9_PNG,
  fixtureItems,
  labelOf,
  loadNodeModule,
  pageApi,
  runBrowserWalk,
  startFixture,
};
