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

const SOURCE_ONLY_CATALOG = {
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

function defaultSearchResult() {
  return {
    schema: page.SEARCH_SCHEMA,
    provider: "stub",
    job: {
      job_id: "job:1",
      state: "succeeded",
      limits: { max_hits: 12, max_requests: 2, deadline_seconds: 5 },
    },
    interpretation: {
      topic: "jane austen",
      terms: ["jane", "austen"],
      formats: ["book"],
      max_duration_seconds: null,
    },
    sections: {},
    results: [],
    coverage: { verified: 0, formats_without_match: [], notes: [] },
    usage: {
      cost_usd: null,
      cost_known: false,
      requests_used: 1,
      paid_calls: 0,
      request_counts: { free: 0, paid: 0, metered: 0 },
    },
  };
}

function verifiedResult(itemId, overrides) {
  return Object.assign({
    item_id: itemId,
    title: "Emma",
    format: "book",
    destination: "https://openlibrary.org/works/OL66513W",
    source: {
      source_id: "openlibrary",
      source_name: "Open Library",
      kind: "catalog",
      label: "Open Library",
      community_endorsement: false,
    },
    constraint: "none",
    constraint_note: null,
    strict: true,
    state: { saved: false, dismissed: false, completed: false, opens: 0, label: null },
    why: ["Matched the question: jane austen"],
    verified: true,
  }, overrides || {});
}

function searchResult(groups, overrides) {
  const result = defaultSearchResult();
  result.sections = groups || {};
  return Object.assign(result, overrides || {});
}

function openSearchPanel(ui) {
  const trigger = ui.find((node) => (node.children || []).some((child) => child === "Focused search"));
  trigger.props.onClick();
}

function submitSearch(ui, question, options) {
  const opts = options || {};
  openSearchPanel(ui);
  const input = ui.find((node) => node.props && node.props.id === "hackertube-question");
  input.props.onChange({ target: { value: question } });
  if (opts.ack !== false) {
    const box = ui.find((node) => node.props && node.props.id === "hackertube-disclosure-ack");
    box.props.onChange({ target: { checked: true } });
  }
  const form = ui.find((node) => node.type === "form" && node.props.id === "hackertube-search-panel");
  form.props.onSubmit({ preventDefault() {} });
}

function submitSearchInPlace(ui, question) {
  // The panel stays mounted after a completed Search, so a second Search is
  // submitted without toggling the disclosure shut first.
  const input = ui.find((node) => node.props && node.props.id === "hackertube-question");
  input.props.onChange({ target: { value: question } });
  const form = ui.find((node) => node.type === "form" && node.props.id === "hackertube-search-panel");
  form.props.onSubmit({ preventDefault() {} });
}

function textOf(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object") return textOf(node.children);
  return "";
}

function mountPage(catalogBody, profileBody, respond, feedBody, searchOutcome, statusBody, deferSearch, modelResponses, deferSettings, deferFeed) {
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
  const requests = [];

  function outcomeFor(target, init) {
    if (modelResponses && Object.prototype.hasOwnProperty.call(modelResponses, target)) return { value: modelResponses[target] };
    if (target.indexOf("/status") !== -1) {
      return {
        value: statusBody || { name: "HackerTube", model_key: "present", provider: "stub" },
      };
    }
    if (target.indexOf("/search") !== -1) {
      if (searchOutcome && searchOutcome.error) return { error: searchOutcome.error };
      return { value: (searchOutcome && searchOutcome.value) || defaultSearchResult() };
    }
    if (target.indexOf("/profile") !== -1) {
      if (init && init.method === "POST" && respond) {
        return { value: respond(target, JSON.parse(init.body)) };
      }
      return { value: profileBody || page.emptyProfile() };
    }
    if (target.indexOf("/feed") !== -1) {
      return { value: feedBody || harnessDiscovery(catalogBody) };
    }
    return { value: catalogBody };
  }

  const Page = page.createPage({
    React,
    fetchJSON(url, init) {
      const target = String(url || "");
      calls.push(target);
      requests.push({
        url: target,
        method: (init && init.method) || "GET",
        body: init && init.body ? JSON.parse(init.body) : null,
      });
      if (deferSettings && init && init.method === "POST" &&
          (target === "/api/model/set" || target === "/api/plugins/hackertube/sources")) {
        const entry = { url: target, onOk: null, onErr: null };
        deferSettings.pending.push(entry);
        return { then(onOk) { entry.onOk = onOk; return { catch(onErr) { entry.onErr = onErr; return this; } }; } };
      }
      if (deferSearch && target.indexOf("/search") !== -1 && init && init.method === "POST") {
        // Hold the Search response until the test settles it, so a request can
        // stay in flight while another one starts. The test drives settlement
        // through deferSearch.pending[i].onOk / .onErr.
        const entry = { url: target, onOk: null, onErr: null };
        deferSearch.pending.push(entry);
        return {
          then(onOk, onErr) {
            entry.onOk = onOk;
            entry.onErr = onErr;
            return {
              catch(fn) {
                if (!entry.onErr) entry.onErr = fn;
                return this;
              },
            };
          },
        };
      }
      if (deferFeed && deferFeed.hold && target.indexOf("/feed") !== -1) {
        // Hold the feed reread so a test can observe that no announcement is
        // made while the refresh is still in flight, then settle it through
        // deferFeed.pending[i].onOk(body) / .onErr(error).
        const entry = { url: target, onOk: null, onErr: null };
        deferFeed.pending.push(entry);
        return {
          then(onOk, onErr) {
            entry.onOk = onOk;
            entry.onErr = onErr;
            return {
              catch(fn) {
                if (!entry.onErr) entry.onErr = fn;
                return this;
              },
            };
          },
        };
      }
      return {
        then(onOk, onErr) {
          const outcome = outcomeFor(target, init);
          const result = {
            catch(fn) {
              if (outcome.error && fn) fn(outcome.error);
              return this;
            },
          };
          if (outcome.error) {
            if (onErr) onErr(outcome.error);
          } else if (onOk) {
            onOk(outcome.value);
          }
          return result;
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
  }).Content;

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
    requests,
    all(pred) {
      const hits = [];
      walk(tree, (node) => {
        if (pred(node)) hits.push(node);
      });
      return hits;
    },
    within(rootPred, pred) {
      const root = find(rootPred);
      if (!root) return null;
      const hits = [];
      walk(root.children, (node) => {
        if (pred(node)) hits.push(node);
      });
      return hits;
    },
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

test("PREF16 removing an interest posts its exact text and refreshes the feed", () => {
  const profile = { schema: page.PROFILE_SCHEMA, interests: ["gardening", "data science"], items: [] };
  const ui = mountPage(SAMPLE_CATALOG, profile, () => ({ ...profile, interests: ["data science"] }));
  try {
    ui.requests.length = 0;
    const remove = ui.find(node => node.props && node.props["aria-label"] === "Remove interest gardening");
    assert.ok(remove, "each interest needs an accessible remove button");
    assert.equal(remove.children[0], "Remove", "the control shows a visible Remove label");
    remove.props.onClick();
    assert.deepEqual(ui.requests.find(row => row.method === "POST").body, { text: "gardening", remove: true });
    assert.equal(ui.find(node => node.props && node.props["aria-label"] === "Remove interest gardening"), null);
    assert.ok(ui.find(node => node.props && node.props["aria-label"] === "Remove interest data science"));
    assert.equal(ui.requests.filter(row => row.url.endsWith("/feed")).length, 1);
    assert.equal(ui.requests.filter(row => row.url.includes("/search")).length, 0);
    assert.match(ui.text(node => node.props && node.props.className === "ht-status"), /Removed interest gardening\./);
    assert.equal(ui.focused.current && ui.focused.current.props.id, "hackertube-interest");
  } finally { ui.restore(); }
});

test("PREF16 a rejected removal keeps the interest available for retry", () => {
  const profile = { schema: page.PROFILE_SCHEMA, interests: ["gardening"], items: [] };
  const ui = mountPage(SAMPLE_CATALOG, profile, () => ({ error: "interest" }));
  try {
    ui.find(n => n.props && n.props["aria-label"] === "Remove interest gardening").props.onClick();
    assert.ok(ui.find(n => n.props && n.props["aria-label"] === "Remove interest gardening"));
    assert.match(ui.text(n => n.props && n.props.className === "ht-status"), /did not accept/);
  } finally { ui.restore(); }
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

const FIVE_BOOKS = {
  catalog: {
    items: ["k1", "k2", "k3", "k4", "k5"].map((id, index) => ({
      item_id: id,
      format: "book",
      title: "Book " + (index + 1),
      destination: "https://openlibrary.org/works/OL" + (66550 + index) + "W",
      capture_order: index + 1,
      contributors: ["Jane Austen"],
      duration_seconds: null,
      art_url: null,
      art_hotlink: false,
    })),
    evidence: [],
    sources: [{ source_id: "openlibrary", name: "Open Library" }],
    editions: [],
  },
};

const FIVE_FEED = {
  schema: "hackertube.discovery/1",
  personalized: true,
  paid_calls: 0,
  interests: ["jane austen"],
  signals: ["matched interest"],
  feed: ["k1", "k2", "k3", "k4", "k5"],
  why: {
    k1: ["Matched interest"],
    k2: ["Matched interest"],
    k3: ["Matched interest"],
    k4: ["Matched interest"],
    k5: ["Matched interest"],
  },
  sections: {
    videos: group([], []),
    podcasts: group([], []),
    books: group(["k1", "k2", "k3", "k4", "k5"], []),
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
  } finally {
    ui.restore();
  }
});

test("FEED04 Show more is the rendered control, and it dispatches no request", () => {
  const ui = mountPage(FIVE_BOOKS, page.emptyProfile(), null, FIVE_FEED);
  try {
    const rankedCards = () => ui.within(
      (node) => node.props && node.props.id === "ranked-feed",
      (node) => node.props && node.props.className === "ht-actions",
    ).length;
    assert.equal(rankedCards(), page.INITIAL_CARDS, "the first screen holds back the fifth ranked card");
    const before = ui.requests.length;
    const showMore = ui.within(
      (node) => node.props && node.props.id === "ranked-feed",
      (node) => (node.children || []).some((child) => child === "Show more"),
    );
    assert.equal(showMore.length, 1, "the ranked feed offers one Show more control");
    showMore[0].props.onClick();
    assert.equal(rankedCards(), 5, "Show more revealed the fifth ranked card");
    assert.deepEqual(ui.requests.slice(before), [], "Show more dispatched no request");
  } finally {
    ui.restore();
  }
});

test("FEED04 Save, Dismiss, and Open controls post to the profile routes", () => {
  // The page's own controls are activated. Each one must issue one POST to the
  // backend route that owns the mutation, and the click path stays local.
  let serverProfile = page.emptyProfile();
  const respond = (url, body) => {
    if (url.endsWith("/saves")) serverProfile = page.applySave(serverProfile, body.item_id);
    else if (url.endsWith("/dismissals")) serverProfile = page.applyDismiss(serverProfile, body.item_id);
    else if (url.endsWith("/opens")) serverProfile = page.applyOpen(serverProfile, body.item_id, "2026-11-06T12:00:00Z");
    return serverProfile;
  };
  const ui = mountPage(FIVE_BOOKS, page.emptyProfile(), respond, FIVE_FEED);
  try {
    const action = (label) => ui.all((node) => (node.children || []).some((child) => child === label))[0];
    const click = (node) => node.props.onClick({ preventDefault() {}, stopPropagation() {} });
    // A profile write makes the page re-read its prepared catalog and feed, so
    // the POST is asserted, and every request on the click path is local.
    const posts = () => ui.requests.filter((request) => request.method === "POST");
    const reset = () => { ui.requests.length = 0; };

    reset();
    const open = ui.find((node) => node.props && /(^|\s)ht-open(\s|$)/.test(node.props.className || ""));
    assert.notEqual(open, null, "the first card offers an Open control");
    open.props.onClick();
    assert.deepEqual(posts(), [{
      url: "/api/plugins/hackertube/profile/opens",
      method: "POST",
      body: { item_id: "k1" },
    }]);

    reset();
    click(action("Save"));
    assert.deepEqual(posts(), [{
      url: "/api/plugins/hackertube/profile/saves",
      method: "POST",
      body: { item_id: "k1" },
    }]);

    reset();
    click(action("Dismiss"));
    assert.deepEqual(posts(), [{
      url: "/api/plugins/hackertube/profile/dismissals",
      method: "POST",
      body: { item_id: "k1" },
    }]);

    // Every path on every click stays on the plugin's own local routes.
    for (const request of ui.requests) {
      assert.match(request.url, /^\/api\/plugins\/hackertube\//);
    }
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
  const listed = ui.find((node) => node.type === "li" && node.children && node.children[0] === interest);
  assert.equal(listed.children[0], interest);
  assert.ok(ui.find(node => node.props && node.props["aria-label"] === "Remove interest " + interest));
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
  // Module roots are discovered, not hardcoded: HACKERTUBE_NODE_MODULES, then
  // NODE_PATH, then this box's Hermes install. A missing React dependency here
  // fails the run with a resolution error instead of silently passing.
  const moduleRoots = [
    path.resolve(__dirname, "../node_modules"),
    ...String(process.env.HACKERTUBE_NODE_MODULES || "").split(path.delimiter),
    ...String(process.env.NODE_PATH || "").split(path.delimiter),
    path.join(os.homedir(), ".hermes", "hermes-agent", "node_modules"),
  ].filter(Boolean);
  function load(name) {
    for (const root of moduleRoots) {
      try {
        return require(require.resolve(name, { paths: [root] }));
      } catch (err) {
        // try the next root
      }
    }
    return require(name);
  }
  const esbuild = load("esbuild");
  const { chromium } = load("playwright");
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
        if (url === "/api/plugins/hackertube/privacy") return Promise.resolve({version:"test", text:"Fixture policy", accepted:true});
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
    nodePaths: moduleRoots,
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
    // No results panel exists until a Search is submitted, so a browse item
    // is never presented as a search result.
    assert.equal(ui.find((node) => node.props && node.props.className === "ht-results"), null);
  } finally {
    ui.restore();
  }
});

/* --- tasks 4.1 and 4.2: the Search panel, disclosure, and results --------- */

test("SEARCH01 the Search control posts the question with the accepted disclosure", () => {
  const search = searchResult(
    { books: { label: "books", verified: [verifiedResult("b1")], verified_count: 1, insufficient_evidence: false } },
    { interpretation: { topic: "jane austen", terms: ["jane", "austen"], formats: ["book"], max_duration_seconds: null } },
  );
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: search });
  try {
    ui.requests.length = 0;
    submitSearch(ui, "  What can I read by Jane Austen?  ");
    const posted = ui.requests.filter((row) => row.url.indexOf("/search") !== -1);
    assert.equal(posted.length, 1, "exactly one Search request");
    assert.equal(posted[0].method, "POST");
    assert.deepEqual(posted[0].body, {
      question: "What can I read by Jane Austen?",
      disclosure_accepted: true,
      background: true,
    });
    const results = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(results, /Question: What can I read by Jane Austen\?/);
    assert.match(results, /Provider: stub\./);
    assert.doesNotMatch(results, /Job job:1\./, "the internal job id is not rendered");
    assert.match(results, /State: succeeded\./);
    assert.match(results, /Source: Open Library/);
    assert.match(results, /Matched the question: jane austen\./);
  } finally {
    ui.restore();
  }
});

test("JOB09 and JOB10 the disclosure and its control are at the action every time", () => {
  const ui = mountPage(SAMPLE_CATALOG);
  try {
    const submitButton = () => ui.find(
      (node) => (node.children || []).some((child) => child === "Search"),
    );
    assert.equal(submitButton(), null, "no form before the panel opens");
    openSearchPanel(ui);
    let disclosure = ui.text((node) => node.props && node.props.id === "hackertube-disclosure");
    assert.equal(disclosure, page.DISCLOSURE);
    assert.equal(submitButton().props["aria-describedby"], "hackertube-disclosure");
    let box = ui.find((node) => node.props && node.props.id === "hackertube-disclosure-ack");
    assert.equal(box.props.type, "checkbox");
    assert.equal(box.props.checked, false);

    // Close, then act again: the disclosure and its control are re-rendered
    // for the next action without any prior job's screen.
    const close = ui.find((node) => (node.children || []).some((child) => child === "Close search"));
    close.props.onClick();
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-disclosure"), null);
    openSearchPanel(ui);
    disclosure = ui.text((node) => node.props && node.props.id === "hackertube-disclosure");
    box = ui.find((node) => node.props && node.props.id === "hackertube-disclosure-ack");
    assert.equal(disclosure, page.DISCLOSURE);
    assert.equal(box.props.checked, false);
  } finally {
    ui.restore();
  }
});

test("JOB09 an unaccepted disclosure alerts and dispatches no request", () => {
  const ui = mountPage(SAMPLE_CATALOG);
  try {
    ui.requests.length = 0;
    submitSearch(ui, "What can I read by Jane Austen?", { ack: false });
    assert.equal(ui.focused.current.props.role, "alert");
    assert.equal(ui.focused.current.children[0], page.DISCLOSURE_ACK_ALERT);
    assert.deepEqual(ui.requests.filter((row) => row.url.indexOf("/search") !== -1), []);
  } finally {
    ui.restore();
  }
});

test("the panel warns before submitting when the live provider has no key", () => {
  const ui = mountPage(
    SAMPLE_CATALOG,
    page.emptyProfile(),
    null,
    null,
    null,
    { name: "HackerTube", model_key: "absent", provider: "live" },
  );
  try {
    openSearchPanel(ui);
    const note = ui.text((node) => node.props && node.props.id === "hackertube-provider-note");
    assert.equal(note, page.SEARCH_PROVIDER_NOTE);
    assert.match(note, /configured Hermes providers/);
    assert.equal(
      ui.find((node) => node.props && node.props.id === "hackertube-provider-note").props.role,
      undefined,
      "a static note is not a live region",
    );
  } finally {
    ui.restore();
  }
});

test("the panel does not warn when the stub provider is selected", () => {
  const ui = mountPage(
    SAMPLE_CATALOG, page.emptyProfile(), null, null, null,
    { name: "HackerTube", model_key: "absent", provider: "stub" },
  );
  try {
    openSearchPanel(ui);
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-provider-note"), null);
  } finally {
    ui.restore();
  }
});

test("JOB04 the rendered job cost is unknown, never zero", () => {
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: defaultSearchResult() });
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    const cost = ui.text((node) => node.props && node.props.id === "hackertube-job-cost");
    assert.equal(cost, page.SEARCH_COST_UNKNOWN);
    assert.match(cost, /unknown/);
    assert.doesNotMatch(cost, /\$|zero/);
    const limits = ui.text((node) => node.props && node.props.id === "hackertube-job-limits");
    assert.match(limits, /at most 2 provider requests, 12 results, a 5 second work budget/);
    assert.match(limits, /Provider requests used: 1\./);
  } finally {
    ui.restore();
  }
});

test("JOB04 a provider-reported cost is rendered as a value", () => {
  const ui = mountPage(
    SAMPLE_CATALOG, page.emptyProfile(), null, null,
    { value: searchResult({}, { usage: { cost_usd: 0.02, cost_known: true, requests_used: 1, paid_calls: 1 } }) },
  );
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    const cost = ui.text((node) => node.props && node.props.id === "hackertube-job-cost");
    assert.equal(cost, "Cost: $0.0200 reported by the provider.");
  } finally {
    ui.restore();
  }
});

test("JOB04 a non-numeric cost is rendered as unknown, never zero", () => {
  const ui = mountPage(
    SAMPLE_CATALOG, page.emptyProfile(), null, null,
    { value: searchResult({}, { usage: { cost_usd: "0.02", cost_known: true, requests_used: 1, paid_calls: 1 } }) },
  );
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    const cost = ui.text((node) => node.props && node.props.id === "hackertube-job-cost");
    assert.equal(cost, page.SEARCH_COST_UNKNOWN);
    assert.doesNotMatch(cost, /\$0\.0000/);
  } finally {
    ui.restore();
  }
});

