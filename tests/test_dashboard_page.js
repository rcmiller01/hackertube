const test = require("node:test");
const assert = require("node:assert/strict");
const page = require("../hackertube/dashboard/dist/index.js");

test("public https destinations are allowed", () => {
  const decision = page.destinationDecision("https://openlibrary.org/works/OL66554W");
  assert.equal(decision.ok, true);
  assert.equal(decision.href, "https://openlibrary.org/works/OL66554W");
});

test("unsafe schemes are refused", () => {
  for (const value of ["javascript:alert(1)", "http://example.com/item", "file:///tmp/a", "data:text/html,hi"]) {
    const decision = page.destinationDecision(value);
    assert.equal(decision.ok, false, value);
    assert.equal(decision.reason, "scheme");
    assert.match(page.refusalMessage(decision), /does not use https/);
  }
});

test("private-network destinations are refused", () => {
  const samples = [
    "https://127.0.0.1/private",
    "https://localhost/a",
    "https://10.1.2.3/a",
    "https://192.168.0.5/a",
    "https://172.16.0.1/a",
    "https://169.254.1.1/a",
    "https://[::1]/a",
    "https://printer.local/a",
    "https://intranet/a",
  ];
  for (const value of samples) {
    const decision = page.destinationDecision(value);
    assert.equal(decision.ok, false, value);
    assert.equal(decision.reason, "private", value);
    assert.match(page.refusalMessage(decision), /private-network/);
  }
});

test("ipv6 private, loopback, and mapped forms are refused", () => {
  const cases = [
    ["dotted mapped loopback", "https://[::ffff:127.0.0.1]/private"],
    ["hex mapped loopback", "https://[::ffff:7f00:1]/private"],
    ["dotted mapped private 10.0.0.1", "https://[::ffff:10.0.0.1]/private"],
    ["hex mapped private 10.0.0.1", "https://[::ffff:a00:1]/private"],
    ["dotted mapped private 192.168.0.1", "https://[::ffff:192.168.0.1]/a"],
    ["hex mapped private 192.168.0.1", "https://[::ffff:c0a8:1]/a"],
    ["dotted mapped private 172.16.0.1", "https://[::ffff:172.16.0.1]/a"],
    ["hex mapped private 172.16.0.1", "https://[::ffff:ac10:1]/a"],
    ["dotted mapped link-local", "https://[::ffff:169.254.1.1]/a"],
    ["hex mapped link-local", "https://[::ffff:a9fe:101]/a"],
    ["dotted mapped unspecified", "https://[::ffff:0.0.0.0]/a"],
    ["hex mapped unspecified", "https://[::ffff:0:0]/a"],
    ["uppercase hex mapped loopback", "https://[::FFFF:7F00:1]/a"],
    ["zero-padded hex mapped loopback", "https://[::ffff:7f00:0001]/a"],
    ["fully expanded mapped loopback", "https://[0000:0000:0000:0000:0000:ffff:7f00:0001]/a"],
    ["loopback ::1", "https://[::1]/a"],
    ["fully expanded loopback", "https://[0000:0000:0000:0000:0000:0000:0000:0001]/a"],
    ["unspecified ::", "https://[::]/a"],
    ["fully expanded unspecified", "https://[0:0:0:0:0:0:0:0]/a"],
    ["unique local fc00::/7", "https://[fc00::1]/a"],
    ["unique local fd00::/8", "https://[fd12:3456::1]/a"],
    ["uppercase unique local", "https://[FC00::1]/a"],
    ["link-local fe80::/10", "https://[fe80::1]/a"],
    ["link-local upper bound", "https://[febf::1]/a"],
    ["uppercase link-local", "https://[FE80::1]/a"],
    ["fully expanded link-local", "https://[fe80:0000:0000:0000:0000:0000:0000:0001]/a"],
  ];
  for (const entry of cases) {
    const decision = page.destinationDecision(entry[1]);
    assert.equal(decision.ok, false, entry[0]);
    assert.equal(decision.reason, "private", entry[0]);
    assert.match(page.refusalMessage(decision), /private-network/);
  }
});

