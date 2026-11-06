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

test("LIB01 save twice keeps one saved record", () => {
  const once = page.applySave(page.emptyProfile(), "ol:OL66554W");
  const twice = page.applySave(once, "ol:OL66554W");
  assert.equal(twice, once);
  const saved = twice.items.filter((row) => row.saved);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].item_id, "ol:OL66554W");
  assert.equal(saved[0].completed, false);
  assert.deepEqual(saved[0].opens, []);
});

test("dismiss does not duplicate and does not remove the id", () => {
  const once = page.applyDismiss(page.emptyProfile(), "ol:OL66554W");
  const twice = page.applyDismiss(once, "ol:OL66554W");
  assert.equal(twice, once);
  assert.equal(once.items.length, 1);
  assert.equal(once.items[0].item_id, "ol:OL66554W");
  assert.equal(once.items[0].dismissed, true);
  assert.equal(once.items[0].saved, false);
});

test("LIB03 open records an event and leaves completion unchanged", () => {
  const saved = page.applySave(page.emptyProfile(), "ol:OL66554W");
  const opened = page.applyOpen(saved, "ol:OL66554W", "2026-11-06T15:00:00Z");
  assert.equal(opened.items[0].saved, true);
  assert.equal(opened.items[0].completed, false);
  assert.deepEqual(opened.items[0].opens, ["2026-11-06T15:00:00Z"]);
  const again = page.applyOpen(opened, "ol:OL66554W", "2026-11-06T15:05:00Z");
  assert.deepEqual(again.items[0].opens, ["2026-11-06T15:00:00Z", "2026-11-06T15:05:00Z"]);
  assert.equal(again.items[0].completed, false);
  assert.equal(again.items[0].saved, true);
});