test("skipped source codes render as one plain-language sentence", () => {
  const result = searchResult({}, {
    coverage: {
      verified: 0,
      notes: ["podcastindex: missing_api_key", "reddit: approval_absent", "hn: source request failed"],
    },
  });
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: result });
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    const note = ui.text((node) => node.props && node.props.id === "hackertube-coverage-notes");
    assert.equal(
      note,
      "Not searched: Podcast Index (needs its own API key), Reddit (not approved). Failed: Hacker News (request failed).",
    );
    assert.doesNotMatch(note, /podcastindex|missing_api_key|approval_absent|reddit:/);
  } finally {
    ui.restore();
  }
});

test("JOB03 a partial job labels incomplete coverage and keeps its results", () => {
  const partial = searchResult(
    { books: { label: "books", verified: [verifiedResult("b1")], verified_count: 1, insufficient_evidence: false } },
    {
      job: { job_id: "job:2", state: "partial", limits: { max_hits: 12, max_requests: 2, deadline_seconds: 5 } },
      coverage: { verified: 1, notes: ["Stopped at the 2-request work limit. Coverage is incomplete."] },
    },
  );
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: partial });
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    const status = ui.text((node) => node.props && node.props.id === "hackertube-job-status");
    assert.match(status, /State: partial\./);
    const results = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(results, /Stopped at the 2-request work limit\. Coverage is incomplete\./);
    assert.match(results, /Source: Open Library/);
  } finally {
    ui.restore();
  }
});