test("public ipv6 literal is allowed", () => {
  const decision = page.destinationDecision("https://[2001:4860:4860::8888]/");
  assert.equal(decision.ok, true);
  assert.equal(decision.href, "https://[2001:4860:4860::8888]/");
  const mappedPublic = page.destinationDecision("https://[::ffff:8.8.8.8]/");
  assert.equal(mappedPublic.ok, true, "public ipv4-mapped address");
});

test("credentials in a destination are refused", () => {
  const decision = page.destinationDecision("https://user:pass@example.com/a");
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "invalid");
});

test("save is idempotent", () => {
  const clock = { current: 0 };
  const once = page.applySave({}, "ol:OL66554W", clock);
  const twice = page.applySave(once, "ol:OL66554W", clock);
  assert.equal(twice, once);
  assert.equal(Object.keys(once).length, 1);
  assert.equal(clock.current, 1);
});

test("dismiss does not duplicate and does not remove the id", () => {
  const once = page.applyDismiss({}, "ol:OL66554W");
  const twice = page.applyDismiss(once, "ol:OL66554W");
  assert.equal(twice, once);
  assert.equal(once["ol:OL66554W"], true);
});

test("section order is capture order and library is newest save first", () => {
  const items = [
    { item_id: "b", format: "video", capture_order: 2 },
    { item_id: "a", format: "video", capture_order: 1 },
    { item_id: "c", format: "book", capture_order: 3 },
  ];
  const section = page.SECTIONS[0];
  const feed = page.sectionItems(items, section, null);
  assert.deepEqual(feed.map((item) => item.item_id), ["a", "b"]);
  const saved = { b: { at: 1 }, a: { at: 2 } };
  const library = page.sectionItems(items, section, saved);
  assert.deepEqual(library.map((item) => item.item_id), ["a", "b"]);
});

test("show more keeps the first four until expanded", () => {
  const items = [1, 2, 3, 4, 5];
  assert.equal(page.visibleSlice(items, false, page.INITIAL_CARDS).length, 4);
  assert.equal(page.visibleSlice(items, true, page.INITIAL_CARDS).length, 5);
  assert.equal(page.visibleSlice([1, 2, 3], false, page.INITIAL_CARDS).length, 3);
});

test("hacker news evidence stays on the item it names", () => {
  const sources = [{ source_id: "hn", name: "Hacker News" }];
  const evidence = [{
    item_id: "youtube:W0NakShgbHY",
    source_id: "hn",
    kind: "community",
    endorsement: "established",
    display_line: "Recommended in Hacker News",
    destination: "https://news.ycombinator.com/item?id=26188584",
    retrieved_at: "2026-11-06T12:22:22Z",
  }];
  const named = page.presentEvidence({ item_id: "youtube:W0NakShgbHY", captured_at: "2026-11-06T12:22:22Z" }, evidence, sources);
  const other = page.presentEvidence({ item_id: "itunes:podcast:1840669662", captured_at: "2026-11-06T12:22:22Z" }, evidence, sources);
  assert.equal(named.kind, "endorsement");
  assert.equal(named.text, "Recommended in Hacker News");
  assert.equal(named.href, "https://news.ycombinator.com/item?id=26188584");
  assert.notEqual(other.kind, "endorsement");
});

test("hacker news endorsement is a link line and catalog evidence is a source candidate", () => {
  const sources = [
    { source_id: "hn", name: "Hacker News" },
    { source_id: "openlibrary", name: "Open Library" },
  ];
  const video = { item_id: "youtube:1", captured_at: "2026-11-06T12:22:23Z" };
  const endorsed = page.presentEvidence(video, [
    {
      item_id: "youtube:1",
      source_id: "hn",
      kind: "community",
      endorsement: "established",
      display_line: "Recommended in Hacker News",
      destination: "https://news.ycombinator.com/item?id=1",
      retrieved_at: "2026-11-06T12:22:22Z",
    },
  ], sources);
  assert.equal(endorsed.text, "Recommended in Hacker News");
  assert.equal(endorsed.href, "https://news.ycombinator.com/item?id=1");
  const book = { item_id: "ol:1", captured_at: "2026-11-06T12:22:21Z" };
  const candidate = page.presentEvidence(book, [
    {
      item_id: "ol:1",
      source_id: "openlibrary",
      kind: "catalog",
      endorsement: "not_applicable",
      display_line: null,
      destination: "https://openlibrary.org/works/OL1W",
      retrieved_at: "2026-11-06T12:22:21Z",
    },
  ], sources);
  assert.equal(candidate.text, "Source candidate");
  assert.equal(candidate.href, null);
  assert.equal(candidate.sourceName, "Open Library");
});