test("PREF01 gardening interest is accepted and kept", () => {
  const once = page.addInterest(page.emptyProfile(), " gardening ");
  const twice = page.addInterest(once, "gardening");
  assert.equal(twice, once);
  assert.deepEqual(once.interests, ["gardening"]);
  assert.equal(page.addInterest(page.emptyProfile(), "<b>gardening</b>").interests.length, 0);
  assert.equal(page.addInterest(page.emptyProfile(), "").interests.length, 0);
  const eighty = "a".repeat(80);
  assert.deepEqual(page.addInterest(page.emptyProfile(), eighty).interests, [eighty]);
  assert.equal(page.addInterest(page.emptyProfile(), "a".repeat(81)).interests.length, 0);
  const plants = "🌱".repeat(80);
  assert.equal(page.addInterest(page.emptyProfile(), plants).interests[0], plants);
  assert.equal(page.addInterest(page.emptyProfile(), "🌱".repeat(81)).interests.length, 0);
  assert.equal(page.addInterest(page.emptyProfile(), "gardening\nbeds").interests.length, 0);
  assert.equal(page.addInterest(page.emptyProfile(), "gardening\rbeds").interests.length, 0);
  assert.deepEqual(page.addInterest(page.emptyProfile(), "&lt;b&gt;").interests, ["&lt;b&gt;"]);
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

function group(matches, browse) {
  return {
    matches,
    browse,
    match_count: matches.length,
    browse_count: browse.length,
  };
}

function emptyGroups() {
  return {
    videos: group([], []),
    podcasts: group([], []),
    books: group([], []),
    audiobooks: group([], []),
  };
}

function harnessDiscovery(catalogBody) {
  const items = (((catalogBody || {}).catalog || {}).items || []).slice()
    .sort((a, b) => (a.capture_order || 0) - (b.capture_order || 0));
  const sections = emptyGroups();
  const key = {
    video: "videos",
    podcast_episode: "podcasts",
    podcast_show: "podcasts",
    book: "books",
    audiobook: "audiobooks",
  };
  items.forEach((item) => {
    const name = key[item.format];
    if (!name) return;
    sections[name].browse.push(item.item_id);
    sections[name].browse_count += 1;
  });
  return {
    schema: page.DISCOVERY_SCHEMA,
    personalized: false,
    paid_calls: 0,
    interests: [],
    signals: [],
    feed: [],
    why: {},
    sections,
  };
}

function textOf(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object") return textOf(node.children);
  return "";
}

function mountPage(catalogBody, profileBody, respond, feedBody) {
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
  const calls = [];
  const Page = page.createPage({
    React,
    fetchJSON(url, init) {
      const target = String(url || "");
      calls.push(target);
      return {
        then(onOk) {
          if (target.indexOf("/profile") !== -1) {
            if (init && init.method === "POST" && respond) {
              onOk(respond(target, JSON.parse(init.body)));
            } else {
              onOk(profileBody || page.emptyProfile());
            }
          } else if (target.indexOf("/feed") !== -1) {
            onOk(feedBody || harnessDiscovery(catalogBody));
          } else if (catalogBody) {
            onOk(catalogBody);
          }
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
    calls,
    text(pred) {
      return textOf(find(pred));
    },
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
    const form = ui.find((node) => node.type === "form" && node.props.id === "hackertube-search-panel");
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

test("LIB02 loaded profile shows the saved item after a fresh page", () => {
  const ui = mountPage(SAMPLE_CATALOG, {
    schema: "hackertube.profile/1",
    interests: [],
    items: [{
      item_id: "b1",
      saved: true,
      dismissed: false,
      completed: false,
      saved_order: 1,
      opens: ["2026-11-06T15:00:00Z"],
    }],
  });
  try {
    const saved = ui.find((node) => (node.children || []).some((child) => child === "Saved"));
    assert.equal(saved.props["aria-disabled"], "true");
    const count = ui.find((node) => node.type === "a" && node.props.href === "#library");
    assert.equal(count.children[0], "Library (1 saved)");
    ui.location.hash = "#library";
    ui.listeners.hashchange.forEach((fn) => fn());
    const opened = ui.find((node) => node.type === "p" && node.children && node.children[0] === "Opened");
    const notCompleted = ui.find((node) => node.type === "p" && node.children && node.children[0] === "Not completed");
    assert.ok(opened);
    assert.ok(notCompleted);
  } finally {
    ui.restore();
  }
});

test("PREF01 loaded gardening interest stays on the page", () => {
  const ui = mountPage(SAMPLE_CATALOG, {
    schema: "hackertube.profile/1",
    interests: ["gardening"],
    items: [],
  });
  try {
    const item = ui.find((node) => node.type === "li" && node.children && node.children[0] === "gardening");
    assert.ok(item);
    const note = ui.find((node) => node.props && node.props.id === "hackertube-interest-note");
    assert.match(note.children[0], /not limited to technology/);
  } finally {
    ui.restore();
  }
});

test("LIB01 page save posts only the item id", () => {
  const posts = [];
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), (url, body) => {
    posts.push({ url, body });
    return {
      schema: "hackertube.profile/1",
      interests: [],
      items: [{
        item_id: body.item_id,
        saved: true,
        dismissed: false,
        completed: false,
        saved_order: 1,
        opens: [],
      }],
    };
  });
  try {
    const save = ui.find((node) => (node.children || []).some((child) => child === "Save"));
    save.props.onClick({ preventDefault() {} });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, "/api/plugins/hackertube/profile/saves");
    assert.deepEqual(posts[0].body, { item_id: "b1" });
    const saved = ui.find((node) => (node.children || []).some((child) => child === "Saved"));
    assert.equal(saved.props["aria-disabled"], "true");
    const count = ui.find((node) => node.type === "a" && node.props.href === "#library");
    assert.equal(count.children[0], "Library (1 saved)");
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

const RANK_CATALOG = {
  catalog: {
    items: [
      {
        item_id: "py",
        format: "podcast_show",
        title: "The Python Show",
        destination: "https://podcasts.apple.com/us/podcast/the-python-show/id1691189730?uo=4",
        capture_order: 1,
        contributors: ["Learning about Python together"],
        duration_seconds: null,
        art_url: null,
        art_hotlink: false,
      },
      {
        item_id: "b1",
        format: "book",
        title: "Emma",
        destination: "https://openlibrary.org/works/OL66513W",
        capture_order: 2,
        contributors: ["Jane Austen"],
        duration_seconds: null,
        art_url: null,
        art_hotlink: false,
      },
    ],
    evidence: [{
      item_id: "b1",
      source_id: "openlibrary",
      kind: "catalog",
      endorsement: "not_applicable",
      display_line: null,
      destination: "https://openlibrary.org/works/OL66513W",
      retrieved_at: "2026-11-06T12:22:21Z",
    }],
    sources: [{ source_id: "openlibrary", name: "Open Library" }],
    editions: [],
  },
};

const RANKED_FEED = {
  schema: "hackertube.discovery/1",
  personalized: true,
  paid_calls: 0,
  interests: ["What can I read or listen to by Jane Austen?"],
  signals: ["matched interest", "community evidence", "freshness", "variety"],
  feed: ["b1"],
  why: { b1: ["Matched interest", "Recent"] },
  sections: {
    videos: group([], []),
    podcasts: group([], ["py"]),
    books: group(["b1"], []),
    audiobooks: group([], []),
  },
};

test("FEED01 ranked opening feed shows the interest match without a question", () => {
  const ui = mountPage(RANK_CATALOG, page.emptyProfile(), null, RANKED_FEED);
  try {
    const ranked = ui.text((node) => node.props && node.props.id === "ranked-feed");
    assert.match(ranked, /Emma/);
    assert.doesNotMatch(ranked, /The Python Show/);
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-question"), null);
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-results"), null);
    assert.doesNotMatch(ranked, /No search was started/);
  } finally {
    ui.restore();
  }
});

test("FEED02 the page explains the signals used", () => {
  const ui = mountPage(RANK_CATALOG, page.emptyProfile(), null, RANKED_FEED);
  try {
    const signals = ui.text((node) => node.props && node.props.id === "hackertube-signals");
    assert.equal(signals, page.POLICY_NOTE);
    assert.match(signals, /community evidence/i);
    assert.match(signals, /freshness/i);
    assert.match(signals, /variety/i);
    assert.match(signals, /Scores are not shown/);
    assert.doesNotMatch(signals, /\d/);
    const why = ui.text((node) => node.props && node.props.className === "ht-why");
    assert.equal(why, "Matched interest. Recent.");
    assert.doesNotMatch(why, /Community evidence|Hacker News|Recommended|endorsement/);
    const counts = ui.text((node) => node.props && node.props.id === "hackertube-ranked-counts");
    assert.equal(counts, "Videos 0, Podcasts 0, Books 1, Audiobooks 0.");
  } finally {
    ui.restore();
  }
});

test("FEED03 a publisher record is labeled a source candidate", () => {
  const ui = mountPage(RANK_CATALOG, page.emptyProfile(), null, RANKED_FEED);
  try {
    const ranked = ui.text((node) => node.props && node.props.id === "ranked-feed");
    assert.match(ranked, /Source candidate/);
    assert.match(ranked, /Open Library/);
    assert.doesNotMatch(ranked, /Recommended in Hacker News/);
  } finally {
    ui.restore();
  }
});

test("FEED04 refresh paging and save stay on local routes", () => {
  const ui = mountPage(SAMPLE_CATALOG);
  try {
    ui.calls.length = 0;
    const refresh = ui.find((node) => (node.children || []).some((child) => child === "Refresh prepared catalog"));
    refresh.props.onClick();
    assert.deepEqual(ui.calls, [
      "/api/plugins/hackertube/catalog",
      "/api/plugins/hackertube/feed",
    ]);
    assert.equal(ui.calls.some((url) => /openai|anthropic|generativelanguage|api\.search/.test(url)), false);
    const five = [1, 2, 3, 4, 5];
    assert.equal(page.visibleSlice(five, false, page.INITIAL_CARDS).length, 4);
    assert.equal(page.visibleSlice(five, true, page.INITIAL_CARDS).length, 5);
  } finally {
    ui.restore();
  }
});

test("FEED05 a dismissed item stays out of discovery and remains in the library", () => {
  const ui = mountPage(RANK_CATALOG, {
    schema: "hackertube.profile/1",
    interests: ["Jane Austen"],
    items: [{
      item_id: "b1",
      saved: true,
      dismissed: true,
      completed: false,
      saved_order: 1,
      opens: [],
    }],
  }, null, RANKED_FEED);
  try {
    const ranked = ui.text((node) => node.props && node.props.id === "ranked-feed");
    const books = ui.text((node) => node.props && node.props.id === "books");
    assert.doesNotMatch(ranked, /Emma/);
    assert.doesNotMatch(books, /Emma/);
    ui.location.hash = "#library";
    ui.listeners.hashchange.forEach((fn) => fn());
    const library = ui.text((node) => node.props && node.props.id === "books");
    assert.match(library, /Emma/);
    assert.match(library, /Saved/);
  } finally {
    ui.restore();
  }
});

function sparseFeed(interest) {
  return {
    schema: "hackertube.discovery/1",
    personalized: true,
    paid_calls: 0,
    interests: [interest],
    signals: [],
    feed: [],
    why: {},
    sections: {
      videos: group([], []),
      podcasts: group([], ["py"]),
      books: group([], ["b1"]),
      audiobooks: group([], []),
    },
  };
}

function assertSparseCoverage(ui, interest) {
  const listed = ui.text((node) => node.type === "li" && node.children && node.children[0] === interest);
  assert.equal(listed, interest);
  const coverage = ui.text((node) => node.props && node.props.id === "hackertube-coverage");
  assert.equal(coverage, page.FEED06_NOTE);
  assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-feed-note"), null);
  const ranked = ui.text((node) => node.props && node.props.id === "ranked-feed");
  assert.doesNotMatch(ranked, /The Python Show/);
  assert.doesNotMatch(ranked, /Emma/);
  assert.doesNotMatch(ranked, /recommended/i);
  const podcasts = ui.text((node) => node.props && node.props.id === "podcasts");
  assert.match(podcasts, /No podcasts match these interests/);
  assert.match(podcasts, /More in Podcasts, not matched to your interests/);
  assert.match(podcasts, /0 matches/);
  assert.match(podcasts, /The Python Show/);
  assert.doesNotMatch(podcasts, /Matched interest/);
  assert.doesNotMatch(podcasts, /recommended/i);
  const browse = ui.text((node) => node.props && node.props.id === "podcasts-browse");
  assert.equal(browse.includes("ht-why"), false);
  assert.doesNotMatch(browse, /Matched interest|Community evidence/);
  const open = ui.find((node) => (node.children || []).some((child) => child === "Open focused search"));
  assert.ok(open);
}

test("FEED06 AI interest is a personalized profile with no unrelated fill", () => {
  const ui = mountPage(RANK_CATALOG, {
    schema: "hackertube.profile/1",
    interests: ["AI"],
    items: [],
  }, null, sparseFeed("AI"));
  try {
    assertSparseCoverage(ui, "AI");
  } finally {
    ui.restore();
  }
});

test("FEED06 C++ interest is a personalized profile with no unrelated fill", () => {
  const ui = mountPage(RANK_CATALOG, {
    schema: "hackertube.profile/1",
    interests: ["C++"],
    items: [],
  }, null, sparseFeed("C++"));
  try {
    assertSparseCoverage(ui, "C++");
  } finally {
    ui.restore();
  }
});

test("a short interest beside a match still shows the ranked match", () => {
  const ui = mountPage(RANK_CATALOG, {
    schema: "hackertube.profile/1",
    interests: ["AI", "Jane Austen"],
    items: [],
  }, null, Object.assign({}, RANKED_FEED, { interests: ["AI", "Jane Austen"] }));
  try {
    const ranked = ui.text((node) => node.props && node.props.id === "ranked-feed");
    assert.match(ranked, /Emma/);
    assert.doesNotMatch(ranked, /The Python Show/);
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-coverage"), null);
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-feed-note"), null);
  } finally {
    ui.restore();
  }
});

test("FEED06 no matches explain the coverage limit and offer focused search", () => {
  const ui = mountPage(RANK_CATALOG, {
    schema: "hackertube.profile/1",
    interests: ["gardening"],
    items: [],
  }, null, sparseFeed("gardening"));
  try {
    const coverage = ui.text((node) => node.props && node.props.id === "hackertube-coverage");
    assert.equal(coverage, page.FEED06_NOTE);
    assert.match(coverage, /Coverage is limited/);
    const ranked = ui.text((node) => node.props && node.props.id === "ranked-feed");
    assert.doesNotMatch(ranked, /The Python Show/);
    const podcasts = ui.text((node) => node.props && node.props.id === "podcasts");
    assert.match(podcasts, /The Python Show/);
    assert.match(podcasts, /More in Podcasts, not matched to your interests/);
    assert.match(podcasts, /No podcasts match these interests/);
    assert.doesNotMatch(podcasts, /recommended/i);
    const open = ui.find((node) => (node.children || []).some((child) => child === "Open focused search"));
    open.props.onClick();
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-question").props.id, "hackertube-question");
  } finally {
    ui.restore();
  }
});

test("FEED07 no interests offer setup and refresh without a personalized claim", () => {
  const ui = mountPage(SAMPLE_CATALOG);
  try {
    const note = ui.text((node) => node.props && node.props.id === "hackertube-feed-note");
    assert.equal(note, page.FEED07_NOTE);
    assert.match(note, /Nothing here is ranked for you yet/);
    assert.doesNotMatch(note, /personalized recommendations/);
    assert.ok(ui.find((node) => node.props && node.props.id === "hackertube-interest"));
    assert.ok(ui.find((node) => (node.children || []).some((child) => child === "Refresh prepared catalog")));
    const videos = ui.text((node) => node.props && node.props.id === "videos");
    assert.match(videos, /No videos in this catalog/);
    const pageText = ui.text((node) => node.props && node.props.className === "hackertube");
    assert.doesNotMatch(pageText, /not matched/);
  } finally {
    ui.restore();
  }
});

test("Show more Enter focuses the fifth item heading", async () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  function load(name, fallback) {
    try {
      return require(name);
    } catch (err) {
      return require(fallback);
    }
  }
  const esbuild = load("esbuild", "/tmp/hermes-src/hermes-v023/node_modules/esbuild");
  const { chromium } = load("playwright", "/tmp/pw/node_modules/playwright");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-show-more-"));
  const harness = path.join(dir, "harness.js");
  const bundle = path.join(dir, "bundle.js");
  const htmlPath = path.join(dir, "index.html");
  fs.writeFileSync(harness, `
    const React = require("react");
    const { createRoot } = require("react-dom/client");
    const page = require(${JSON.stringify(path.resolve(__dirname, "../hackertube/dashboard/dist/index.js"))});
    function Button(props) {
      return React.createElement("button", {
        type: props.type || "button",
        className: props.className,
        onClick: props.onClick,
      }, props.children);
    }
    function Pass(props) {
      return React.createElement("div", { className: props.className }, props.children);
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
    const items = [];
    for (let i = 1; i <= 10; i += 1) {
      items.push({
        item_id: "b" + i,
        format: "book",
        title: "Title " + i,
        destination: "https://openlibrary.org/works/OL" + i + "W",
        capture_order: i,
        contributors: ["Jane Austen"],
        duration_seconds: null,
        art_url: null,
        art_hotlink: false,
      });
    }
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
    const Page = page.createPage({
      React,
      fetchJSON(url) {
        const body = String(url).indexOf("/feed") !== -1
          ? feed
          : { catalog: { items, evidence: [], sources: [], editions: [] } };
        return Promise.resolve(body);
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
  `);
  await esbuild.build({
    entryPoints: [harness],
    bundle: true,
    format: "iife",
    outfile: bundle,
    platform: "browser",
    absWorkingDir: dir,
    nodePaths: ["/tmp/hermes-src/hermes-v023/node_modules"],
  });
  fs.writeFileSync(htmlPath, "<!doctype html><html><body><div id=\"root\"></div><script src=\"" + bundle + "\"></script></body></html>");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const ui = await context.newPage();
    await ui.goto("file://" + htmlPath);
    const showMore = ui.locator("#ranked-feed").getByRole("button", { name: "Show more" });
    await showMore.waitFor();
    await showMore.focus();
    await ui.keyboard.press("Enter");
    await ui.waitForFunction(() => {
      const el = document.activeElement;
      return el && el.tagName === "H3" && el.tabIndex === -1;
    });
    const active = await ui.evaluate(() => ({
      tag: document.activeElement.tagName,
      text: document.activeElement.textContent,
      tabIndex: document.activeElement.tabIndex,
      id: document.activeElement.id,
      live: document.getElementById("hackertube-expand-live").textContent,
    }));
    assert.equal(active.tag, "H3");
    assert.equal(active.tabIndex, -1);
    assert.equal(active.id, "ht-expanded-ranked");
    assert.equal(active.text, "Title 5");
    assert.equal(active.live, "10 of 10");
  } finally {
    await browser.close();
  }
});

test("an expired evidence id omitted by the section payload stays hidden", () => {
  const hidden = {
    schema: "hackertube.discovery/1",
    personalized: false,
    paid_calls: 0,
    interests: [],
    signals: [],
    feed: [],
    why: {},
    sections: {
      videos: group([], []),
      podcasts: group([], []),
      books: group([], ["b1"]),
      audiobooks: group([], []),
    },
  };
  const ui = mountPage(RANK_CATALOG, page.emptyProfile(), null, hidden);
  try {
    const podcasts = ui.text((node) => node.props && node.props.id === "podcasts");
    const books = ui.text((node) => node.props && node.props.id === "books");
    assert.doesNotMatch(podcasts, /The Python Show/);
    assert.match(books, /Emma/);
    assert.doesNotMatch(books, /not matched/);
  } finally {
    ui.restore();
  }
});

test("FEED10 a section lists matches then a not-matched group with no why-line", () => {
  const catalog = {
    catalog: {
      items: [
        {
          item_id: "b1",
          format: "book",
          title: "Emma",
          destination: "https://openlibrary.org/works/OL66513W",
          capture_order: 1,
          contributors: ["Jane Austen"],
          duration_seconds: null,
          art_url: null,
          art_hotlink: false,
        },
        {
          item_id: "b2",
          format: "book",
          title: "Northanger Abbey",
          destination: "https://openlibrary.org/works/OL66534W",
          capture_order: 2,
          contributors: ["Someone Else"],
          duration_seconds: null,
          art_url: null,
          art_hotlink: false,
        },
      ],
      evidence: [],
      sources: [],
      editions: [],
    },
  };
  const feed = {
    schema: "hackertube.discovery/1",
    personalized: true,
    paid_calls: 0,
    interests: ["Jane Austen"],
    signals: ["matched interest", "freshness", "variety"],
    feed: ["b1"],
    why: {
      b1: ["Matched interest", "Recent"],
      b2: ["Matched interest", "Community evidence"],
    },
    sections: {
      videos: group([], []),
      podcasts: group([], []),
      books: group(["b1"], ["b2"]),
      audiobooks: group([], []),
    },
  };
  const ui = mountPage(catalog, page.emptyProfile(), null, feed);
  try {
    const books = ui.text((node) => node.props && node.props.id === "books");
    assert.match(books, /1 match/);
    assert.match(books, /More in Books, not matched to your interests/);
    assert.ok(books.indexOf("Emma") < books.indexOf("not matched"));
    assert.ok(books.indexOf("not matched") < books.indexOf("Northanger Abbey"));
    const matches = ui.text((node) => node.props && node.props.id === "books-matches");
    assert.match(matches, /Matched interest\. Recent\./);
    assert.doesNotMatch(matches, /Community evidence|Hacker News|score|1000/);
    const browse = ui.text((node) => node.props && node.props.id === "books-browse");
    assert.match(browse, /Northanger Abbey/);
    assert.doesNotMatch(browse, /Matched interest|Community evidence|Recommended|why/);
    const ranked = ui.text((node) => node.props && node.props.id === "ranked-feed");
    assert.match(ranked, /Emma/);
    assert.doesNotMatch(ranked, /Northanger Abbey/);
  } finally {
    ui.restore();
  }
});

test("SEARCH07 browse items are not presented as verified recommendations", () => {
  const catalog = {
    catalog: {
      items: [
        {
          item_id: "py",
          format: "podcast_show",
          title: "The Python Show",
          destination: "https://podcasts.apple.com/us/podcast/the-python-show/id1691189730?uo=4",
          capture_order: 1,
          contributors: ["Learning about Python together"],
          duration_seconds: null,
          art_url: null,
          art_hotlink: false,
        },
        {
          item_id: "ab",
          format: "audiobook",
          title: "Northanger Abbey",
          destination: "https://librivox.org/northanger-abbey-by-jane-austen/",
          capture_order: 2,
          contributors: ["Jane Austen"],
          duration_seconds: null,
          art_url: null,
          art_hotlink: false,
        },
      ],
      evidence: [],
      sources: [],
      editions: [],
    },
  };
  const feed = {
    schema: "hackertube.discovery/1",
    personalized: true,
    paid_calls: 0,
    interests: ["python"],
    signals: ["matched interest"],
    feed: ["py"],
    why: { py: ["Matched interest"] },
    sections: {
      videos: group([], []),
      podcasts: group(["py"], []),
      books: group([], []),
      audiobooks: group([], ["ab"]),
    },
  };
  const ui = mountPage(catalog, {
    schema: "hackertube.profile/1",
    interests: ["python"],
    items: [],
  }, null, feed);
  try {
    const audio = ui.text((node) => node.props && node.props.id === "audiobooks");
    assert.match(audio, /0 matches/);
    assert.match(audio, /More in Audiobooks, not matched to your interests/);
    assert.match(audio, /Northanger Abbey/);
    assert.doesNotMatch(audio, /Matched interest|recommended|verified/i);
    const ranked = ui.text((node) => node.props && node.props.id === "ranked-feed");
    assert.match(ranked, /The Python Show/);
    assert.doesNotMatch(ranked, /Northanger Abbey/);
    const trigger = ui.find((node) => (node.children || []).some((child) => child === "Focused search"));
    trigger.props.onClick();
    const input = ui.find((node) => node.props && node.props.id === "hackertube-question");
    input.props.onChange({ target: { value: "Is there another edition?" } });
    const form = ui.find((node) => node.type === "form" && node.props.id === "hackertube-search-panel");
    form.props.onSubmit({ preventDefault() {} });
    const results = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(results, /No search was started/);
    assert.doesNotMatch(results, /Northanger Abbey|verified match/);
  } finally {
    ui.restore();
  }
});