test("SEARCH04 an unverified constraint is labeled on the result", () => {
  const limited = searchResult(
    {
      books: {
        label: "books",
        verified: [
          verifiedResult("b1", {
            constraint: "unverified",
            constraint_note: "Unverified against the 30 minutes limit. This record has no duration.",
            strict: false,
          }),
        ],
        verified_count: 1,
        insufficient_evidence: false,
      },
    },
    { interpretation: { topic: "jane austen", terms: ["jane", "austen"], formats: ["book"], max_duration_seconds: 1800 } },
  );
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: limited });
  try {
    submitSearch(ui, "What can I read by Jane Austen under 30 minutes?");
    const results = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(results, /Unverified against the 30 minutes limit\. This record has no duration\./);
    const constraint = ui.text((node) => node.props && node.props.className === "ht-constraints");
    assert.match(constraint, /items longer than 30 minutes are excluded/);
    assert.match(constraint, /Unknown duration is labeled unverified/);
  } finally {
    ui.restore();
  }
});

test("SEARCH05 a broader-web result is labeled and claims no endorsement", () => {
  const web = searchResult({
    books: {
      label: "books",
      verified: [
        verifiedResult("b1", {
          source: {
            source_id: "example",
            source_name: "Example Blog",
            kind: "web",
            label: "Web: Example Blog",
            community_endorsement: false,
          },
        }),
      ],
      verified_count: 1,
      insufficient_evidence: false,
    },
  });
  const ui = mountPage(SOURCE_ONLY_CATALOG, page.emptyProfile(), null, null, { value: web });
  try {
    submitSearch(ui, "What can I read about Jane Austen?");
    const results = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(results, /Source: Web: Example Blog/);
    assert.match(results, /Broader-web result\. It carries its source label and no community endorsement\./);
    // This catalog carries no community endorsement for the item at all.
    assert.doesNotMatch(results, /Recommended in Hacker News/);
    assert.match(results, /Source candidate/);
  } finally {
    ui.restore();
  }
});

test("SEARCH07 an unfilled format reports insufficient evidence", () => {
  const groups = searchResult({
    books: { label: "books", verified: [verifiedResult("b1")], verified_count: 1, insufficient_evidence: false },
    audiobooks: {
      label: "audiobooks",
      verified: [],
      verified_count: 0,
      insufficient_evidence: true,
      note: "No verified audiobooks match for this question.",
    },
  });
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: groups });
  try {
    submitSearch(ui, "What can I read or listen to by Jane Austen?");
    const audio = ui.text((node) => node.props && node.props.id === "hackertube-result-audiobooks");
    assert.match(audio, /Audiobooks · 0 verified/);
    assert.match(audio, /No verified audiobooks match for this question\./);
    const books = ui.text((node) => node.props && node.props.id === "hackertube-result-books");
    assert.match(books, /Books · 1 verified/);
    assert.match(books, /Emma/);
  } finally {
    ui.restore();
  }
});

test("SEARCH08 a previously saved result shows its recorded state", () => {
  const saved = searchResult({
    books: {
      label: "books",
      verified: [
        verifiedResult("b1", {
          state: { saved: true, dismissed: false, completed: false, opens: 1, label: "Saved" },
        }),
      ],
      verified_count: 1,
      insufficient_evidence: false,
    },
  });
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: saved });
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    const results = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(results, /In your library: Saved\./);
  } finally {
    ui.restore();
  }
});

test("a refused search renders the route's clear message", () => {
  const cases = [
    [
      { error: "provider_unavailable", message: "The declared model key is not set, so the live search provider was not called and no request was sent." },
      /model key is not set/,
    ],
    [
      { error: "disclosure_required", message: "The credit-use disclosure must be accepted before a Search starts." },
      /disclosure must be accepted/,
    ],
    [{ error: "question" }, /up to 200 characters/],
  ];
  for (const [body, expected] of cases) {
    const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: body });
    try {
      submitSearch(ui, "What can I read by Jane Austen?");
      const results = ui.text((node) => node.props && node.props.className === "ht-results");
      assert.match(results, expected, body.error);
      assert.doesNotMatch(results, /Cost:|\$0/);
    } finally {
      ui.restore();
    }
  }
});