test("unknown duration and missing art stay unknown", () => {
  assert.equal(page.lengthLine({ format: "video", duration_seconds: null }), "Duration unknown");
  assert.equal(page.lengthLine({ format: "book", duration_seconds: null }), "Length unknown");
  assert.equal(page.lengthLine({ format: "podcast_show", duration_seconds: null }), null);
  assert.equal(page.formatDuration(4257), "1 hour 10 minutes 57 seconds");
  assert.equal(page.artFallback({ format: "video" }), "Video · YouTube");
  assert.equal(page.artFallback({ format: "podcast_show" }), "Podcast · show art unavailable");
  assert.equal(page.creatorLine({ format: "podcast_episode", contributors: null, show_id: "missing" }, {}), "Contributor unknown. Show: Show unknown");
});

test("demo question and disclosure text are the approved lines", () => {
  assert.equal(page.DEMO_QUESTION, "What can I read or listen to by Jane Austen?");
  assert.match(page.DISCLOSURE, /broader web/);
  assert.match(page.DISCLOSURE, /Browsing is free/);
  assert.equal(page.ORDER_NOTE, "Seeded catalog, in capture order.");
  assert.equal(page.sectionEmpty("Videos", false), "No videos in this catalog.");
  assert.equal(page.sectionEmpty("Videos", true), "No saved videos.");
  assert.equal(page.ORDER_NOTE.includes("fixture"), false);
  assert.equal(page.sectionEmpty("Podcasts", false).includes("fixture"), false);
});

function mountPage(catalogBody) {
  const previous = {
    window: global.window,
    document: global.document,
    location: global.location,
  };
  const listeners = {};
  const location = { hash: "", search: "" };
  global.location = location;
  global.window = {
    location,
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== fn);
    },
    sessionStorage: { getItem() { return null; } },
  };
  const focused = { current: null };
  let states = [];
  let effects = [];
  let hookIndex = 0;
  let effectIndex = 0;
  let tree = null;
  let rendering = false;
  let flushing = false;
  let queued = false;

  function walk(node, visit) {
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, visit));
      return;
    }
    if (!node || typeof node !== "object") return;
    visit(node);
    walk(node.children, visit);
  }

  global.document = {
    getElementById(id) {
      let found = null;
      walk(tree, (node) => {
        if (!found && node.props && node.props.id === id) found = node;
      });
      if (found) {
        found.focus = () => { focused.current = found; };
        found.scrollIntoView = () => {};
      }
      return found;
    },
  };

  function commit(node) {
    walk(node, (item) => {
      if (item.props && item.props.ref) {
        item.focus = () => { focused.current = item; };
        item.props.ref.current = item;
      }
    });
  }

  function flush() {
    flushing = true;
    effects.forEach((slot) => {
      if (!slot || !slot.changed) return;
      if (typeof slot.cleanup === "function") slot.cleanup();
      const cleanup = slot.fn();
      slot.cleanup = typeof cleanup === "function" ? cleanup : null;
      slot.changed = false;
    });
    flushing = false;
    if (queued) {
      queued = false;
      rerender();
    }
  }

  function schedule() {
    if (rendering || flushing) {
      queued = true;
      return;
    }
    rerender();
  }

  const React = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    },
    useState(init) {
      const index = hookIndex++;
      if (states.length <= index) states.push(typeof init === "function" ? init() : init);
      return [states[index], (value) => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
        schedule();
      }];
    },
    useEffect(fn, deps) {
      const index = effectIndex++;
      const prev = effects[index] || {};
      const changed = !prev.deps || !deps || deps.length !== prev.deps.length || deps.some((dep, i) => !Object.is(dep, prev.deps[i]));
      effects[index] = { fn, deps, changed, cleanup: prev.cleanup };
    },
    useRef(init) {
      const index = hookIndex++;
      if (states.length <= index) states.push({ current: init });
      return states[index];
    },
  };

  function Stub() {}
  const Page = page.createPage({
    React,
    fetchJSON() {
      return {
        then(onOk) {
          if (catalogBody) onOk(catalogBody);
          return { catch() { return this; } };
        },
      };
    },
    components: {
      Card: Stub,
      CardContent: Stub,
      CardTitle: Stub,
      Badge: Stub,
      Button: Stub,
      Input: Stub,
      Label: Stub,
      Separator: Stub,
    },
  });

  function rerender() {
    rendering = true;
    hookIndex = 0;
    effectIndex = 0;
    tree = Page();
    rendering = false;
    commit(tree);
    flush();
  }

  rerender();

  function find(pred) {
    let hit = null;
    walk(tree, (node) => {
      if (!hit && pred(node)) hit = node;
    });
    return hit;
  }

  return {
    focused,
    listeners,
    location,
    find,
    restore() {
      global.window = previous.window;
      global.document = previous.document;
      global.location = previous.location;
    },
  };
}

