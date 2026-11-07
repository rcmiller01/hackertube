/* HackerTube dashboard page.
 *
 * Catalog rows come from GET /api/plugins/hackertube/catalog. That route
 * returns the seed hackertube_core loads. This file does not read a local
 * catalog file. Saves, dismissals, opens, and interests are profile
 * records from GET /api/plugins/hackertube/profile. GET /feed is
 * Catalog.feed for the opening feed and Catalog.section for each format.
 * The page does not rank on its own and does not show scores.
 *
 * The Search panel posts the question to POST /api/plugins/hackertube/search
 * once the credit-use disclosure has been accepted. The route returns the
 * bounded job, its verified results, its source labels, its constraint
 * states, and its usage. This file renders those; it does not interpret the
 * question, retrieve candidates, or decide a cost.
 */
(function (factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  var win = typeof window !== "undefined" ? window : null;
  if (win && win.__HERMES_PLUGIN_SDK__ && win.__HERMES_PLUGINS__) {
    win.__HERMES_PLUGINS__.register("hackertube", api.createPage(win.__HERMES_PLUGIN_SDK__));
  }
})(function () {
  "use strict";

  var DEMO_QUESTION = "What can I read or listen to by Jane Austen?";
  var INITIAL_CARDS = 4;
  var SECTIONS = [
    { id: "videos", label: "Videos", formats: ["video"] },
    { id: "podcasts", label: "Podcasts", formats: ["podcast_episode", "podcast_show"] },
    { id: "books", label: "Books", formats: ["book"] },
    { id: "audiobooks", label: "Audiobooks", formats: ["audiobook"] },
  ];
  var FORMAT_LABEL = {
    video: "Video",
    podcast_episode: "Episode",
    podcast_show: "Show",
    book: "Book",
    audiobook: "Audiobook",
  };
  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  var DISCLOSURE = "Configured sources and the broader web may be searched. Model, search, and provider credits or quota may be used. Browsing is free.";
  var DISCLOSURE_ACK = "I understand this Search may use model, search, or provider credits or quota.";
  var DISCLOSURE_ACK_ALERT = "Confirm the disclosure before searching.";
  var SEARCH_LIVE_ABSENT = "Search is unavailable: the live provider has no model key or model endpoint configured, so no request will be sent.";
  var SEARCH_SCHEMA = "hackertube.search/1";
  var SEARCH_COST_UNKNOWN = "Cost: unknown. The provider reported no cost information.";
  var SEARCH_COST_KNOWN_PREFIX = "Cost: $";
  var SEARCH_LIMIT_NOTE = "Work limits for this job:";
  var SEARCH_STATES = { queued: "queued", running: "running", succeeded: "succeeded", partial: "partial", failed: "failed" };
  var ORDER_NOTE = "Seeded catalog, in capture order.";
  var DISCOVERY_SCHEMA = "hackertube.discovery/1";
  var FEED06_NOTE = "No seeded record matches these interests. Coverage is limited to the titles and contributors in this catalog.";
  var FEED07_NOTE = "Nothing here is ranked for you yet. Add an interest to rank the seeded catalog. Refresh prepared catalog reads the saved catalog again and does not start a search.";
  var RANK_NOTE = "Dismissed and completed items stay out of this feed. Opening an item does not change the order. A source candidate is not a community recommendation.";
  var POLICY_NOTE = "Interest match is required. Community evidence, freshness, and variety are the weighted components. The line on each recommendation names only the signals that applied to that item, and it says nothing about endorsement when the record has none. Scores are not shown.";
  var SECTION_NOTE = "Matches are listed first. The group under the not-matched heading is the rest of this catalog for that format. Those items are not recommendations.";
  var SECTION_CATALOG_NOTE = "An item is hidden when its catalog evidence has expired. This list is not a personalized feed.";

  function browseHeading(label) {
    return "More in " + label + ", not matched to your interests";
  }

  function matchPhrase(count) {
    return count + (count === 1 ? " match" : " matches");
  }

  function destinationDecision(value) {
    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, reason: "invalid" };
    }
    var url;
    try {
      url = new URL(value);
    } catch (err) {
      return { ok: false, reason: "invalid" };
    }
    if (url.username || url.password) {
      return { ok: false, reason: "invalid" };
    }
    if (url.protocol !== "https:") {
      return { ok: false, reason: "scheme" };
    }
    var host = String(url.hostname || "").replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
    if (!host) {
      return { ok: false, reason: "invalid" };
    }
    if (isPrivateHost(host)) {
      return { ok: false, reason: "private" };
    }
    return { ok: true, href: url.href };
  }

  function isPrivateHost(host) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      return true;
    }
    if (isPrivateIp(host)) {
      return true;
    }
    if (host.indexOf(":") === -1 && host.indexOf(".") === -1) {
      return true;
    }
    return false;
  }

  function ipv4Parts(host) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
    var parts = host.split(".").map(function (part) { return Number(part); });
    if (parts.some(function (part) { return part > 255; })) return null;
    return parts;
  }

  function isPrivateV4(parts) {
    var a = parts[0];
    var b = parts[1];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  function expandIpv6(host) {
    var body = host;
    var dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(body);
    if (dotted) {
      var quads = ipv4Parts(dotted[2]);
      if (!quads) return null;
      var high = ((quads[0] << 8) | quads[1]).toString(16);
      var low = ((quads[2] << 8) | quads[3]).toString(16);
      body = dotted[1] + high + ":" + low;
    }
    var halves = body.split("::");
    if (halves.length > 2) return null;
    var head = halves[0] === "" ? [] : halves[0].split(":");
    var tail = halves.length === 1 ? [] : (halves[1] === "" ? [] : halves[1].split(":"));
    if (halves.length === 1) {
      if (head.length !== 8) return null;
    } else {
      var missing = 8 - head.length - tail.length;
      if (missing < 1) return null;
      var fill = [];
      for (var i = 0; i < missing; i += 1) fill.push("0");
      head = head.concat(fill, tail);
    }
    if (head.length !== 8) return null;
    var groups = [];
    for (var group = 0; group < 8; group += 1) {
      if (!/^[0-9a-f]{1,4}$/.test(head[group])) return null;
      groups.push(parseInt(head[group], 16));
    }
    return groups;
  }

  function mappedV4(groups) {
    var prefixClear = groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0;
    if (!prefixClear || groups[5] !== 0xffff) return null;
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255];
  }

  function isPrivateIp(host) {
    var v4 = ipv4Parts(host);
    if (v4) return isPrivateV4(v4);
    if (host.indexOf(":") === -1) return false;
    var groups = expandIpv6(host);
    if (!groups) return false;
    var mapped = mappedV4(groups);
    if (mapped) return isPrivateV4(mapped);
    var unspecified = groups.every(function (part) { return part === 0; });
    if (unspecified) return true;
    var loopback = groups.slice(0, 7).every(function (part) { return part === 0; }) && groups[7] === 1;
    if (loopback) return true;
    if (groups[0] >= 0xfc00 && groups[0] <= 0xfdff) return true;
    if (groups[0] >= 0xfe80 && groups[0] <= 0xfebf) return true;
    return false;
  }

  function refusalMessage(decision) {
    if (!decision || decision.ok) return "";
    if (decision.reason === "scheme") {
      return "Open at source was refused. The destination does not use https.";
    }
    if (decision.reason === "private") {
      return "Open at source was refused. The destination is a private-network address.";
    }
    return "Open at source was refused. The destination is not a usable public address.";
  }

  function formatDuration(seconds) {
    if (typeof seconds !== "number" || seconds < 0 || seconds !== Math.floor(seconds)) return null;
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remain = seconds % 60;
    var parts = [];
    if (hours) parts.push(hours + (hours === 1 ? " hour" : " hours"));
    if (minutes) parts.push(minutes + (minutes === 1 ? " minute" : " minutes"));
    if (remain || !parts.length) parts.push(remain + (remain === 1 ? " second" : " seconds"));
    return parts.join(" ");
  }

  function formatRetrieved(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso || ""));
    if (!match) return "retrieved time unknown";
    var month = Number(match[2]);
    var day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return "retrieved time unknown";
    return "retrieved " + MONTHS[month - 1] + " " + day + ", " + match[1] + ", " + match[4] + ":" + match[5] + " UTC";
  }

  function artFallback(item) {
    if (!item) return "Art unavailable";
    if (item.format === "video") return "Video · YouTube";
    if (item.format === "podcast_episode" || item.format === "podcast_show") return "Podcast · show art unavailable";
    if (item.format === "book") return "Book · cover unavailable";
    if (item.format === "audiobook") return "Audiobook · cover unavailable";
    return "Art unavailable";
  }

  function destinationLabel(item) {
    var host = "";
    try {
      host = new URL(item.destination).hostname.toLowerCase();
    } catch (err) {
      host = "";
    }
    if (host === "youtu.be" || host.endsWith(".youtube.com") || host === "youtube.com") return "YouTube";
    if (host === "podcasts.apple.com" || host.endsWith(".podcasts.apple.com")) return "Apple Podcasts";
    if (host === "openlibrary.org" || host.endsWith(".openlibrary.org")) return "Open Library";
    if (host === "librivox.org" || host.endsWith(".librivox.org")) return "LibriVox";
    return "Public source";
  }

  function sourceName(sources, sourceId) {
    var match = (sources || []).filter(function (source) { return source.source_id === sourceId; })[0];
    return match && match.name ? match.name : sourceId;
  }

  function presentEvidence(item, evidence, sources) {
    var rows = (evidence || []).filter(function (row) { return row.item_id === item.item_id; });
    var endorsed = rows.filter(function (row) {
      return row.display_line === "Recommended in Hacker News" &&
        row.endorsement === "established" &&
        row.kind === "community" &&
        row.source_id === "hn";
    })[0];
    if (endorsed) {
      return {
        kind: "endorsement",
        text: endorsed.display_line,
        href: endorsed.destination,
        retrievedAt: endorsed.retrieved_at,
        sourceName: sourceName(sources, endorsed.source_id),
      };
    }
    var criticism = rows.filter(function (row) { return row.endorsement === "criticism"; })[0];
    if (criticism) {
      return {
        kind: "criticism",
        text: "Criticism in " + sourceName(sources, criticism.source_id) + ". This is not a recommendation.",
        href: null,
        retrievedAt: criticism.retrieved_at,
        sourceName: sourceName(sources, criticism.source_id),
      };
    }
    var mention = rows.filter(function (row) { return row.endorsement === "mention"; })[0];
    if (mention) {
      return {
        kind: "mention",
        text: "Mentioned in " + sourceName(sources, mention.source_id) + ". This is not a recommendation.",
        href: null,
        retrievedAt: mention.retrieved_at,
        sourceName: sourceName(sources, mention.source_id),
      };
    }
    var web = rows.filter(function (row) { return row.kind === "web"; })[0];
    if (web) {
      return {
        kind: "web",
        text: "Public web only. This is not a community endorsement.",
        href: null,
        retrievedAt: web.retrieved_at,
        sourceName: sourceName(sources, web.source_id),
      };
    }
    var catalog = rows.filter(function (row) { return row.kind === "catalog"; })[0];
    if (catalog) {
      return {
        kind: "candidate",
        text: "Source candidate",
        href: null,
        retrievedAt: catalog.retrieved_at,
        sourceName: sourceName(sources, catalog.source_id),
      };
    }
    return {
      kind: "unknown",
      text: "Evidence unknown",
      href: null,
      retrievedAt: item.captured_at,
      sourceName: "",
    };
  }

  function creatorLine(item, itemsById) {
    var names = item.contributors && item.contributors.length ? item.contributors.join(", ") : "Contributor unknown";
    if (item.format === "podcast_episode") {
      var show = item.show_id ? itemsById[item.show_id] : null;
      return names + ". Show: " + (show ? show.title : "Show unknown");
    }
    return names;
  }

  function lengthLine(item) {
    if (item.format === "podcast_show") return null;
    if (item.format === "book") return "Length unknown";
    return formatDuration(item.duration_seconds) || "Duration unknown";
  }

  function editionNote(item, editions, itemsById) {
    var link = (editions || []).filter(function (row) {
      return row.book_item_id === item.item_id || row.audio_item_id === item.item_id;
    })[0];
    if (!link) return null;
    var otherId = item.item_id === link.book_item_id ? link.audio_item_id : link.book_item_id;
    var other = itemsById[otherId];
    if (!other) return null;
    var word = other.format === "audiobook" ? "audiobook" : "book";
    return "Linked " + word + " edition: " + other.title;
  }

  function sectionEmpty(label, inLibrary) {
    if (inLibrary) return "No saved " + label.toLowerCase() + ".";
    return "No " + label.toLowerCase() + " in this catalog.";
  }

  function sectionItems(items, section, saved) {
    var chosen = (items || []).filter(function (item) {
      return section.formats.indexOf(item.format) !== -1;
    });
    if (!saved) {
      return chosen.slice().sort(function (a, b) { return a.capture_order - b.capture_order; });
    }
    return chosen.filter(function (item) { return !!saved[item.item_id]; }).sort(function (a, b) {
      return saved[b.item_id].at - saved[a.item_id].at || a.capture_order - b.capture_order;
    });
  }

  function visibleSlice(items, expanded, cap) {
    if (expanded || items.length <= cap) return items;
    return items.slice(0, cap);
  }

  var PROFILE_SCHEMA = "hackertube.profile/1";
  var INTEREST_MAX = 80;

  function emptyProfile() {
    return { schema: PROFILE_SCHEMA, interests: [], items: [] };
  }

  function blankItem(itemId) {
    return {
      item_id: itemId,
      saved: false,
      dismissed: false,
      completed: false,
      saved_order: null,
      opens: [],
    };
  }

  function copyItem(row) {
    return {
      item_id: row.item_id,
      saved: row.saved === true,
      dismissed: row.dismissed === true,
      completed: row.completed === true,
      saved_order: typeof row.saved_order === "number" ? row.saved_order : null,
      opens: (row.opens || []).slice(),
    };
  }

  function profileWithItems(profile, items) {
    return {
      schema: profile.schema || PROFILE_SCHEMA,
      interests: (profile.interests || []).slice(),
      items: items,
    };
  }

  function findItem(profile, itemId) {
    var items = (profile && profile.items) || [];
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].item_id === itemId) return { index: i, row: items[i] };
    }
    return null;
  }

  function nextSavedOrder(items) {
    var order = 0;
    items.forEach(function (row) {
      if (row.saved && row.saved_order > order) order = row.saved_order;
    });
    return order + 1;
  }

  function applySave(profile, itemId) {
    var current = profile || emptyProfile();
    var found = findItem(current, itemId);
    if (found && found.row.saved) return current;
    var items = (current.items || []).map(copyItem);
    var order = nextSavedOrder(items);
    if (found) {
      items[found.index].saved = true;
      items[found.index].saved_order = order;
    } else {
      var created = blankItem(itemId);
      created.saved = true;
      created.saved_order = order;
      items.push(created);
    }
    return profileWithItems(current, items);
  }

  function applyDismiss(profile, itemId) {
    var current = profile || emptyProfile();
    var found = findItem(current, itemId);
    if (found && found.row.dismissed) return current;
    var items = (current.items || []).map(copyItem);
    if (found) {
      items[found.index].dismissed = true;
    } else {
      var created = blankItem(itemId);
      created.dismissed = true;
      items.push(created);
    }
    return profileWithItems(current, items);
  }

  function applyOpen(profile, itemId, openedAt) {
    var current = profile || emptyProfile();
    var items = (current.items || []).map(copyItem);
    var found = findItem(current, itemId);
    var row;
    if (found) {
      row = items[found.index];
    } else {
      row = blankItem(itemId);
      items.push(row);
    }
    row.opens = row.opens.concat([openedAt]);
    return profileWithItems(current, items);
  }

  function codePointLength(text) {
    var count = 0;
    for (var i = 0; i < text.length; i += 1) {
      var unit = text.charCodeAt(i);
      if (unit >= 0xD800 && unit <= 0xDBFF && i + 1 < text.length) {
        var next = text.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) i += 1;
      }
      count += 1;
    }
    return count;
  }

  function cleanInterest(text) {
    if (typeof text !== "string") return "";
    var cleaned = text.trim();
    if (!cleaned || codePointLength(cleaned) > INTEREST_MAX) return "";
    if (/[<>]/.test(cleaned) || /[\u0000-\u001f]/.test(cleaned)) return "";
    return cleaned;
  }

  function addInterest(profile, text) {
    var current = profile || emptyProfile();
    var cleaned = cleanInterest(text);
    if (!cleaned) return current;
    var interests = (current.interests || []).slice();
    if (interests.indexOf(cleaned) !== -1) return current;
    interests.push(cleaned);
    return {
      schema: current.schema || PROFILE_SCHEMA,
      interests: interests,
      items: (current.items || []).map(copyItem),
    };
  }

  function normalizeProfile(body) {
    if (!body || body.schema !== PROFILE_SCHEMA || !Array.isArray(body.interests) || !Array.isArray(body.items)) {
      return null;
    }
    return {
      schema: PROFILE_SCHEMA,
      interests: body.interests.filter(function (text) { return typeof text === "string"; }),
      items: body.items.filter(function (row) {
        return row && typeof row.item_id === "string";
      }).map(copyItem),
    };
  }

  function itemState(profile, itemId) {
    var found = findItem(profile, itemId);
    if (!found) return blankItem(itemId);
    return found.row;
  }

  function savedMap(profile) {
    var map = {};
    ((profile && profile.items) || []).forEach(function (row) {
      if (row.saved) map[row.item_id] = { at: row.saved_order };
    });
    return map;
  }

  function itemsById(items) {
    var map = {};
    (items || []).forEach(function (item) { map[item.item_id] = item; });
    return map;
  }

  function excludedMap(profile) {
    var map = {};
    ((profile && profile.items) || []).forEach(function (row) {
      if (row && (row.dismissed || row.completed)) map[row.item_id] = true;
    });
    return map;
  }

  function itemsInOrder(items, ids) {
    var byId = itemsById(items);
    var rows = [];
    (ids || []).forEach(function (id) {
      if (byId[id] && !rows.some(function (item) { return item.item_id === id; })) rows.push(byId[id]);
    });
    return rows;
  }

  function countLine(items) {
    var counts = { videos: 0, podcasts: 0, books: 0, audiobooks: 0 };
    (items || []).forEach(function (item) {
      SECTIONS.forEach(function (section) {
        if (section.formats.indexOf(item.format) !== -1) counts[section.id] += 1;
      });
    });
    return "Videos " + counts.videos + ", Podcasts " + counts.podcasts + ", Books " + counts.books + ", Audiobooks " + counts.audiobooks + ".";
  }

  function acceptDiscovery(body) {
    if (!body || body.schema !== DISCOVERY_SCHEMA || !Array.isArray(body.feed) || !body.sections) return null;
    if (!body.why || typeof body.why !== "object" || Array.isArray(body.why)) return null;
    var names = ["videos", "podcasts", "books", "audiobooks"];
    for (var i = 0; i < names.length; i += 1) {
      var section = body.sections[names[i]];
      if (!section || !Array.isArray(section.matches) || !Array.isArray(section.browse)) return null;
      if (section.match_count !== section.matches.length || section.browse_count !== section.browse.length) return null;
    }
    return body;
  }

  function hashValue() {
    if (typeof location === "undefined") return "";
    return String(location.hash || "").replace(/^#/, "");
  }

  function viewFromHash(value) {
    if (value === "library" || value === "about" || value === "discover") return value;
    return "discover";
  }

  function unsafeCheckRequested() {
    if (typeof window === "undefined") return false;
    try {
      if (new URLSearchParams(window.location.search).get("ht_unsafe") === "1") return true;
    } catch (err) {
      /* ignore a malformed search string */
    }
    try {
      return window.sessionStorage.getItem("hackertube-unsafe-check") === "1";
    } catch (err) {
      return false;
    }
  }

  function sectionLabel(id) {
    for (var index = 0; index < SECTIONS.length; index += 1) {
      if (SECTIONS[index].id === id) return SECTIONS[index].label;
    }
    return id;
  }

  function searchRefusalMessage(body, error) {
    var message = "";
    if (body && typeof body.message === "string") message = body.message.trim();
    if (!message && error && typeof error.message === "string") message = error.message.trim();
    if (body && body.error === "disclosure_required") {
      return message || "The credit-use disclosure must be accepted before a Search starts.";
    }
    if (body && body.error === "provider_unavailable") return message || SEARCH_LIVE_ABSENT;
    if (body && body.error === "question") {
      return "Enter a question of up to 200 characters, with no markup.";
    }
    return message || "The Search request did not complete.";
  }

  function formatCost(usage) {
    var safe = usage || {};
    if (safe.cost_known !== true) return SEARCH_COST_UNKNOWN;
    var value = typeof safe.cost_usd === "number" ? safe.cost_usd : 0;
    return SEARCH_COST_KNOWN_PREFIX + value.toFixed(4) + " reported by the provider.";
  }

  function limitsLine(limits, usage) {
    var safe = limits || {};
    var requests = safe.max_requests === undefined ? "?" : safe.max_requests;
    var hits = safe.max_hits === undefined ? "?" : safe.max_hits;
    var deadline = safe.deadline_seconds === undefined ? "?" : safe.deadline_seconds;
    var used = usage && typeof usage.requests_used === "number" ? usage.requests_used : 0;
    return SEARCH_LIMIT_NOTE + " at most " + requests + " provider requests, " + hits +
      " results, a " + deadline + " second deadline. Provider requests used: " + used + ".";
  }

  function constraintLine(interpretation) {
    var limit = interpretation && interpretation.max_duration_seconds;
    if (typeof limit !== "number" || limit <= 0) return "Constraints: none applied.";
    return "Constraints: items longer than " + formatDuration(limit) +
      " are excluded. Unknown duration is labeled unverified and left out of strict matches.";
  }

  function searchStatusLine(result) {
    var job = (result && result.job) || {};
    return "Provider: " + ((result && result.provider) || "unknown") +
      ". Job " + (job.job_id || "unrecorded") +
      ". State: " + (SEARCH_STATES[job.state] || job.state || "unknown") + ".";
  }

  function resultWhy(result) {
    var lines = (result && result.why) || [];
    if (!lines.length) return "";
    return lines.join(". ") + ".";
  }

  function createPage(SDK) {
    var React = SDK.React;
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var components = SDK.components || {};
    var Card = components.Card;
    var CardContent = components.CardContent;
    var CardTitle = components.CardTitle;
    var Badge = components.Badge;
    var Button = components.Button;
    var Input = components.Input;
    var Label = components.Label;
    var Separator = components.Separator;

    function HackerTubePage() {
      var catalogState = useState(null);
      var catalog = catalogState[0];
      var setCatalog = catalogState[1];
      var errorState = useState(false);
      var loadError = errorState[0];
      var setLoadError = errorState[1];
      var viewState = useState(viewFromHash(hashValue()));
      var view = viewState[0];
      var setView = viewState[1];
      var openState = useState(false);
      var searchOpen = openState[0];
      var setSearchOpen = openState[1];
      var questionState = useState("");
      var question = questionState[0];
      var setQuestion = questionState[1];
      var submittedState = useState("");
      var submitted = submittedState[0];
      var setSubmitted = submittedState[1];
      var countState = useState(0);
      var submitCount = countState[0];
      var setSubmitCount = countState[1];
      var alertState = useState("");
      var formAlert = alertState[0];
      var setFormAlert = alertState[1];
      var profileState = useState(emptyProfile);
      var profile = profileState[0];
      var setProfile = profileState[1];
      var interestDraftState = useState("");
      var interestDraft = interestDraftState[0];
      var setInterestDraft = interestDraftState[1];
      var profileStatusState = useState("loading");
      var profileStatus = profileStatusState[0];
      var setProfileStatus = profileStatusState[1];
      var preparedState = useState(0);
      var preparedNonce = preparedState[0];
      var setPreparedNonce = preparedState[1];
      var discoveryState = useState(null);
      var discovery = discoveryState[0];
      var setDiscovery = discoveryState[1];
      var discoveryErrorState = useState(false);
      var discoveryError = discoveryErrorState[0];
      var setDiscoveryError = discoveryErrorState[1];
      var artState = useState({});
      var artFailed = artState[0];
      var setArtFailed = artState[1];
      var expandState = useState({});
      var expanded = expandState[0];
      var setExpanded = expandState[1];
      var statusState = useState("");
      var statusMessage = statusState[0];
      var setStatus = statusState[1];
      var headingRef = useRef(null);
      var triggerRef = useRef(null);
      var inputRef = useRef(null);
      var resultsRef = useRef(null);
      var alertRef = useRef(null);
      var pendingSection = useRef("");
      var alertNonceState = useState(0);
      var alertNonce = alertNonceState[0];
      var setAlertNonce = alertNonceState[1];
      var sectionTickState = useState(0);
      var sectionTick = sectionTickState[0];
      var setSectionTick = sectionTickState[1];
      var expandLiveState = useState("");
      var expandLive = expandLiveState[0];
      var setExpandLive = expandLiveState[1];
      var pendingExpand = useRef("");
      var profileRef = useRef(emptyProfile());
      var profileEpoch = useRef(0);
      var seenView = useRef(null);
      var wasOpen = useRef(false);
      var ackState = useState(false);
      var ack = ackState[0];
      var setAck = ackState[1];
      var searchState = useState("idle");
      var searchStatus = searchState[0];
      var setSearchStatus = searchState[1];
      var searchResultState = useState(null);
      var searchResult = searchResultState[0];
      var setSearchResult = searchResultState[1];
      var searchErrorState = useState("");
      var searchError = searchErrorState[0];
      var setSearchError = searchErrorState[1];
      var statusInfoState = useState(null);
      var statusInfo = statusInfoState[0];
      var setStatusInfo = statusInfoState[1];
      var searchBusy = searchStatus === "running";

      useEffect(function () {
        var cancelled = false;
        if (!SDK.fetchJSON) {
          setLoadError(true);
          return function () { cancelled = true; };
        }
        SDK.fetchJSON("/api/plugins/hackertube/catalog").then(function (body) {
          if (cancelled) return;
          if (!body || !body.catalog || !body.catalog.items) {
            if (preparedNonce === 0) setLoadError(true);
            else setStatus("The prepared catalog could not be read again.");
            return;
          }
          setLoadError(false);
          setCatalog(body.catalog);
        }).catch(function () {
          if (cancelled) return;
          if (preparedNonce === 0) setLoadError(true);
          else setStatus("The prepared catalog could not be read again.");
        });
        return function () { cancelled = true; };
      }, [preparedNonce]);

      useEffect(function () {
        var cancelled = false;
        if (!SDK.fetchJSON) {
          setDiscoveryError(true);
          return function () { cancelled = true; };
        }
        SDK.fetchJSON("/api/plugins/hackertube/feed").then(function (body) {
          if (cancelled) return;
          var next = acceptDiscovery(body);
          if (!next) {
            if (preparedNonce === 0) setDiscoveryError(true);
            else setStatus("The prepared feed could not be read again.");
            return;
          }
          setDiscoveryError(false);
          setDiscovery(next);
        }).catch(function () {
          if (cancelled) return;
          if (preparedNonce === 0) setDiscoveryError(true);
          else setStatus("The prepared feed could not be read again.");
        });
        return function () { cancelled = true; };
      }, [preparedNonce]);

      useEffect(function () {
        function onHash() {
          var value = hashValue();
          if (value === "library" || value === "about" || value === "discover") {
            setView(value);
            return;
          }
          if (value === "videos" || value === "podcasts" || value === "books" || value === "audiobooks") {
            pendingSection.current = value;
            setView("discover");
            setSectionTick(function (tick) { return tick + 1; });
          }
        }
        window.addEventListener("hashchange", onHash);
        return function () { window.removeEventListener("hashchange", onHash); };
      }, []);

      useEffect(function () {
        if (seenView.current === null) {
          seenView.current = view;
          return;
        }
        if (seenView.current === view) return;
        seenView.current = view;
        if (headingRef.current) headingRef.current.focus();
      }, [view]);

      useEffect(function () {
        if (searchOpen && !wasOpen.current && inputRef.current) inputRef.current.focus();
        wasOpen.current = searchOpen;
      }, [searchOpen]);

      useEffect(function () {
        if (submitCount === 0) return;
        if (resultsRef.current) resultsRef.current.focus();
      }, [submitCount]);

      useEffect(function () {
        if (alertNonce === 0) return;
        if (alertRef.current && alertRef.current.focus) alertRef.current.focus();
      }, [alertNonce]);

      useEffect(function () {
        var id = pendingSection.current;
        if (!id || typeof document === "undefined") return;
        var node = document.getElementById(id + "-heading");
        if (!node || !node.focus) return;
        node.focus();
        if (node.scrollIntoView) node.scrollIntoView();
        pendingSection.current = "";
      }, [view, catalog, discovery, sectionTick]);

      useEffect(function () {
        var key = pendingExpand.current;
        if (!key || typeof document === "undefined") return;
        var node = document.getElementById("ht-expanded-" + key);
        if (!node || !node.focus) return;
        node.focus();
        pendingExpand.current = "";
      }, [expanded]);

      useEffect(function () {
        profileRef.current = profile;
      }, [profile]);

      useEffect(function () {
        var cancelled = false;
        var epoch = profileEpoch.current;
        if (!SDK.fetchJSON) {
          setProfileStatus("error");
          return function () { cancelled = true; };
        }
        SDK.fetchJSON("/api/plugins/hackertube/profile").then(function (body) {
          if (cancelled || profileEpoch.current !== epoch) return;
          var next = normalizeProfile(body);
          if (!next) {
            setProfileStatus("error");
            return;
          }
          profileRef.current = next;
          setProfile(next);
          setProfileStatus("ready");
        }).catch(function () {
          if (!cancelled && profileEpoch.current === epoch) setProfileStatus("error");
        });
        return function () { cancelled = true; };
      }, []);

      useEffect(function () {
        var cancelled = false;
        if (!SDK.fetchJSON) return function () { cancelled = true; };
        SDK.fetchJSON("/api/plugins/hackertube/status").then(function (body) {
          if (!cancelled && body && typeof body === "object") setStatusInfo(body);
        }).catch(function () {
          /* the search panel still works; the provider note is the only loss */
        });
        return function () { cancelled = true; };
      }, []);

      function onTrigger() {
        if (searchOpen) {
          if (!searchBusy) setSearchOpen(false);
          return;
        }
        setSearchOpen(true);
      }

      function closeSearch() {
        if (searchBusy) return;
        setSearchOpen(false);
        if (triggerRef.current) triggerRef.current.focus();
      }

      function onSearchKeyDown(event) {
        if (event.key !== "Escape" || searchBusy) return;
        event.preventDefault();
        closeSearch();
      }

      function showFormAlert(message) {
        setFormAlert(message);
        setAlertNonce(function (nonce) { return nonce + 1; });
      }

      function onSubmit(event) {
        event.preventDefault();
        if (searchBusy) return;
        var value = question.trim();
        if (!value) {
          showFormAlert("Enter a question before searching.");
          return;
        }
        if (!ack) {
          showFormAlert(DISCLOSURE_ACK_ALERT);
          return;
        }
        setFormAlert("");
        setSubmitted(value);
        setSearchError("");
        setSearchResult(null);
        setSearchStatus("running");
        setSubmitCount(function (count) { return count + 1; });
        if (!SDK.fetchJSON) {
          setSearchStatus("error");
          setSearchError("This Hermes build cannot send the Search request.");
          return;
        }
        SDK.fetchJSON("/api/plugins/hackertube/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ question: value, disclosure_accepted: true }),
        }).then(function (body) {
          if (!body || body.error) {
            setSearchStatus("error");
            setSearchError(searchRefusalMessage(body));
            return;
          }
          setSearchResult(body);
          setSearchStatus("done");
        }).catch(function (error) {
          setSearchStatus("error");
          setSearchError(searchRefusalMessage(null, error));
        });
      }

      function backToDiscovery() {
        setSubmitted("");
        if (!searchOpen) setSearchOpen(true);
        setTimeout(function () {
          if (inputRef.current) inputRef.current.focus();
        }, 0);
      }

      function postProfile(path, body, revert) {
        var epoch = profileEpoch.current + 1;
        profileEpoch.current = epoch;
        if (!SDK.fetchJSON) {
          setProfileStatus("error");
          return;
        }
        SDK.fetchJSON(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        }).then(function (payload) {
          if (profileEpoch.current !== epoch) return;
          var next = normalizeProfile(payload);
          if (!next) {
            if (revert) {
              profileRef.current = revert;
              setProfile(revert);
            }
            setProfileStatus("error");
            setStatus("The profile did not accept that change.");
            return;
          }
          profileRef.current = next;
          setProfile(next);
          setProfileStatus("ready");
          setPreparedNonce(function (nonce) { return nonce + 1; });
        }).catch(function () {
          if (profileEpoch.current !== epoch) return;
          if (revert) {
            profileRef.current = revert;
            setProfile(revert);
          }
          setStatus("The profile did not accept that change.");
        });
      }

      function onSave(item) {
        var current = profileRef.current;
        var next = applySave(current, item.item_id);
        if (next === current) return;
        profileRef.current = next;
        setProfile(next);
        setStatus("Saved " + item.title + ". Library has " + Object.keys(savedMap(next)).length + " saved.");
        postProfile("/api/plugins/hackertube/profile/saves", { item_id: item.item_id }, current);
      }

      function onDismiss(item) {
        var current = profileRef.current;
        var next = applyDismiss(current, item.item_id);
        if (next === current) return;
        profileRef.current = next;
        setProfile(next);
        setStatus("Dismissed " + item.title + ". It stays out of the discovery feed.");
        postProfile("/api/plugins/hackertube/profile/dismissals", { item_id: item.item_id }, current);
      }

      function onOpen(item) {
        var current = profileRef.current;
        var next = applyOpen(current, item.item_id, "pending");
        profileRef.current = next;
        setProfile(next);
        postProfile("/api/plugins/hackertube/profile/opens", { item_id: item.item_id }, current);
      }

      function onAddInterest(event) {
        event.preventDefault();
        var raw = String(interestDraft || "").trim();
        if (!raw) {
          setStatus("Enter an interest before adding it.");
          return;
        }
        var text = cleanInterest(interestDraft);
        if (!text) {
          setStatus("That interest was not saved. Use up to 80 characters, with no line breaks or angle brackets.");
          return;
        }
        var current = profileRef.current;
        var next = addInterest(current, text);
        if (next === current) {
          setInterestDraft("");
          setStatus("Interest " + text + " is saved.");
          return;
        }
        profileRef.current = next;
        setProfile(next);
        setInterestDraft("");
        setStatus("Saved interest " + text + ".");
        postProfile("/api/plugins/hackertube/profile/interests", { text: text }, current);
      }

      function renderNav(current) {
        var count = Object.keys(savedMap(profile)).length;
        return h("nav", { className: "ht-nav", "aria-label": "HackerTube" },
          h("a", { href: "#discover", "aria-current": current === "discover" ? "page" : undefined }, "Discover"),
          h("a", { href: "#library", "aria-current": current === "library" ? "page" : undefined },
            "Library (" + count + " saved)"
          ),
          h("a", { href: "#about", "aria-current": current === "about" ? "page" : undefined }, "About")
        );
      }

      function renderArt(item) {
        var decision = item.art_url ? destinationDecision(item.art_url) : { ok: false };
        var showImage = !!(item.art_url && item.art_hotlink && decision.ok && !artFailed[item.item_id]);
        if (!showImage) {
          return h("div", { className: "ht-art is-fallback" }, artFallback(item));
        }
        var fit = item.format === "video" ? "ht-cover" : "ht-contain";
        return h("div", { className: "ht-art" },
          h("img", {
            src: decision.href,
            alt: "",
            className: fit,
            onError: function () {
              setArtFailed(function (prev) {
                if (prev[item.item_id]) return prev;
                var next = Object.assign({}, prev);
                next[item.item_id] = true;
                return next;
              });
            },
          })
        );
      }

      function renderEvidence(item, evidence, sources) {
        var presented = presentEvidence(item, evidence, sources);
        var body;
        if (presented.href) {
          var linkDecision = destinationDecision(presented.href);
          if (linkDecision.ok) {
            body = h("a", {
              className: "ht-text-link",
              href: linkDecision.href,
              target: "_blank",
              rel: "noopener noreferrer",
            }, presented.text);
          } else {
            body = presented.text + " " + refusalMessage(linkDecision);
          }
        } else {
          body = presented.text;
        }
        var sourceBit = presented.kind === "candidate" && presented.sourceName
          ? ", " + presented.sourceName
          : "";
        return h("div", { className: "ht-evidence" },
          h("p", null, body, sourceBit),
          h("p", { className: "ht-meta" },
            h("time", { dateTime: presented.retrievedAt || "" }, formatRetrieved(presented.retrievedAt))
          )
        );
      }

      function renderActions(item) {
        var decision = destinationDecision(item.destination);
        var state = itemState(profile, item.item_id);
        var isSaved = state.saved;
        var isDismissed = state.dismissed;
        var openControl = decision.ok
          ? h("a", {
              className: "ht-action ht-open",
              href: decision.href,
              target: "_blank",
              rel: "noopener noreferrer",
              onClick: function () { onOpen(item); },
            }, "Open at source")
          : h("p", { className: "ht-alert", role: "alert" }, refusalMessage(decision));
        var saveButton = h(Button, {
          type: "button",
          className: "ht-action",
          "aria-disabled": isSaved ? "true" : undefined,
          onClick: function (event) {
            if (isSaved) {
              event.preventDefault();
              return;
            }
            onSave(item);
          },
        }, isSaved ? "Saved" : "Save");
        var dismissButton = h(Button, {
          type: "button",
          outlined: true,
          className: "ht-action",
          "aria-disabled": isDismissed ? "true" : undefined,
          onClick: function (event) {
            if (isDismissed) {
              event.preventDefault();
              return;
            }
            onDismiss(item);
          },
        }, isDismissed ? "Dismissed" : "Dismiss");
        return h("div", { className: "ht-actions" }, openControl, saveButton, dismissButton);
      }

      function whyText(lines) {
        if (!lines || !lines.length) return null;
        return h("p", { className: "ht-why" }, lines.join(". ") + ".");
      }

      function renderCard(item, byId, evidence, sources, editions, inLibrary, focusId, whyLines) {
        var note = editionNote(item, editions, byId);
        var length = lengthLine(item);
        var format = FORMAT_LABEL[item.format] || item.format;
        var titleProps = { className: "ht-title" };
        if (focusId) {
          titleProps.id = focusId;
          titleProps.tabIndex = -1;
        }
        var title = focusId || !CardTitle
          ? h("h3", titleProps, item.title)
          : h(CardTitle, titleProps, item.title);
        return h("article", { key: item.item_id },
          h(Card, { className: "ht-card" },
            h(CardContent, null,
              Badge
                ? h(Badge, { tone: "secondary", className: "ht-format" }, format)
                : h("p", { className: "ht-format" }, format),
              title,
              whyText(whyLines),
              h("p", { className: "ht-creator" }, creatorLine(item, byId)),
              renderArt(item),
              h("p", { className: "ht-destination" }, destinationLabel(item)),
              renderEvidence(item, evidence, sources),
              length ? h("p", { className: "ht-length" }, length) : null,
              note ? h("p", { className: "ht-meta" }, note) : null,
              inLibrary
                ? h("p", { className: "ht-meta" }, itemState(profile, item.item_id).opens.length ? "Opened" : "Not opened")
                : null,
              inLibrary
                ? h("p", { className: "ht-meta" }, itemState(profile, item.item_id).completed ? "Completed" : "Not completed")
                : null,
              renderActions(item)
            )
          )
        );
      }

      function reloadPrepared() {
        setPreparedNonce(function (nonce) { return nonce + 1; });
      }

      function openFocusedSearch() {
        setSearchOpen(true);
      }

      function showMore(key, total) {
        return h(Button, {
          type: "button",
          outlined: true,
          className: "ht-action",
          onClick: function () {
            pendingExpand.current = key;
            setExpandLive(total + " of " + total);
            setExpanded(function (prev) {
              var next = Object.assign({}, prev);
              next[key] = true;
              return next;
            });
          },
        }, "Show more");
      }

      function renderSectionBlock(section, rows, byId, inLibrary, empty) {
        var shown = visibleSlice(rows, !!expanded[section.id], INITIAL_CARDS);
        return h("section", { className: "ht-section", id: section.id, key: section.id, "aria-labelledby": section.id + "-heading" },
          h("h2", { id: section.id + "-heading", tabIndex: -1 },
            section.label,
            h("span", { className: "ht-count" }, " " + rows.length)
          ),
          rows.length
            ? h("div", { className: "ht-grid" }, shown.map(function (item, index) {
                var focusId = expanded[section.id] && index === INITIAL_CARDS ? "ht-expanded-" + section.id : "";
                return renderCard(item, byId, catalog.evidence, catalog.sources, catalog.editions, inLibrary, focusId);
              }))
            : h("p", null, empty),
          rows.length > shown.length ? showMore(section.id, rows.length) : null
        );
      }

      function renderSections(inLibrary) {
        var items = catalog && catalog.items ? catalog.items : [];
        var byId = itemsById(items);
        return h("div", null,
          h("p", { className: "ht-note" }, ORDER_NOTE),
          SECTIONS.map(function (section) {
            var rows = sectionItems(items, section, inLibrary ? savedMap(profile) : null);
            return renderSectionBlock(section, rows, byId, inLibrary, sectionEmpty(section.label, inLibrary));
          })
        );
      }

      function visibleDiscoveryRows(ids) {
        var excluded = excludedMap(profile);
        return itemsInOrder(catalog.items, ids).filter(function (item) {
          return !excluded[item.item_id];
        });
      }

      function cardGrid(rows, key, byId, withWhy) {
        var shown = visibleSlice(rows, !!expanded[key], INITIAL_CARDS);
        return h("div", { className: "ht-grid" }, shown.map(function (item, index) {
          var focusId = expanded[key] && index === INITIAL_CARDS ? "ht-expanded-" + key : "";
          var lines = withWhy && discovery.why ? discovery.why[item.item_id] : null;
          return renderCard(item, byId, catalog.evidence, catalog.sources, catalog.editions, false, focusId, lines);
        }));
      }

      function renderRanked(rows) {
        var shown = visibleSlice(rows, !!expanded.ranked, INITIAL_CARDS);
        var byId = itemsById(catalog.items);
        return h("section", { className: "ht-section", id: "ranked-feed", "aria-labelledby": "ranked-heading" },
          h("h2", { id: "ranked-heading", tabIndex: -1 },
            "Ranked feed",
            h("span", { className: "ht-count" }, " " + rows.length)
          ),
          discovery.personalized
            ? rows.length
              ? h("div", null,
                  h("p", { id: "hackertube-ranked-counts" }, countLine(rows)),
                  h("p", { id: "hackertube-signals", className: "ht-note" }, POLICY_NOTE),
                  h("p", { className: "ht-note" }, RANK_NOTE),
                  h("div", { className: "ht-grid" }, shown.map(function (item, index) {
                    var focusId = expanded.ranked && index === INITIAL_CARDS ? "ht-expanded-ranked" : "";
                    var lines = discovery.why ? discovery.why[item.item_id] : null;
                    return renderCard(item, byId, catalog.evidence, catalog.sources, catalog.editions, false, focusId, lines);
                  })),
                  rows.length > shown.length ? showMore("ranked", rows.length) : null
                )
              : h("div", null,
                  h("p", { id: "hackertube-coverage" }, FEED06_NOTE),
                  h(Button, { type: "button", className: "ht-action", onClick: openFocusedSearch }, "Open focused search")
                )
            : h("div", null,
                h("p", { id: "hackertube-feed-note" }, FEED07_NOTE),
                h(Button, { type: "button", className: "ht-action", onClick: reloadPrepared }, "Refresh prepared catalog")
              )
        );
      }

      function renderPersonalizedSection(section, matches, browse, byId) {
        var matchKey = section.id + "-matches";
        var browseKey = section.id + "-browse";
        return h("section", { className: "ht-section", id: section.id, key: section.id, "aria-labelledby": section.id + "-heading" },
          h("h2", { id: section.id + "-heading", tabIndex: -1 },
            section.label,
            h("span", { className: "ht-count", id: section.id + "-match-count" }, " " + matchPhrase(matches.length))
          ),
          matches.length
            ? h("div", { id: matchKey }, cardGrid(matches, matchKey, byId, true))
            : h("p", null, "No " + section.label.toLowerCase() + " match these interests."),
          matches.length > visibleSlice(matches, !!expanded[matchKey], INITIAL_CARDS).length
            ? showMore(matchKey, matches.length)
            : null,
          h("div", { className: "ht-browse", id: browseKey },
            h("h3", { id: section.id + "-browse-heading" },
              browseHeading(section.label),
              h("span", { className: "ht-count" }, " " + browse.length)
            ),
            browse.length
              ? cardGrid(browse, browseKey, byId, false)
              : h("p", null, "Nothing else from this catalog is in this section."),
            browse.length > visibleSlice(browse, !!expanded[browseKey], INITIAL_CARDS).length
              ? showMore(browseKey, browse.length)
              : null
          )
        );
      }

      function renderDiscoverSections() {
        var byId = itemsById(catalog.items);
        var personalized = !!(discovery && discovery.personalized);
        return h("div", null,
          personalized ? null : h("p", { className: "ht-note" }, ORDER_NOTE),
          h("p", { className: "ht-note", id: "hackertube-section-note" }, personalized ? SECTION_NOTE : SECTION_CATALOG_NOTE),
          SECTIONS.map(function (section) {
            var group = discovery.sections && discovery.sections[section.id];
            var matches = visibleDiscoveryRows(group && group.matches);
            var browse = visibleDiscoveryRows(group && group.browse);
            if (!personalized) {
              return renderSectionBlock(section, browse, byId, false, sectionEmpty(section.label, false));
            }
            return renderPersonalizedSection(section, matches, browse, byId);
          })
        );
      }

      function resultItem(itemId) {
        if (!catalog || !catalog.items) return null;
        for (var index = 0; index < catalog.items.length; index += 1) {
          if (catalog.items[index].item_id === itemId) return catalog.items[index];
        }
        return null;
      }

      function resultRow(result) {
        var item = resultItem(result.item_id);
        var byId = catalog ? itemsById(catalog.items) : {};
        var notes = [
          h("p", { className: "ht-result-source", key: "source" },
            "Source: " + (result.source && result.source.label ? result.source.label : "unknown")
          ),
        ];
        if (result.source && result.source.kind === "web") {
          notes.push(h("p", { className: "ht-note", key: "web" },
            "Broader-web result. It carries its source label and no community endorsement."
          ));
        }
        if (result.constraint === "unverified" && result.constraint_note) {
          notes.push(h("p", { className: "ht-note", key: "constraint" }, result.constraint_note));
        }
        if (result.state && result.state.label) {
          notes.push(h("p", { className: "ht-note", key: "state" },
            "In your library: " + result.state.label + "."
          ));
        }
        notes.push(h("p", { className: "ht-why", key: "why" }, resultWhy(result)));
        var body = item
          ? renderCard(item, byId, catalog.evidence, catalog.sources, catalog.editions, false, "", null)
          : h("div", { className: "ht-card" }, h("h4", null, String(result.title || result.item_id)));
        return h("div", { className: "ht-result", key: result.item_id }, body, notes);
      }

      function renderResultSections(result) {
        var groups = (result && result.sections) || {};
        var names = Object.keys(groups);
        if (!names.length) {
          return h("p", { role: "status" }, "No verified candidate was retrieved for this question.");
        }
        return h("div", null, names.map(function (name) {
          var group = groups[name];
          var rows = group.verified || [];
          return h("section", { className: "ht-result-section", key: name, id: "hackertube-result-" + name },
            h("h3", null, sectionLabel(name) + " · " + (group.verified_count || 0) + " verified"),
            group.insufficient_evidence
              ? h("p", { className: "ht-note" }, group.note)
              : h("div", { className: "ht-grid" }, rows.map(resultRow))
          );
        }));
      }

      function renderJob(result) {
        var job = (result && result.job) || {};
        var usage = (result && result.usage) || {};
        var coverage = (result && result.coverage) || {};
        var notes = coverage.notes || [];
        return h("div", { className: "ht-job" },
          h("p", { className: "ht-meta", id: "hackertube-job-status" }, searchStatusLine(result)),
          h("p", { className: "ht-constraints" }, constraintLine(result && result.interpretation)),
          h("p", { className: "ht-cost", id: "hackertube-job-cost" }, formatCost(usage)),
          h("p", { className: "ht-meta", id: "hackertube-job-limits" }, limitsLine(job.limits, usage)),
          notes.length ? h("p", { className: "ht-note", role: "status" }, notes.join(" ")) : null,
          renderResultSections(result)
        );
      }

      function renderSearch() {
        var liveAbsent = !!(statusInfo && statusInfo.provider === "live" && statusInfo.model_key === "absent");
        return h("div", { className: "ht-search" },
          h(Button, {
            type: "button",
            outlined: true,
            className: "ht-action",
            ref: triggerRef,
            "aria-expanded": searchOpen ? "true" : "false",
            "aria-controls": "hackertube-search-panel",
            onClick: onTrigger,
          }, "Focused search"),
          searchOpen
            ? h("form", { id: "hackertube-search-panel", onSubmit: onSubmit, onKeyDown: onSearchKeyDown },
                h(Label, { htmlFor: "hackertube-question" }, "Question"),
                h(Input, {
                  id: "hackertube-question",
                  className: "ht-input",
                  ref: inputRef,
                  type: "text",
                  value: question,
                  placeholder: DEMO_QUESTION,
                  autoComplete: "off",
                  "aria-describedby": "hackertube-disclosure",
                  onChange: function (event) { setQuestion(event.target.value); },
                }),
                h("p", { id: "hackertube-disclosure", className: "ht-disclosure" }, DISCLOSURE),
                h("label", { className: "ht-ack", htmlFor: "hackertube-disclosure-ack" },
                  h("input", {
                    id: "hackertube-disclosure-ack",
                    type: "checkbox",
                    checked: ack,
                    onChange: function (event) { setAck(!!event.target.checked); },
                  }),
                  " " + DISCLOSURE_ACK
                ),
                liveAbsent
                  ? h("p", { id: "hackertube-provider-note", className: "ht-note", role: "status" }, SEARCH_LIVE_ABSENT)
                  : null,
                formAlert
                  ? h("p", { className: "ht-alert", role: "alert", tabIndex: -1, ref: alertRef }, formAlert)
                  : null,
                h("div", { className: "ht-search-actions" },
                  h(Button, {
                    type: "submit",
                    className: "ht-action",
                    "aria-describedby": "hackertube-disclosure",
                  }, searchBusy ? "Searching" : "Search"),
                  h(Button, {
                    type: "button",
                    outlined: true,
                    className: "ht-action",
                    onClick: closeSearch,
                  }, "Close search")
                )
              )
            : null,
          searchBusy || searchError || searchResult
            ? h("div", { className: "ht-results", id: "hackertube-results", "aria-busy": searchBusy ? "true" : "false" },
                h("h2", { tabIndex: -1, ref: resultsRef }, "Search results"),
                h("p", { className: "ht-question" }, "Question: " + submitted),
                searchBusy ? h("p", { role: "status" }, "Search running.") : null,
                searchError ? h("p", { className: "ht-alert", role: "alert" }, searchError) : null,
                searchResult ? renderJob(searchResult) : null,
                h(Button, { type: "button", outlined: true, className: "ht-action", onClick: backToDiscovery }, "Back to discovery")
              )
            : null
        );
      }

      function renderDiscover() {
        return h("div", null,
          h("h1", { id: "discover", tabIndex: -1, ref: headingRef }, "HackerTube"),
          h("p", { className: "ht-lead" }, "Browse videos, podcasts, books, and audiobooks, then open them at their sources."),
          renderNav("discover"),
          h("div", { className: "ht-status", role: "status", "aria-live": "polite" }, statusMessage),
          Separator ? h(Separator, null) : null,
          renderInterests(true),
          renderSearch(),
          h("nav", { className: "ht-sections", "aria-label": "Media sections" },
            SECTIONS.map(function (section) {
              return h("a", { href: "#" + section.id, key: section.id }, section.label);
            })
          ),
          loadError
            ? h("p", { role: "alert" }, "No prepared feed is available. The catalog did not load. Browsing does not start a search.")
            : null,
          !catalog && !loadError ? h("p", { role: "status" }, "Loading the seeded catalog.") : null,
          catalog && discoveryError
            ? h("p", { role: "alert" }, "The prepared feed could not be loaded. Browsing does not start a search.")
            : null,
          catalog && !discovery && !discoveryError
            ? h("p", { role: "status" }, "Loading the prepared feed.")
            : null,
          catalog && discovery ? renderRanked(visibleDiscoveryRows(discovery.feed)) : null,
          catalog && discovery ? renderDiscoverSections() : null,
          unsafeCheckRequested() ? renderUnsafeCheck() : null
        );
      }

      function renderUnsafeCheck() {
        var samples = [
          { item_id: "check:scheme", title: "Scheme check", destination: "javascript:alert(1)" },
          { item_id: "check:private", title: "Private network check", destination: "https://127.0.0.1/private" },
        ];
        return h("section", { className: "ht-section", "aria-labelledby": "unsafe-heading" },
          h("h2", { id: "unsafe-heading" }, "Unsafe destination check"),
          h("p", null, "This check is not part of the seeded feed."),
          samples.map(function (sample) {
            return h("div", { key: sample.item_id },
              h("h3", null, sample.title),
              h("p", { className: "ht-alert", role: "alert" }, refusalMessage(destinationDecision(sample.destination)))
            );
          })
        );
      }

      function renderInterests(editable) {
        var interests = profile.interests || [];
        var list = interests.length
          ? h("ul", { className: "ht-interest-list" }, interests.map(function (text) {
              return h("li", { key: text }, text);
            }))
          : h("p", null, "No interests yet.");
        return h("section", { className: "ht-interests", "aria-labelledby": "interests-heading" },
          h("h2", { id: "interests-heading" }, "Interests"),
          editable
            ? h("form", { onSubmit: onAddInterest },
                h(Label, { htmlFor: "hackertube-interest" }, "Interest"),
                h(Input, {
                  id: "hackertube-interest",
                  className: "ht-input",
                  type: "text",
                  value: interestDraft,
                  autoComplete: "off",
                  "aria-describedby": "hackertube-interest-note",
                  onChange: function (event) { setInterestDraft(event.target.value); },
                }),
                h("p", { id: "hackertube-interest-note", className: "ht-note" },
                  "Interests can be any subject. They are not limited to technology. Up to 80 characters. A word match is required before an item is recommended."
                ),
                h(Button, { type: "submit", className: "ht-action" }, "Add interest")
              )
            : null,
          profileStatus === "error"
            ? h("p", { role: "alert" }, "The library could not be loaded.")
            : null,
          profileStatus === "loading" ? h("p", { role: "status" }, "Loading the library.") : null,
          profileStatus === "ready" ? list : null
        );
      }

      function renderLibrary() {
        var count = Object.keys(savedMap(profile)).length;
        return h("div", null,
          h("h1", { id: "library", tabIndex: -1, ref: headingRef }, "Library"),
          h("p", { className: "ht-lead" }, "Saved items stay in this profile after a refresh or a restart. Saving does not open this view."),
          renderNav("library"),
          h("div", { className: "ht-status", role: "status", "aria-live": "polite" }, statusMessage),
          renderInterests(false),
          profileStatus === "ready" && count === 0
            ? h("p", null, "Nothing is saved yet. ", h("a", { className: "ht-text-link", href: "#discover" }, "Discover"))
            : null,
          catalog ? renderSections(true) : null,
          !catalog && loadError
            ? h("p", { role: "alert" }, "No prepared feed is available. The catalog did not load.")
            : null
        );
      }

      function renderAbout() {
        return h("div", { className: "ht-about" },
          h("h1", { id: "about", tabIndex: -1, ref: headingRef }, "About"),
          h("p", null,
            "Andrej Karpathy created the original HackerTube and inspired this project. Read his ",
            h("a", { className: "ht-text-link", href: "https://karpathy.bearblog.dev/hacker-tube/", target: "_blank", rel: "noopener noreferrer" }, "original HackerTube post"),
            " and visit ",
            h("a", { className: "ht-text-link", href: "https://hackertube.org/", target: "_blank", rel: "noopener noreferrer" }, "hackertube.org"),
            "."
          ),
          h("p", null, "This is an independent Hermes adaptation. It extends the original community-curated discovery idea across several media formats."),
          renderNav("about"),
          h("h2", null, "Sources"),
          h("p", null, "The seeded page shows podcasts from Apple Podcasts, books from Open Library, and audiobooks from LibriVox. Hacker News is evidence on a media card. It is not a fifth format. Reddit is not used."),
          h("p", null, "Book covers load from Open Library only when the catalog marks them as hotlinks. This page does not cache those images. Apple artwork is not loaded."),
          h("h2", null, "Coverage"),
          h("p", null, "The opening feed recommends an item only after a word match in the title or a contributor name. Matching items are ordered with fixed weights for community evidence, freshness, and variety. The line on each recommendation names only the signals that applied to that item. This page does not show scores. Community evidence means an established endorsement on the record. A mention is not an endorsement. This catalog has no established Hacker News endorsement to rank. An item needs catalog evidence that has not passed its refresh time. Dismissed and completed items stay out of the ranked feed and the section lists. Each format section lists matches first. The not-matched group stays in capture order and is not a recommendation. Coverage is the seeded titles and contributors. A subject outside that set has no ranked match. A format can be empty. Unknown duration and unknown length stay unknown. Saves and interests stay in this profile. Opening a source records that open and does not mark the item completed."),
          h("h2", null, "Opening a source"),
          h("p", null, "Open at source leaves this page and opens the public destination in the browser. HackerTube does not download the media and does not play it. A destination that is not public https is refused.")
        );
      }

      if (!Card || !CardContent || !Button || !Input || !Label) {
        return h("p", { role: "alert" }, "This Hermes build is missing dashboard components HackerTube needs.");
      }

      return h("div", { className: "hackertube" },
        h("div", {
          id: "hackertube-expand-live",
          className: "ht-note",
          "aria-live": "polite",
        }, expandLive),
        view === "library" ? renderLibrary() : view === "about" ? renderAbout() : renderDiscover()
      );
    }

    return HackerTubePage;
  }

  return {
    DEMO_QUESTION: DEMO_QUESTION,
    DISCLOSURE: DISCLOSURE,
    DISCLOSURE_ACK: DISCLOSURE_ACK,
    DISCLOSURE_ACK_ALERT: DISCLOSURE_ACK_ALERT,
    SEARCH_LIVE_ABSENT: SEARCH_LIVE_ABSENT,
    SEARCH_SCHEMA: SEARCH_SCHEMA,
    SEARCH_COST_UNKNOWN: SEARCH_COST_UNKNOWN,
    SEARCH_LIMIT_NOTE: SEARCH_LIMIT_NOTE,
    searchRefusalMessage: searchRefusalMessage,
    formatCost: formatCost,
    limitsLine: limitsLine,
    constraintLine: constraintLine,
    searchStatusLine: searchStatusLine,
    sectionLabel: sectionLabel,
    resultWhy: resultWhy,
    ORDER_NOTE: ORDER_NOTE,
    FEED06_NOTE: FEED06_NOTE,
    FEED07_NOTE: FEED07_NOTE,
    RANK_NOTE: RANK_NOTE,
    POLICY_NOTE: POLICY_NOTE,
    SECTION_NOTE: SECTION_NOTE,
    browseHeading: browseHeading,
    matchPhrase: matchPhrase,
    DISCOVERY_SCHEMA: DISCOVERY_SCHEMA,
    sectionEmpty: sectionEmpty,
    INITIAL_CARDS: INITIAL_CARDS,
    SECTIONS: SECTIONS,
    createPage: createPage,
    destinationDecision: destinationDecision,
    refusalMessage: refusalMessage,
    formatDuration: formatDuration,
    formatRetrieved: formatRetrieved,
    artFallback: artFallback,
    presentEvidence: presentEvidence,
    sectionItems: sectionItems,
    visibleSlice: visibleSlice,
    excludedMap: excludedMap,
    itemsInOrder: itemsInOrder,
    countLine: countLine,
    acceptDiscovery: acceptDiscovery,
    applySave: applySave,
    applyDismiss: applyDismiss,
    applyOpen: applyOpen,
    addInterest: addInterest,
    emptyProfile: emptyProfile,
    normalizeProfile: normalizeProfile,
    savedMap: savedMap,
    PROFILE_SCHEMA: PROFILE_SCHEMA,
    creatorLine: creatorLine,
    lengthLine: lengthLine,
    destinationLabel: destinationLabel,
  };
});