test("a rejected search request renders the message and no job", () => {
  const failure = new Error("The Hermes service answered with an unexpected error (503).");
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { error: failure });
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    const results = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(results, /unexpected error \(503\)/);
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-job-cost"), null);
  } finally {
    ui.restore();
  }
});

// Regression: "Back to discovery" used to clear only `submitted`, so a finished
// search left the results panel on screen with an empty Question line.
test("Back to discovery closes a completed Search and keeps the typed question", async () => {
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: defaultSearchResult() });
  try {
    submitSearch(ui, "  What can I read by Jane Austen?  ");
    const asked = "  What can I read by Jane Austen?  ";
    assert.ok(
      ui.find((node) => node.props && node.props.className === "ht-results"),
      "the results panel renders after the search completes",
    );
    const back = ui.find((node) => (node.children || []).some((child) => child === "Back to discovery"));
    back.props.onClick();
    assert.equal(
      ui.find((node) => node.props && node.props.className === "ht-results"),
      null,
      "the results are gone after Back",
    );
    const input = ui.find((node) => node.props && node.props.id === "hackertube-question");
    assert.equal(input.props.value, asked, "the typed question stays in the input");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      ui.focused.current && ui.focused.current.props.id,
      "hackertube-question",
      "Back returns focus to the search input",
    );
  } finally {
    ui.restore();
  }
});

test("Back to discovery closes a failed Search", async () => {
  const failure = new Error("The Hermes service answered with an unexpected error (503).");
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { error: failure });
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    const results = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(results, /unexpected error \(503\)/, "the error path is shown before Back");
    const back = ui.find((node) => (node.children || []).some((child) => child === "Back to discovery"));
    back.props.onClick();
    assert.equal(
      ui.find((node) => node.props && node.props.className === "ht-results"),
      null,
      "the failed-results panel is gone after Back",
    );
    const input = ui.find((node) => node.props && node.props.id === "hackertube-question");
    assert.equal(input.props.value, "What can I read by Jane Austen?");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      ui.focused.current && ui.focused.current.props.id,
      "hackertube-question",
      "Back returns focus to the search input after a failure",
    );
  } finally {
    ui.restore();
  }
});

// Regression: pressing Back while a Search was running cleared the busy status,
// which re-armed the submit guard and allowed a second paid request.
test("Back to discovery is disabled and inert while a Search is running", () => {
  const defer = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, defer);
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    assert.equal(defer.pending.length, 1, "one Search request is in flight");
    const back = ui.find((node) => (node.children || []).some((child) => child === "Back to discovery"));
    assert.ok(back, "the Back control renders while the Search runs");
    assert.equal(back.props.disabled, true, "Back carries the disabled attribute while the Search runs");
    assert.equal(back.props["aria-disabled"], "true", "Back is announced as disabled while the Search runs");
    back.props.onClick();
    const results = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(results, /Search running\./, "Back did not reset the running Search");
    assert.equal(defer.pending.length, 1, "Back dispatched no new request");
  } finally {
    ui.restore();
  }
});

test("a second submit after Back while a Search is running sends no second POST", () => {
  const defer = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, defer);
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    assert.equal(defer.pending.length, 1, "the first Search request is in flight");
    // Back must not clear the busy status: doing so re-arms the submit guard and
    // lets a second paid request start while the first is still in flight.
    const back = ui.find((node) => (node.children || []).some((child) => child === "Back to discovery"));
    back.props.onClick();
    ui.requests.length = 0;
    submitSearch(ui, "What can I read by Jane Austen?");
    const posted = ui.requests.filter((row) => row.url.indexOf("/search") !== -1);
    assert.equal(posted.length, 0, "no second Search POST while the first is in flight");
    assert.equal(defer.pending.length, 1, "the first request is still the only one in flight");
  } finally {
    ui.restore();
  }
});

// The UI guards stop a user from reaching two in-flight requests, so this test
// drives both requests directly to exercise the sequence guard on its own: a
// response from an older request must not overwrite a newer one.
test("a stale Search response does not overwrite a newer Search's result", () => {
  const defer = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, defer);
  try {
    openSearchPanel(ui);
    const input = ui.find((node) => node.props && node.props.id === "hackertube-question");
    input.props.onChange({ target: { value: "What can I read by Jane Austen?" } });
    const box = ui.find((node) => node.props && node.props.id === "hackertube-disclosure-ack");
    box.props.onChange({ target: { checked: true } });
    const form = ui.find((node) => node.type === "form" && node.props.id === "hackertube-search-panel");
    form.props.onSubmit({ preventDefault() {} });
    form.props.onSubmit({ preventDefault() {} });
    assert.equal(defer.pending.length, 2, "two Search requests are in flight");

    const feedReads = () => ui.requests.filter(row => row.url.endsWith("/feed")).length;
    const originalReads = feedReads();
    defer.pending[0].onOk(Object.assign(defaultSearchResult(), { provider: "stale-provider" }));
    assert.equal(feedReads(), originalReads, "stale completion does not refresh the feed");
    const afterStale = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.doesNotMatch(afterStale, /stale-provider/, "the stale response is ignored");
    assert.match(afterStale, /Search running\./, "the newer Search is still running");

    defer.pending[1].onOk(Object.assign(defaultSearchResult(), { provider: "fresh-provider" }));
    const afterFresh = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(afterFresh, /fresh-provider/, "the newest response renders");
    assert.equal(feedReads(), originalReads + 1, "only the current Search refreshes the feed");
    assert.doesNotMatch(afterFresh, /stale-provider/, "the stale response never renders");
  } finally {
    ui.restore();
  }
});

// The catch on the Search POST returns immediately when a newer Search owns
// the epoch. The assertion on request count is what fails if that return is
// deleted: later epoch checks still ignore the body, but the follow-up read
// would already have been sent.
test("a stale Search error does not overwrite a newer Search", () => {
  const defer = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, defer);
  try {
    openSearchPanel(ui);
    const input = ui.find((node) => node.props && node.props.id === "hackertube-question");
    input.props.onChange({ target: { value: "What can I read by Jane Austen?" } });
    const box = ui.find((node) => node.props && node.props.id === "hackertube-disclosure-ack");
    box.props.onChange({ target: { checked: true } });
    const form = ui.find((node) => node.type === "form" && node.props.id === "hackertube-search-panel");
    form.props.onSubmit({ preventDefault() {} });
    form.props.onSubmit({ preventDefault() {} });
    assert.equal(defer.pending.length, 2, "search A and search B are both in flight");

    const before = ui.text((node) => node.props && node.props.className === "ht-results");
    const requestsBefore = ui.requests.length;
    defer.pending[0].onErr(new Error("stale acknowledgement"));
    const after = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.equal(after, before, "search A's error leaves search B unchanged");
    assert.match(after, /Search running\./);
    assert.doesNotMatch(after, /did not complete|stale acknowledgement/);
    assert.equal(ui.requests.length, requestsBefore, "search A's error returns before any follow-up read");
  } finally {
    ui.restore();
  }
});

// A stub job can fail inside an HTTP 200 body; Back must still close that panel.
test("Back to discovery closes a Search whose stub job failed with HTTP 200", async () => {
  const failed = searchResult({}, {
    job: { job_id: "job:9", state: "failed", limits: { max_hits: 12, max_requests: 2, deadline_seconds: 5 } },
    coverage: { verified: 0, formats_without_match: [], notes: ["The provider reported the job failed."] },
  });
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: failed });
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    const status = ui.text((node) => node.props && node.props.id === "hackertube-job-status");
    assert.match(status, /State: failed\./, "the HTTP 200 body carries a failed job state");
    const back = ui.find((node) => (node.children || []).some((child) => child === "Back to discovery"));
    assert.equal(back.props.disabled, false, "Back is enabled once the failed job has settled");
    back.props.onClick();
    assert.equal(
      ui.find((node) => node.props && node.props.className === "ht-results"),
      null,
      "the failed-job panel is gone after Back",
    );
    const input = ui.find((node) => node.props && node.props.id === "hackertube-question");
    assert.equal(input.props.value, "What can I read by Jane Austen?");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      ui.focused.current && ui.focused.current.props.id,
      "hackertube-question",
      "Back returns focus to the search input after a failed job",
    );
  } finally {
    ui.restore();
  }
});