const SAMPLE_CATALOG = {
  fixture: true,
  catalog: {
    items: [{
      item_id: "b1",
      format: "book",
      title: "Emma",
      destination: "https://openlibrary.org/works/OL66513W",
      capture_order: 1,
      contributors: ["Jane Austen"],
      duration_seconds: null,
      art_url: null,
      art_hotlink: false,
    }],
    evidence: [{
      item_id: "b1",
      source_id: "hn",
      kind: "community",
      endorsement: "established",
      display_line: "Recommended in Hacker News",
      destination: "https://news.ycombinator.com/item?id=26188584",
      retrieved_at: "2026-11-06T12:22:22Z",
    }],
    sources: [{ source_id: "hn", name: "Hacker News" }],
    editions: [],
  },
};

test("empty question alert receives focus after it mounts", () => {
  const ui = mountPage(SAMPLE_CATALOG);
  try {
    const trigger = ui.find((node) => (node.children || []).some((child) => child === "Focused search"));
    trigger.props.onClick();
    const form = ui.find((node) => node.type === "form");
    form.props.onSubmit({ preventDefault() {} });
    assert.equal(ui.focused.current.props.role, "alert");
    assert.equal(ui.focused.current.props.tabIndex, -1);
    assert.equal(ui.focused.current.children[0], "Enter a question before searching.");
  } finally {
    ui.restore();
  }
});

test("section navigation focuses the section heading", () => {
  const ui = mountPage(SAMPLE_CATALOG);
  try {
    ui.location.hash = "#podcasts";
    ui.listeners.hashchange.forEach((fn) => fn());
    assert.equal(ui.focused.current.props.id, "podcasts-heading");
    assert.equal(ui.focused.current.props.tabIndex, -1);
    assert.equal(ui.focused.current.type, "h2");
  } finally {
    ui.restore();
  }
});

test("evidence and about links use the text link class", () => {
  const ui = mountPage(SAMPLE_CATALOG);
  try {
    const evidence = ui.find((node) => node.type === "a" && node.props.href === "https://news.ycombinator.com/item?id=26188584");
    assert.equal(evidence.props.className, "ht-text-link");
    ui.location.hash = "#about";
    ui.listeners.hashchange.forEach((fn) => fn());
    const credit = ui.find((node) => node.type === "a" && node.props.href === "https://karpathy.bearblog.dev/hacker-tube/");
    const site = ui.find((node) => node.type === "a" && node.props.href === "https://hackertube.org/");
    assert.equal(credit.props.className, "ht-text-link");
    assert.equal(site.props.className, "ht-text-link");
  } finally {
    ui.restore();
  }
});