test("search helpers format a cost, a limit, and a refusal without a score", () => {
  assert.equal(page.formatCost({ cost_known: false, cost_usd: null }), page.SEARCH_COST_UNKNOWN);
  assert.equal(page.formatCost({ cost_known: true, cost_usd: 0 }), "Cost: $0.0000 reported by the provider.");
  assert.equal(page.formatCost({ cost_known: true, cost_usd: "0.02" }), page.SEARCH_COST_UNKNOWN);
  assert.equal(page.formatCost({ cost_known: true, cost_usd: null }), page.SEARCH_COST_UNKNOWN);
  assert.equal(page.formatCost({ cost_known: true, cost_usd: true }), page.SEARCH_COST_UNKNOWN);
  assert.equal(page.formatCost({ cost_known: true }), page.SEARCH_COST_UNKNOWN);
  assert.equal(page.formatCost({}), page.SEARCH_COST_UNKNOWN);
  assert.deepEqual(
    page.plainCoverageNotes(["podcastindex: missing_api_key", "reddit: approval_absent"]),
    ["Not searched: Podcast Index (needs its own API key), Reddit (not approved)."],
  );
  assert.deepEqual(
    page.plainCoverageNotes([
      "Stopped at the 2-request work limit. Coverage is incomplete.",
      "hn: source request failed",
      "itunes: limit",
      "web: host_search_unavailable",
      "ranking: Search ranking failed.",
    ]),
    [
      "Stopped at the 2-request work limit. Coverage is incomplete.",
      "Failed: Hacker News (request failed), Ranking (ranking failed).",
      "Incomplete: Apple Podcasts / Apple Books (reached the work limit).",
      "Not searched: Broader web (host search is unavailable).",
    ],
  );
  assert.deepEqual(
    page.plainCoverageNotes(["Not searched: Podcast Index (needs its own API key), Reddit (not approved)."]),
    ["Not searched: Podcast Index (needs its own API key), Reddit (not approved)."],
  );
  assert.equal(
    page.limitsLine({ max_hits: 12, max_requests: 2, deadline_seconds: 5 }, { requests_used: 2 }),
    "Work limits for this job: at most 2 provider requests, 12 results, a 5 second work budget. Provider requests used: 2.",
  );
  assert.doesNotMatch(
    page.limitsLine({ max_hits: 12, max_requests: 2, deadline_seconds: 5 }, { requests_used: 2 }),
    /Search stops local work at its deadline/,
    "the work-budget note is stated once, in the form",
  );
  assert.equal(
    page.searchStatusLine({ provider: "stub", job: { job_id: "job:27:2366196e", state: "succeeded" } }),
    "Provider: stub. State: succeeded.",
  );
  assert.doesNotMatch(
    page.searchStatusLine({ provider: "stub", job: { job_id: "job:27:2366196e", state: "succeeded" } }),
    /job:27/,
    "the internal job id is not user-facing copy",
  );
  assert.equal(page.constraintLine({ max_duration_seconds: null }), "Time limit: none requested.");
  assert.match(page.constraintLine({ max_duration_seconds: 3600 }), /longer than 1 hour are excluded/);
  assert.equal(page.sectionLabel("audiobooks"), "Audiobooks");
  assert.equal(page.sectionLabel("books"), "Books");
  assert.equal(page.resultWhy({ why: ["Matched the question: jane austen"] }), "Matched the question: jane austen.");
  assert.equal(page.resultWhy({}), "");
  assert.equal(page.searchRefusalMessage({ error: "question" }), "Enter a question of up to 200 characters, with no markup.");
  assert.equal(page.searchRefusalMessage(null), "The Search request did not complete.");
  assert.equal(page.searchRefusalMessage(null, new Error("offline")), "offline");
});

function findWithin(node, pred) {
  let hit = null;
  function walk(current) {
    if (hit || current == null) return;
    if (Array.isArray(current)) {
      current.forEach(walk);
      return;
    }
    if (typeof current !== "object") return;
    if (pred(current)) {
      hit = current;
      return;
    }
    walk(current.children);
  }
  walk(node);
  return hit;
}

test("navigation, status, and alerts stay outside the collapsible controls", () => {
  const ui = mountPage({ catalog: {} });
  try {
    const details = ui.find((node) => node.props && node.props.className === "ht-feed-controls");
    assert.equal(details.type, "details");
    assert.equal(findWithin(details, (node) => node.props && node.props.className === "ht-nav"), null);
    assert.equal(findWithin(details, (node) => node.props && node.props.className === "ht-status"), null);
    assert.equal(findWithin(details, (node) => node.props && node.props.role === "alert"), null);
    assert.equal(ui.find((node) => node.props && node.props["aria-label"] === "HackerTube").type, "nav");
    assert.ok(ui.find((node) => node.props && node.props.className === "ht-status"));
    assert.match(
      ui.text((node) => node.props && node.props.role === "alert"),
      /The catalog did not load/,
    );
    assert.ok(findWithin(details, (node) => node.props && node.props.id === "hackertube-interest"));
  } finally {
    ui.restore();
  }
});

test("the remove control and the controls summary meet the focus and target rules", () => {
  const css = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../hackertube/dashboard/dist/style.css"),
    "utf8",
  );
  const remove = css.slice(css.indexOf(".hackertube .ht-remove-interest {"), css.indexOf(".hackertube .ht-search input"));
  assert.match(remove, /min-height:\s*2\.5rem/);
  assert.doesNotMatch(remove, /min-height:\s*1\.75rem/);
  const summary = css.slice(
    css.indexOf(".hackertube .ht-feed-controls > summary:focus-visible {"),
    css.indexOf(".hackertube .ht-interests {"),
  );
  assert.match(summary, /outline:\s*2px solid var\(--color-ring\)/);
  assert.doesNotMatch(summary, /currentColor/);
});

test("the refreshed page declares the search schema and disclosure copy", () => {
  assert.equal(page.SEARCH_SCHEMA, "hackertube.search/1");
  assert.match(page.DISCLOSURE_ACK, /credits or quota/);
  assert.equal(page.DISCLOSURE_ACK_ALERT, "Confirm the disclosure before searching.");
  assert.match(page.SEARCH_PROVIDER_NOTE, /configured Hermes providers/);
  assert.equal(page.DISCLOSURE, "Configured sources and the broader web may be searched. Model, search, and provider credits or quota may be used. Browsing is free.");
});


test("the search picker lists Hermes providers and saves only the HackerTube model slot", () => {
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, null, {
    "/api/model/auxiliary": { tasks: [{ task: "hackertube_search", provider: "existing", model: "my-model" }] },
    "/api/model/options?explicit_only=true": { providers: [{ slug: "existing", label: "Already configured", models: ["my-model"] }] },
    "/api/model/set": { ok: true },
  });
  try {
    ui.find(node => node.props && node.props["aria-controls"] === "hackertube-search-panel").props.onClick();
    const select = ui.find(node => node.props && node.props.id === "hackertube-search-model");
    assert.ok(select);
    assert.equal(select.props.value, JSON.stringify(["existing", "my-model"]));
    ui.find(node => node.props && node.props.onClick && node.children.includes("Use for search")).props.onClick();
    const write = ui.requests.find(row => row.url === "/api/model/set");
    assert.deepEqual(write.body, { scope: "auxiliary", task: "hackertube_search", provider: "existing", model: "my-model" });
    assert.equal(ui.requests.filter(row => row.url === "/api/plugins/hackertube/search").length, 0);
  } finally { ui.restore(); }
});

test("newly retrieved search items have Save and Open controls", () => {
  const result = defaultSearchResult();
  result.catalog = JSON.parse(JSON.stringify(SAMPLE_CATALOG.catalog));
  const item = { ...result.catalog.items[0], item_id: "ol:new", title: "A newly retrieved book", format: "book", destination: "https://openlibrary.org/works/OL999999W" };
  result.catalog.items.push(item);
  result.results = [{ item_id: item.item_id, title: item.title, format: "book", source: { label: "Open Library" }, state: {}, why: ["Relevant"] }];
  result.sections = { books: { verified: result.results, verified_count: 1 } };
  const responses = {};
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: result }, null, null, responses);
  try {
    // Completion now rereads persisted records: the read route must reflect
    // the catalog the search just wrote, as the real backend does.
    responses["/api/plugins/hackertube/catalog"] = { catalog: result.catalog };
    responses["/api/plugins/hackertube/feed"] = harnessDiscovery({ catalog: result.catalog });
    ui.find(node => node.props && node.props["aria-controls"] === "hackertube-search-panel").props.onClick();
    ui.find(node => node.props && node.props.id === "hackertube-question").props.onChange({ target: { value: "new book" } });
    ui.find(node => node.props && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
    ui.find(node => node.type === "form" && node.props.id === "hackertube-search-panel").props.onSubmit({ preventDefault() {} });
    const article = ui.find(node => node.type === "article" && node.props.key === item.item_id);
    assert.ok(article);
    function descendant(node, predicate) {
      if (Array.isArray(node)) { for (const child of node) { const found = descendant(child, predicate); if (found) return found; } return null; }
      if (!node || typeof node !== "object") return null;
      if (predicate(node)) return node;
      return descendant(node.children, predicate);
    }
    const save = descendant(article, node => node.props && node.props.onClick && node.children.includes("Save"));
    const open = descendant(article, node => node.type === "a" && node.props.href === item.destination);
    assert.ok(save && open);
    save.props.onClick({ preventDefault() {} });
    assert.ok(ui.requests.some(row => row.url.endsWith("/profile/saves") && row.body.item_id === item.item_id));
    open.props.onClick();
    assert.ok(ui.requests.some(row => row.url.endsWith("/profile/opens") && row.body.item_id === item.item_id));
    assert.match(ui.text(node => node.props && node.props.id === "hackertube-results"), /A newly retrieved book/);
  } finally { ui.restore(); }
});

test("source controls save an explicit choice without starting retrieval", () => {
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, null, {
    "/api/plugins/hackertube/sources": { sources: [
      { source_id: "youtube", name: "YouTube", enabled: false, blocked_reason: null },
      { source_id: "reddit", name: "Reddit", enabled: false, blocked_reason: "approval_absent" },
    ] },
  });
  try {
    openSearchPanel(ui);
    const youtube = ui.find(node => node.type === "label" && node.children.includes(" YouTube"));
    const reddit = ui.find(node => node.type === "label" && node.children.includes(" Reddit"));
    assert.equal(youtube.children[0].props.disabled, false);
    assert.equal(reddit.children[0].props.disabled, true);
    youtube.children[0].props.onChange({ target: { checked: true } });
    const write = ui.requests.find(row => row.url === "/api/plugins/hackertube/sources" && row.method === "POST");
    assert.deepEqual(write.body, { source_id: "youtube", enabled: true });
    assert.equal(ui.requests.filter(row => row.url.endsWith("/search") && row.method === "POST").length, 0);
  } finally { ui.restore(); }
});


for (const kind of ["model", "sources"]) {
  test("Search waits for the pending " + kind + " setting write", () => {
    const deferred = { pending: [] };
    const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, null, {
      "/api/plugins/hackertube/sources": { sources: [{ source_id: "youtube", name: "YouTube", enabled: true, blocked_reason: null }] },
    }, deferred);
    try {
      openSearchPanel(ui);
      if (kind === "model") ui.find(node => node.props && node.props.onClick && node.children.includes("Use for search")).props.onClick();
      else ui.find(node => node.type === "label" && node.children.includes(" YouTube")).children[0].props.onChange({ target: { checked: false } });
      assert.equal(deferred.pending.length, 1);
      const submit = () => {
        ui.find(node => node.props && node.props.id === "hackertube-question").props.onChange({ target: { value: "gardening books" } });
        ui.find(node => node.props && node.props.id === "hackertube-disclosure-ack").props.onChange({ target: { checked: true } });
        ui.find(node => node.type === "form" && node.props.id === "hackertube-search-panel").props.onSubmit({ preventDefault() {} });
      };
      submit();
      assert.equal(ui.requests.filter(row => row.url.endsWith("/search") && row.method === "POST").length, 0);
      deferred.pending[0].onOk(kind === "model" ? { ok: true } : { sources: [] });
      submit();
      assert.equal(ui.requests.filter(row => row.url.endsWith("/search") && row.method === "POST").length, 1);
    } finally { ui.restore(); }
  });
}

test("an expired saved item's state remains visible without cached metadata", () => {
  const ui = mountPage({ catalog: { ...SAMPLE_CATALOG.catalog, items: [] } }, {
    schema: "hackertube.profile/1", interests: [], items: [
      { item_id: "youtube:LCEmiRjPEtQ", saved: true, saved_order: 1, dismissed: false, completed: false, opens: [] },
    ],
  });
  try {
    ui.location.hash = "#library";
    ui.listeners.hashchange.forEach(fn => fn());
    assert.match(ui.text(node => node.props && node.props.className === "ht-missing-saved"), /Saved YouTube video/);
    assert.match(ui.text(node => node.props && node.props.className === "ht-missing-saved"), /metadata unavailable/i);
    assert.equal(ui.requests.filter(row => row.method === "POST").length, 0);
  } finally { ui.restore(); }
});

for (const kind of ["model", "sources"]) {
  test("failed " + kind + " setting writes block Search until a successful retry", () => {
    const deferred = { pending: [] };
    const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, null, {
      "/api/plugins/hackertube/sources": { sources: [{ source_id: "youtube", name: "YouTube", enabled: true, blocked_reason: null }] },
    }, deferred);
    try {
      openSearchPanel(ui);
      const write = () => {
        if (kind === "model") ui.find(node => node.props && node.props.onClick && node.children.includes("Use for search")).props.onClick();
        else ui.find(node => node.type === "label" && node.children.includes(" YouTube")).children[0].props.onChange({ target: { checked: false } });
      };
      const submit = () => {
        ui.find(node => node.props && node.props.id === "hackertube-question").props.onChange({ target: { value: "gardening books" } });
        ui.find(node => node.props && node.props.id === "hackertube-disclosure-ack").props.onChange({ target: { checked: true } });
        ui.find(node => node.type === "form" && node.props.id === "hackertube-search-panel").props.onSubmit({ preventDefault() {} });
      };
      write();
      deferred.pending[0].onErr(new Error("save failed"));
      submit();
      assert.equal(ui.requests.filter(row => row.url.endsWith("/search") && row.method === "POST").length, 0);
      write();
      deferred.pending[1].onOk(kind === "model" ? { ok: true } : { sources: [] });
      submit();
      assert.equal(ui.requests.filter(row => row.url.endsWith("/search") && row.method === "POST").length, 1);
    } finally { ui.restore(); }
  });
}

test("search shows the retrieval subject separately and labels inferred relevance", () => {
  const row = verifiedResult("b1", { why: ["Direct introduction."], relevance: "model_inferred" });
  const outcome = searchResult(
    { books: { verified: [row], verified_count: 1, insufficient_evidence: false } },
    { interpretation: { topic: "AI for beginners without daily news", retrieval_query: "artificial intelligence", depth: "beginner" } },
  );
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: outcome });
  try {
    submitSearch(ui, "AI introductions, no daily news");
    const text = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(text, /Topic: artificial intelligence/);
    assert.match(text, /Level: beginner/);
    assert.match(text, /Model relevance: Direct introduction/);
    assert.match(text, /Source: Open Library/);
  } finally {
    ui.restore();
  }
});

test("beginner search does not claim that no relevance constraints were applied", () => {
  const outcome = searchResult({}, {
    interpretation: { topic: "AI introductions without daily news", retrieval_query: "artificial intelligence", depth: "beginner", max_duration_seconds: null },
  });
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, { value: outcome });
  try {
    submitSearch(ui, "AI introductions for beginners, no daily news");
    const text = ui.text((node) => node.props && node.props.className === "ht-results");
    assert.match(text, /Level: beginner/);
    assert.doesNotMatch(text, /Constraints: none applied/);
    assert.match(text, /Time limit: none requested/);
  } finally {
    ui.restore();
  }
});

test("Hermes search explains the work-budget limitation before dispatch", () => {
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, { provider: "hermes" });
  try {
    openSearchPanel(ui);
    const note = ui.text((node) => node.props && node.props.id === "hackertube-budget-note");
    assert.match(note, /stops local work at its deadline/);
    assert.match(note, /Cancel search stops it early/);
    for (const node of [
      ui.find((node) => node.props && node.props.id === "hackertube-question"),
      ui.find((node) => node.props && node.props.type === "submit" && (node.children || []).includes("Search")),
    ]) {
      assert.match(node.props["aria-describedby"], /hackertube-budget-note/);
    }
    assert.equal(ui.requests.filter((r) => r.init && r.init.method === "POST" && r.url.includes("/search")).length, 0);
  } finally {
    ui.restore();
  }
});

test("Hermes work-budget limitation remains visible while the provider has not returned", () => {
  const deferred = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, { provider: "hermes" }, deferred);
  try {
    submitSearch(ui, "AI books for beginners");
    assert.equal(deferred.pending.length, 1);
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-job-limits"), null);
    const note = ui.text((node) => node.props && node.props.id === "hackertube-budget-note");
    assert.match(note, /stops local work at its deadline/);
    assert.match(note, /Cancel search stops it early/);
  } finally {
    ui.restore();
  }
});

test("the offline stub does not show a Hermes in-flight budget note", () => {
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, { provider: "stub" });
  try {
    openSearchPanel(ui);
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-budget-note"), null);
    assert.equal(ui.find((node) => node.props && node.props.id === "hackertube-question").props["aria-describedby"], "hackertube-disclosure");
  } finally {
    ui.restore();
  }
});

test("pending Search cannot hide the Hermes limitation by closing the panel", () => {
  const deferred = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, { provider: "hermes" }, deferred);
  try {
    submitSearch(ui, "AI books for beginners");
    ui.find((node) => (node.children || []).includes("Close search")).props.onClick();
    assert.notEqual(ui.find((node) => node.props && node.props.id === "hackertube-search-panel"), null);
    assert.equal(deferred.pending.length, 1);
    const note = ui.text((node) => node.props && node.props.id === "hackertube-budget-note");
    assert.match(note, /stops local work at its deadline/);
    assert.match(note, /Cancel search stops it early/);
  } finally {
    ui.restore();
  }
});

test("Cancel search can be queued before the supervised job id arrives", () => {
  const deferred = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred);
  try {
    submitSearch(ui, "AI books");
    const cancel = ui.find((node) => (node.children || []).includes("Cancel search"));
    assert.ok(cancel, "running search must offer cancellation");
    cancel.props.onClick();
    assert.equal(deferred.pending.length, 1, "no guessed job id is cancelled");
    deferred.pending[0].onOk({ job: { job_id: "job:99", state: "running", limits: { deadline_seconds: 5 } } });
    assert.match(deferred.pending[1].url, /\/search\/jobs\/job%3A99\/cancel$/);
    deferred.pending[1].onOk(searchResult({}, { job: { job_id: "job:99", state: "cancelled" } }));
    assert.match(ui.text((node) => node.props && node.props.id === "hackertube-job-status"), /cancelled/);
  } finally { ui.restore(); }
});

test("a finished Search moves focus to the results heading", () => {
  const deferred = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred);
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    ui.focused.current = null;
    deferred.pending[0].onOk(defaultSearchResult());
    assert.equal(ui.focused.current && ui.focused.current.type, "h2");
    assert.equal(ui.focused.current.children[0], "Search results");
    assert.equal(ui.focused.current.props.tabIndex, -1);
  } finally {
    ui.restore();
  }
});

test("a failed Search moves focus to the error alert", () => {
  const deferred = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred);
  try {
    submitSearch(ui, "What can I read by Jane Austen?");
    ui.focused.current = null;
    deferred.pending[0].onOk({ error: "provider_unavailable", message: "The provider is down." });
    assert.equal(ui.focused.current && ui.focused.current.props.role, "alert");
    assert.equal(ui.focused.current.props.tabIndex, -1);
    assert.match(ui.focused.current.children[0], /The provider is down/);
  } finally {
    ui.restore();
  }
});

test("Stopping search stays focusable and a confirmed cancel focuses the results heading", () => {
  const deferred = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred);
  try {
    submitSearch(ui, "AI books");
    deferred.pending[0].onOk({ job: { job_id: "job:9", state: "running", limits: { deadline_seconds: 5 } } });
    const cancel = ui.find((node) => (node.children || []).includes("Cancel search"));
    cancel.props.onClick();
    const stopping = ui.find((node) => (node.children || []).includes("Stopping search"));
    assert.ok(stopping, "Cancel remains on the page while the search is stopping");
    assert.equal(stopping.props.disabled, undefined, "Stopping search does not use the disabled attribute");
    assert.equal(stopping.props["aria-disabled"], "true");
    ui.focused.current = null;
    deferred.pending[1].onOk(searchResult({}, { job: { job_id: "job:9", state: "cancelled" } }));
    assert.equal(ui.focused.current && ui.focused.current.type, "h2");
    assert.equal(ui.focused.current.children[0], "Search results");
  } finally {
    ui.restore();
  }
});

test("Cancel search keeps the busy guard until the server confirms termination", () => {
  const deferred = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred);
  try {
    submitSearch(ui, "AI books");
    deferred.pending[0].onOk({ job: { job_id: "job:9", state: "running", limits: { deadline_seconds: 5 } } });
    ui.find((node) => (node.children || []).includes("Cancel search")).props.onClick();
    assert.equal(ui.find((node) => node.props && node.props.type === "submit" && (node.children || []).includes("Searching")).props.disabled, true);
    deferred.pending[1].onOk(searchResult({}, { job: { job_id: "job:9", state: "cancelled" } }));
    assert.equal(ui.find((node) => node.props && node.props.type === "submit" && (node.children || []).includes("Search")).props.disabled, false);
    deferred.pending[0].onOk(searchResult({}, { job: { job_id: "job:9", state: "succeeded" } }));
    assert.match(ui.text((node) => node.props && node.props.id === "hackertube-job-status"), /cancelled/);
  } finally { ui.restore(); }
});

test("a lost start acknowledgement attaches to existing work without another paid start", () => {
  const deferred = { pending: [] };
  const responses = { "/api/plugins/hackertube/search": { job: { job_id: "job:existing", state: "running", question: "Earlier AI question", limits: { deadline_seconds: 5 } } } };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred, responses);
  try {
    submitSearch(ui, "New AI question");
    deferred.pending[0].onErr(new Error("start acknowledgement lost"));
    const cancel = ui.find((node) => (node.children || []).includes("Cancel search"));
    assert.ok(cancel);
    cancel.props.onClick();
    assert.match(deferred.pending[1].url, /\/job%3Aexisting\/cancel$/);
    deferred.pending[1].onOk(searchResult({}, { job: { job_id: "job:existing", state: "cancelled" } }));
    assert.equal(ui.requests.filter((r) => r.url === "/api/plugins/hackertube/search" && r.method === "POST").length, 1);
  } finally { ui.restore(); }
});

for (const state of ["succeeded", "failed", "timed_out", "cancelled"]) {
  test(`FEED11 ${state} Search refreshes catalog and feed once without another search`, () => {
    const deferred = { pending: [] };
    const catalog = JSON.parse(JSON.stringify(RANK_CATALOG));
    const feed = JSON.parse(JSON.stringify(RANKED_FEED));
    feed.feed = [];
    feed.why = {};
    feed.sections.books = group([], ["b1"]);
    const responses = {};
    const ui = mountPage(catalog, page.emptyProfile(), null, feed, null, null, deferred, responses);
    try {
      submitSearch(ui, "Jane Austen books");
      ui.requests.length = 0;
      assert.doesNotMatch(ui.text(n => n.props && n.props.id === "ranked-feed"), /Freshly retrieved Emma/);
      // Simulate the persisted catalog/feed changing while remote work runs.
      const updatedCatalog = JSON.parse(JSON.stringify(RANK_CATALOG));
      updatedCatalog.catalog.items.find(item => item.item_id === "b1").title = "Freshly retrieved Emma";
      responses["/api/plugins/hackertube/catalog"] = updatedCatalog;
      responses["/api/plugins/hackertube/feed"] = JSON.parse(JSON.stringify(RANKED_FEED));
      const body = searchResult({}, { job: { job_id: "job:refresh", state } });
      // Cancellation responses need not include a catalog snapshot.
      deferred.pending[0].onOk(body);
      assert.match(ui.text(n => n.props && n.props.id === "ranked-feed"), /Freshly retrieved Emma/);
      assert.equal(ui.requests.filter(r => r.url.endsWith("/feed")).length, 1);
      assert.equal(ui.requests.filter(r => r.url.endsWith("/catalog")).length, 1);
      assert.equal(ui.requests.filter(r => r.method === "POST").length, 0);
      deferred.pending[0].onOk(body);
      assert.equal(ui.requests.filter(r => r.url.endsWith("/feed")).length, 1, "duplicate terminal responses are ignored");
    } finally { ui.restore(); }
  });
}

test("Apple Books destinations and catalog attribution do not say Apple Podcasts", () => {
  const item = {item_id:"itunes:audiobook:123", format:"audiobook", destination:"https://books.apple.com/us/audiobook/test/id123"};
  const evidence = [{item_id:item.item_id, source_id:"itunes", kind:"catalog", retrieved_at:"2026-11-08T00:00:00Z"}];
  assert.equal(page.destinationLabel(item), "Apple Books");
  assert.equal(page.presentEvidence(item, evidence, [{source_id:"itunes",name:"Apple Podcasts"}]).sourceName, "Apple Books");
});

/* ------------------------------------------------------------------ *
 * Post-merge review follow-ups: findings 5-10 and N1/N2.
 * ------------------------------------------------------------------ */

const YOUTUBE_ITEM = {
  item_id: "youtube:LCEmiRjPEtQ",
  format: "video",
  title: "AI introduction",
  destination: "https://www.youtube.com/watch?v=LCEmiRjPEtQ",
  capture_order: 1,
  contributors: ["A channel"],
  duration_seconds: null,
  art_url: null,
  art_hotlink: false,
};

const YOUTUBE_CATALOG = {
  fixture: true,
  catalog: { items: [YOUTUBE_ITEM], evidence: [], sources: [], editions: [] },
};

const isArticle = (node) => node.type === "article";

test("a YouTube card opens the source from one labelled link and does not repeat the bare source name", () => {
  const ui = mountPage(YOUTUBE_CATALOG);
  try {
    const article = ui.find(isArticle);
    assert.ok(article);
    // The linked official icon is the one source-opening link on this card:
    // the branding guidelines require the logo to link to the content, so no
    // second link to the same destination is rendered.
    const links = ui.within(isArticle, (node) =>
      node.type === "a" && node.props && node.props.href === YOUTUBE_ITEM.destination);
    assert.equal(links.length, 1, "one source-opening link per card");
    assert.equal(links[0].props["aria-label"], "Open “AI introduction” on YouTube");
    const logo = ui.within(isArticle, (node) => node.type === "img");
    assert.equal(logo.length, 1);
    assert.equal(logo[0].props.alt, "YouTube");
    assert.equal(logo[0].props.src.slice(0, 22), "data:image/png;base64,");
    assert.equal(
      ui.within(isArticle, (node) => node.props && /(^|\s)ht-open(\s|$)/.test(node.props.className || "")).length,
      0,
      "no duplicate Open at source control",
    );
    assert.equal(
      ui.within(isArticle, (node) => node.props && node.props.className === "ht-destination").length,
      0,
      "the bare YouTube destination line is not repeated",
    );
    assert.doesNotMatch(textOf(article), /Open at source/);
    assert.match(textOf(article), /YouTube metadata/);
  } finally {
    ui.restore();
  }
});

test("the model picker row wraps at a narrow viewport", () => {
  const css = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../hackertube/dashboard/dist/style.css"),
    "utf8",
  );
  const picker = css.slice(
    css.indexOf(".hackertube .ht-model-picker {"),
    css.indexOf(".hackertube .ht-feed-controls {"),
  );
  assert.match(picker, /flex-wrap:\s*wrap/);
  assert.match(picker, /gap:\s*0\.5rem/);
  assert.match(picker, /max-width:\s*100%/);
});

test("a non-YouTube card keeps its labelled source link and its destination line", () => {
  const ui = mountPage(SAMPLE_CATALOG);
  try {
    const open = ui.within(isArticle, (node) => node.props && /(^|\s)ht-open(\s|$)/.test(node.props.className || ""));
    assert.equal(open.length, 1);
    assert.equal(open[0].props.href, "https://openlibrary.org/works/OL66513W");
    assert.equal(open[0].props["aria-label"], "Open at source: Open Library");
    assert.equal(ui.text((node) => node.props && node.props.className === "ht-destination"), "Open Library");
  } finally {
    ui.restore();
  }
});

test("a finished Search announces the feed update once, after the feed refresh is accepted", () => {
  const deferred = { pending: [] };
  const feed = { hold: false, pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred, null, null, feed);
  try {
    const statusText = () => ui.text((node) => node.props && node.props.className === "ht-status");
    feed.hold = true;
    submitSearch(ui, "What can I read by Jane Austen?");
    deferred.pending[0].onOk(defaultSearchResult());
    assert.equal(feed.pending.length, 1, "the Search re-reads the feed");
    // The feed has not been re-ranked yet: the refresh is what does it, so the
    // notice must not be written while that read is still in flight.
    assert.doesNotMatch(statusText(), /Feed updated from this search/);
    feed.pending.shift().onOk(harnessDiscovery(SAMPLE_CATALOG));
    assert.equal(statusText(), "Feed updated from this search.");
    deferred.pending[0].onOk(defaultSearchResult());
    assert.equal(
      statusText().split("Feed updated from this search.").length - 1,
      1,
      "a duplicate terminal response does not announce again",
    );
  } finally {
    ui.restore();
  }
});

test("two consecutive searches each announce the feed update once", async () => {
  const deferred = { pending: [] };
  const feed = { hold: false, pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred, null, null, feed);
  try {
    const statusText = () => ui.text((node) => node.props && node.props.className === "ht-status");
    feed.hold = true;
    submitSearch(ui, "What can I read by Jane Austen?");
    deferred.pending[0].onOk(defaultSearchResult());
    feed.pending.shift().onOk(harnessDiscovery(SAMPLE_CATALOG));
    assert.equal(statusText(), "Feed updated from this search.");
    submitSearchInPlace(ui, "What can I read by Jane Austen?");
    deferred.pending[1].onOk(defaultSearchResult());
    assert.equal(statusText(), "Feed updated from this search.", "the first Search keeps its notice while the second runs");
    assert.equal(feed.pending.length, 1, "the second Search re-reads the feed");
    feed.pending.shift().onOk(harnessDiscovery(SAMPLE_CATALOG));
    // A polite region ignores a re-set of the text it already holds, so the
    // second distinct Search clears the region and re-sets the sentence on the
    // next task: that fresh change is what a screen reader announces.
    assert.equal(statusText(), "", "the region is cleared before the second announcement");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(statusText(), "Feed updated from this search.", "the second Search announces again");
  } finally {
    ui.restore();
  }
});

test("a failed feed refresh after a Search never announces the success", () => {
  const deferred = { pending: [] };
  const feed = { hold: false, pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred, null, null, feed);
  try {
    const statusText = () => ui.text((node) => node.props && node.props.className === "ht-status");
    feed.hold = true;
    submitSearch(ui, "What can I read by Jane Austen?");
    deferred.pending[0].onOk(defaultSearchResult());
    assert.doesNotMatch(statusText(), /Feed updated from this search/);
    feed.pending.shift().onErr(new Error("feed unavailable"));
    assert.match(statusText(), /could not be read again/);
    assert.doesNotMatch(statusText(), /Feed updated from this search/, "a failed refresh is not a success");
  } finally {
    ui.restore();
  }
});

test("N1 a Search that ends while the controls are collapsed expands them before moving focus", () => {
  const deferred = { pending: [] };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, null, null, deferred);
  try {
    const details = () => ui.find((node) => node.props && node.props.className === "ht-feed-controls");
    submitSearch(ui, "What can I read by Jane Austen?");
    assert.equal(details().props.open, true);
    details().props.onToggle({ currentTarget: { open: false } });
    assert.equal(details().props.open, false, "the user collapsed the controls while the Search ran");
    ui.focused.current = null;
    deferred.pending[0].onOk(defaultSearchResult());
    assert.equal(details().props.open, true, "the collapsed controls expand when the Search ends");
    assert.equal(ui.focused.current && ui.focused.current.type, "h2");
    assert.equal(ui.focused.current.children[0], "Search results");
    assert.equal(ui.focused.current.props.tabIndex, -1);
  } finally {
    ui.restore();
  }
});

test("N2 a Search recovered on page load finishes without moving focus", async () => {
  const outcome = {
    value: {
      job: {
        job_id: "job:7",
        state: "running",
        question: "Earlier AI question",
        limits: { deadline_seconds: 5 },
      },
    },
  };
  const ui = mountPage(SAMPLE_CATALOG, page.emptyProfile(), null, null, outcome, { provider: "hermes" });
  try {
    assert.match(ui.text((node) => node.props && node.props.id === "hackertube-results"), /Search running/);
    // The supervised job reports a terminal state on the next poll.
    outcome.value = Object.assign(defaultSearchResult(), { job: { job_id: "job:7", state: "succeeded" } });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const heading = ui.find((node) => node.type === "h2" && node.children[0] === "Search results");
    assert.ok(heading, "the recovered Search rendered its results");
    assert.match(ui.text((node) => node.props && node.props.id === "hackertube-job-status"), /State: succeeded/);
    assert.notEqual(ui.focused.current, heading, "a recovered Search does not move focus");
    assert.equal(ui.focused.current && ui.focused.current.props.id, "hackertube-question");
  } finally {
    ui.restore();
  }
});
