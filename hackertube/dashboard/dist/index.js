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
  var DISCLOSURE = "Search may query your configured sources and the web, and may use model, search, or provider credits or quota. Browsing is free. Search stops at its deadline or when you cancel; a provider may still bill for a request it already accepted.";
  var DISCLOSURE_ACK = "I understand this search may use credits or quota.";
  var DISCLOSURE_ACK_ALERT = "Confirm the disclosure before searching.";
  var SEARCH_PROVIDER_NOTE = "Search uses your configured Hermes providers. Choose a model above or manage HackerTube search in Hermes Models → Auxiliary.";
  var SEARCH_SCHEMA = "hackertube.search/1";
  var SEARCH_COST_UNKNOWN = "Cost: unknown. The provider reported no cost information.";
  var SEARCH_COST_KNOWN_PREFIX = "Cost: $";
  var SEARCH_LIMIT_NOTE = "Work limits for this job:";
  var SEARCH_BUDGET_NOTE = "Search stops local work at its deadline. Cancel search stops it early. A provider may still bill for a request already accepted.";
  var ORDER_NOTE = "Seeded catalog, in capture order.";
  var DISCOVERY_SCHEMA = "hackertube.discovery/1";
  var FEED_UPDATE_NOTICE = "Feed updated from this search.";
  var FEED06_NOTE = "No seeded record matches these interests. Coverage is limited to the titles and contributors in this catalog.";
  var FEED07_NOTE = "Add an interest to rank this catalog for you. Reloading does not start a search.";
  var RANK_NOTE = "Dismissed and completed items stay out of this feed. Opening an item does not change the order. A source candidate is not a community recommendation.";
  var POLICY_NOTE = "Interest match is required. Community evidence, freshness, and variety are the weighted components. The line on each recommendation names only the signals that applied to that item, and it says nothing about endorsement when the record has none. Scores are not shown.";
  var SECTION_NOTE = "Each section lists matches first. Items under “not matched” are not recommendations.";
  var SECTION_CATALOG_NOTE = "This list is not personalized. Items with expired evidence are hidden.";

  function browseHeading(label) {
    return "Other " + label.toLowerCase() + ", not matched";
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

  //: The only hosts that may serve a YouTube thumbnail. The adapter stores an
  //: art_url only from these hosts, but the render path checks again: a stored
  //: record whose URL was edited, or one from an older build, must not become a
  //: third-party image request. Any other host falls back to the linked Icon.
  var YOUTUBE_THUMBNAIL_HOSTS = ["i.ytimg.com", "img.youtube.com"];

  function thumbnailDecision(value) {
    var decision = destinationDecision(value);
    if (!decision.ok) return decision;
    var host = "";
    try {
      host = String(new URL(decision.href).hostname || "")
        .replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
    } catch (err) {
      return { ok: false, reason: "invalid" };
    }
    if (YOUTUBE_THUMBNAIL_HOSTS.indexOf(host) === -1) {
      return { ok: false, reason: "host" };
    }
    return decision;
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
    if (host === "books.apple.com" || host.endsWith(".books.apple.com")) return "Apple Books";
    if (host === "podcasts.apple.com" || host.endsWith(".podcasts.apple.com")) return "Apple Podcasts";
    if (host === "openlibrary.org" || host.endsWith(".openlibrary.org")) return "Open Library";
    if (host === "librivox.org" || host.endsWith(".librivox.org")) return "LibriVox";
    return "Public source";
  }

  // The YouTube Branding Guidelines are an integral part of the YouTube API
  // Terms of Service: any YouTube logo shown in an application must link back
  // to YouTube content. A card that shows the linked official icon therefore
  // already carries its one source-opening link, and no second link to the
  // same destination is rendered (post-merge review finding 6).
  function usesYouTubeBrandLink(item) {
    if (!item || String(item.item_id || "").indexOf("youtube:") !== 0) return false;
    return destinationDecision(item.destination).ok;
  }

  function sourceName(sources, sourceId, item) {
    if (sourceId === "itunes" && item) {
      var store = destinationLabel(item);
      if (store === "Apple Books" || store === "Apple Podcasts") return store;
    }
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
        sourceName: sourceName(sources, endorsed.source_id, item),
      };
    }
    var criticism = rows.filter(function (row) { return row.endorsement === "criticism"; })[0];
    if (criticism) {
      return {
        kind: "criticism",
        text: "Criticism in " + sourceName(sources, criticism.source_id, item) + ". This is not a recommendation.",
        href: null,
        retrievedAt: criticism.retrieved_at,
        sourceName: sourceName(sources, criticism.source_id, item),
      };
    }
    var mention = rows.filter(function (row) { return row.endorsement === "mention"; })[0];
    if (mention) {
      return {
        kind: "mention",
        text: "Mentioned in " + sourceName(sources, mention.source_id, item) + ". This is not a recommendation.",
        href: null,
        retrievedAt: mention.retrieved_at,
        sourceName: sourceName(sources, mention.source_id, item),
      };
    }
    var web = rows.filter(function (row) { return row.kind === "web"; })[0];
    if (web) {
      return {
        kind: "web",
        text: "Public web only. This is not a community endorsement.",
        href: null,
        retrievedAt: web.retrieved_at,
        sourceName: sourceName(sources, web.source_id, item),
      };
    }
    var catalog = rows.filter(function (row) { return row.kind === "catalog"; })[0];
    if (catalog) {
      return {
        kind: "candidate",
        text: "Source candidate",
        href: null,
        retrievedAt: catalog.retrieved_at,
        sourceName: sourceName(sources, catalog.source_id, item),
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
    var names = item.contributors && item.contributors.length ? item.contributors.join(", ") : "";
    if (item.format === "podcast_episode") {
      var show = item.show_id ? itemsById[item.show_id] : null;
      return [names, show && show.title ? "Show: " + show.title : ""].filter(Boolean).join(". ");
    }
    return names;
  }

  function lengthLine(item) {
    if (item.format === "podcast_show") return null;
    if (item.format === "book") return null;
    var seconds = item.duration_seconds;
    if (typeof seconds !== "number" || !isFinite(seconds) || seconds < 0) return "Duration unknown";
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    return hours ? hours + " h" + (minutes ? " " + minutes + " min" : "") : minutes ? minutes + " min" : Math.floor(seconds) + " s";
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
    return SECTIONS.filter(function (section) { return counts[section.id] > 0; }).map(function (section) {
      return section.label + " " + counts[section.id];
    }).join(", ") + (items && items.length ? "." : "");
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
    if (body && body.error === "provider_unavailable") return message || SEARCH_PROVIDER_NOTE;
    if (body && body.error === "question") {
      return "Enter a question of up to 200 characters, with no markup.";
    }
    return message || "The Search request did not complete.";
  }

  var SOURCE_LABELS = {
    podcastindex: "Podcast Index",
    reddit: "Reddit",
    youtube: "YouTube",
    hn: "Hacker News",
    itunes: "Apple Podcasts / Apple Books",
    openlibrary: "Open Library",
    librivox: "LibriVox",
    web: "Broader web",
    ranking: "Ranking",
  };

  // Machine reason or error text to [lead-in, parenthetical phrase].
  var REASON_COPY = {
    missing_api_key: ["Not searched", "needs its own API key"],
    approval_absent: ["Not searched", "not approved"],
    host_search_unavailable: ["Not searched", "host search is unavailable"],
    disabled: ["Not searched", "turned off"],
    not_requested: ["Not searched", "not requested"],
    unavailable: ["Not searched", "unavailable"],
    "source request failed": ["Failed", "request failed"],
    "source retrieval incomplete": ["Incomplete", "retrieval did not finish"],
    limit: ["Incomplete", "reached the work limit"],
    partial: ["Incomplete", "finished only in part"],
    failed: ["Failed", "did not finish"],
    "Search ranking failed.": ["Failed", "ranking failed"],
    "Some invalid ranking entries were ignored; valid matches are retained.": [
      "Incomplete", "some invalid ranking entries were ignored",
    ],
  };

  function sourceLabel(sourceId) {
    if (SOURCE_LABELS[sourceId]) return SOURCE_LABELS[sourceId];
    var text = String(sourceId || "source").replace(/_/g, " ").trim();
    if (!text) return "Source";
    return text.replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
  }

  function plainCoverageNotes(notes) {
    var kept = [];
    var groups = {};
    var order = [];
    (notes || []).forEach(function (note) {
      if (typeof note !== "string") return;
      var match = /^([a-z][a-z0-9_-]*): (.+)$/.exec(note);
      if (!match) {
        kept.push(note);
        return;
      }
      var sourceId = match[1];
      var reason = match[2];
      var machine = /^[a-z0-9_ ]+$/.test(reason) || Object.prototype.hasOwnProperty.call(REASON_COPY, reason);
      if (!SOURCE_LABELS[sourceId] && !machine) {
        kept.push(note);
        return;
      }
      var copy = REASON_COPY[reason];
      var lead = copy ? copy[0] : (/fail/i.test(reason) ? "Failed" : (/^[a-z0-9_]+$/.test(reason) ? "Not searched" : "Incomplete"));
      var phrase = copy ? copy[1] : reason.replace(/_/g, " ").replace(/\.$/, "");
      if (!groups[lead]) {
        order.push(lead);
        groups[lead] = [];
      }
      groups[lead].push(sourceLabel(sourceId) + " (" + phrase + ")");
    });
    order.forEach(function (lead) {
      kept.push(lead + ": " + groups[lead].join(", ") + ".");
    });
    return kept;
  }

  function formatCost(usage) {
    var safe = usage || {};
    var value = safe.cost_usd;
    if (safe.cost_known !== true || typeof value !== "number" || !isFinite(value)) return SEARCH_COST_UNKNOWN;
    return SEARCH_COST_KNOWN_PREFIX + value.toFixed(4) + " reported by the provider.";
  }

  function usageCount(usage) {
    var value = usage && usage.requests_used;
    return typeof value === "number" && isFinite(value) && value >= 0 ? value : null;
  }

  function limitsLine(limits, usage) {
    var safe = limits || {};
    var requests = safe.max_requests === undefined ? "?" : safe.max_requests;
    var hits = safe.max_hits === undefined ? "?" : safe.max_hits;
    var deadline = safe.deadline_seconds === undefined ? "?" : safe.deadline_seconds;
    var used = usageCount(usage);
    if (used === null) used = "unknown";
    // The work-budget note is stated once, in the form (hackertube-budget-note).
    // Repeating it on every limits line duplicated the same sentence.
    return SEARCH_LIMIT_NOTE + " at most " + requests + " provider requests, " + hits +
      " results, a " + deadline + " second work budget. Provider requests used: " + used + ".";
  }

  function constraintLine(interpretation) {
    var limit = interpretation && interpretation.max_duration_seconds;
    if (typeof limit !== "number" || limit <= 0) return "Time limit: none requested.";
    return "Time limit: items longer than " + formatDuration(limit) +
      " are excluded. Unknown duration is labeled unverified and left out of strict matches.";
  }

  function searchStatusLine(result) {
    var job = (result && result.job) || {};
    var usage = (result && result.usage) || {};
    var labels = { queued: "Queued", running: "Searching", succeeded: "Finished",
      partial: "Partially finished", failed: "Failed", cancelled: "Cancelled",
      timed_out: "Timed out", interrupted: "Interrupted" };
    var used = usageCount(usage);
    var requests = used !== null
      ? used + " provider request" + (used === 1 ? "" : "s") : "provider requests unknown";
    var cost = usage.cost_known === true && typeof usage.cost_usd === "number" && isFinite(usage.cost_usd)
      ? "cost $" + usage.cost_usd.toFixed(4) : "cost unknown";
    return (labels[job.state] || "Status unknown") + " · " + requests + " · " + cost;
  }

  function resultWhy(result) {
    var lines = (result && result.why) || [];
    if (!lines.length) return "";
    return lines.join(". ") + ".";
  }

  // Unmodified official attribution asset; source/rights: docs/PROVENANCE.md.
  var YOUTUBE_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABOcAAAQzCAYAAAAozUiIAAAACXBIWXMAABcRAAAXEQHKJvM/AAAgAElEQVR4nOzdT4iUd77v8W+F2LGFsXQoqEMgpO4NyF3kohdrb002Z9neyYULFxwNyTCbSLIw48DROQZmYcxxjjMHDjQaruEwgpDJbQNZxIXd2StRzErIpE8GJAWNWgbsjg70XZSOmvjffur71PO8XiAGNeazCU29+/f8nsby8nIAAAAAAKP3TPYAAAAAAKgrcQ4AAAAAkohzAAAAAJBEnAMAAACAJOIcAAAAACQR5wAAAAAgiTgHAAAAAEnEOQAAAABIIs4BAAAAQBJxDgAAAACSiHMAAAAAkEScAwAAAIAk4hwAAAAAJBHnAAAAACCJOAcAAAAAScQ5AAAAAEgizgEAAABAEnEOAAAAAJKIcwAAAACQRJwDAAAAgCTiHAAAAAAkEecAAAAAIIk4BwAAAABJxDkAAAAASCLOAQAAAEAScQ4AAAAAkohzAAAAAJBEnAMAAACAJOIcAAAAACQR5wAAAAAgiTgHAAAAAEnEOQAAAABIIs4BAAAAQBJxDgAAAACSiHMAAAAAkEScAwAAAIAk4hwAAAAAJBHnAAAAACCJOAcAAAAAScQ5AAAAAEgizgEAAABAEnEOAAAAAJKIcwAAAACQRJwDAAAAgCTiHAAAAAAkEecAAAAAIIk4BwAAAABJxDkAAAAASCLOAQAAAEAScQ4AAAAAkohzAAAAAJBEnAMAAACAJOIcAAAAACQR5wAAAAAgiTgHAAAAAEnEOQAAAABIIs4BAAAAQBJxDgAAAACSiHMAAAAAkEScAwAAAIAk4hwAAAAAJBHnAAAAACCJOAcAAAAAScQ5AAAAAEgizgEAAABAEnEOAAAAAJKIcwAAAACQRJwDAAAAgCTiHAAAAAAkEecAAAAAIIk4BwAAAABJxDkAAAAASCLOAQAAAEAScQ4AAAAAkohzAAAAAJBEnAMAAACAJOIcAAAAACQR5wAAAAAgiTgHAAAAAEnEOQAAAABIIs4BAAAAQBJxDgAAAACSiHMAAAAAkEScAwAAAIAk4hwAAAAAJBHnAAAAACCJOAcAAAAAScQ5AAAAAEgizgEAAABAEnEOAAAAAJKIcwAAAACQRJwDAAAAgCTiHAAAAAAkEecAAAAAIIk4BwAAAABJxDkAAAAASCLOAQAAAEAScQ4AAAAAkohzAAAAAJBEnAMAAACAJOIcAAAAACQR5wAAAAAgiTgHAAAAAEnEOQAAAABIIs4BAAAAQBJxDgAAAACSiHMAAAAAkEScAwAAAIAk4hwAAAAAJBHnAAAAACCJOAcAAAAAScQ5AAAAAEgizgEAAABAEnEOAAAAAJKIcwAAAACQRJwDAAAAgCTiHAAAAAAkEecAAAAAIIk4BwAAAABJxDkAAAAASCLOAQAAAEAScQ4AAAAAkohzAAAAAJBEnAMAAACAJOIcAAAAACQR5wAAAAAgiTgHAAAAAEnEOQAAAABIIs4BAAAAQBJxDgAAAACSiHMAAAAAkEScAwAAAIAk4hwAAAAAJBHnAAAAACCJOAcAAAAAScQ5AAAAAEgizgEAAABAEnEOAAAAAJKIcwAAAACQRJwDAAAAgCTiHAAAAAAkEecAAAAAIIk4BwAAAABJxDkAAAAASCLOAQAAAEAScQ4AAAAAkohzAAAAAJBEnAMAAACAJOIcAAAAACQR5wAAAAAgiTgHAAAAAEnEOQAAAABIIs4BAAAAQBJxDgAAAACSiHMAAAAAkEScAwAAAIAk4hwAAAAAJBHnAAAAACCJOAcAAAAAScQ5AAAAAEgizgEAAABAEnEOAAAAAJKIcwAAAACQRJwDAAAAgCTiHAAAAAAkEecAAAAAIIk4BwAAAABJxDkAAAAASCLOAQAAAEAScQ4AAAAAkohzAAAAAJBEnAMAAACAJOIcAAAAACQR5wAAAAAgiTgHAAAAAEnEOQAAAABIIs4BAAAAQBJxDgAAAACSiHMAAAAAkEScAwAAAIAk4hwAAAAAJBHnAAAAACCJOAcAAAAAScQ5AAAAAEgizgEAAABAEnEOAAAAAJKIcwAAAACQRJwDAAAAgCTiHAAAAAAkEecAAAAAIIk4BwAAAABJxDkAAAAASCLOAQAAAEAScQ4AAAAAkohzAAAAAJBEnAMAAACAJOIcAAAAACQR5wAAAAAgiTgHAAAAAEnEOQAAAABIIs4BAAAAQBJxDgAAAACSiHMAAAAAkEScAwAAAIAk4hwAAAAAJBHnAAAAACCJOAcAAAAAScQ5AAAAAEgizgEAAABAEnEOAAAAAJKIcwAAAACQRJwDAAAAgCTiHAAAAAAkEecAAAAAIIk4BwAAAABJxDkAAAAASCLOAQAAAEAScQ4AAAAA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AAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHixCOvfAAAAMlJREFUHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAECIOAcAAAAAIeIcAAAAAISIcwAAAAAQIs4BAAAAQIg4BwAAAAAh4hwAAAAAhIhzAAAAABAizgEAAABAiDgHAAAAACHiHAAAAACEiHMAAAAAECLOAQAAAEDI/wO2qJ2Kb5OFQQAAAABJRU5ErkJggg==";

  // Re-set a live-region message after its blank state has committed, so a
  // polite region emits a fresh change even when the text repeats. A frame is
  // used where one exists; the unit harness has none and is synchronous.
  var pushNextFrame = typeof requestAnimationFrame === "function"
    ? function (fn) { requestAnimationFrame(fn); }
    : function (fn) { setTimeout(fn, 0); };

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

    function HackerTubePage(props) {
      // The privacy gate passes focusHeading when it mounts this page, so the
      // heading receives focus instead of the gate dropping focus to the body
      // (review finding 5).
      var focusHeadingOnMount = !!(props && props.focusHeading);
      var headingFocusDone = useRef(false);
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
      var controlsState = useState(false);
      var controlsChosen = useRef(false);
      var controlsExpanded = controlsState[0];
      var setControlsExpanded = controlsState[1];
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
      var feedAnnouncement = useState(0);
      var feedAnnouncementNonce = feedAnnouncement[0];
      var requestFeedAnnouncement = feedAnnouncement[1];
      var statusMessage = statusState[0];
      var setStatus = statusState[1];
      var headingRef = useRef(null);
      var triggerRef = useRef(null);
      var inputRef = useRef(null);
      var resultsRef = useRef(null);
      var alertRef = useRef(null);
      var searchAlertRef = useRef(null);
      var interestInputRef = useRef(null);
      var searchEndTarget = useRef("results");
      var searchEndFocus = useRef(true);
      var pendingSection = useRef("");
      var alertNonceState = useState(0);
      var alertNonce = alertNonceState[0];
      var setAlertNonce = alertNonceState[1];
      var searchEndState = useState(0);
      var searchEnd = searchEndState[0];
      var setSearchEnd = searchEndState[1];
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
      var configuration = useRef({ pending: 0, failures: new Set(), epoch: 0 });
      var configurationTick = useState(0);
      var refreshConfiguration = configurationTick[1];
      var settingsSaving = configuration.current.pending > 0;
      var settingsBlocked = settingsSaving || configuration.current.failures.size > 0;
      var sourceRowsState = useState([]);
      var sourceRows = sourceRowsState[0];
      var setSourceRows = sourceRowsState[1];
      var modelOptionsState = useState(null);
      var modelOptions = modelOptionsState[0];
      var setModelOptions = modelOptionsState[1];
      var modelChoiceState = useState("");
      var modelChoice = modelChoiceState[0];
      var setModelChoice = modelChoiceState[1];
      var modelMessageState = useState("");
      var modelMessage = modelMessageState[0];
      var setModelMessage = modelMessageState[1];

      var searchEpoch = useRef(0);
      var activeSearch = useRef(null);
      var feedNoticeRequested = useRef(false);
      var pollTimer = useRef(null);
      var cancelState = useState(false);
      var cancelBusy = cancelState[0];
      var setCancelBusy = cancelState[1];
      var searchBusy = searchStatus === "running";

      useEffect(function () {
        return function () {
          searchEpoch.current += 1;
          if (pollTimer.current) clearTimeout(pollTimer.current);
        };
      }, []);

      useEffect(function () {
        if (!SDK.fetchJSON || !statusInfo || statusInfo.provider !== "hermes") return;
        var gone = false;
        SDK.fetchJSON("/api/plugins/hackertube/search").then(function (body) {
          if (gone || searchEpoch.current !== 0 || !body || !body.job) return;
          var job = body.job;
          if (["running", "queued", "cancelling"].indexOf(job.state) !== -1) {
            // Recovered work: the user did not start it in this session, so it
            // must not move focus when it ends (N2).
            var session = { epoch: ++searchEpoch.current, id: job.job_id, finished: false, cancelRequested: false, cancelSent: false, recovered: true };
            activeSearch.current = session;
            setSubmitted(job.question || "");
            setSearchOpen(true);
            setSearchStatus("running");
            receiveSearch(body, session);
          } else if (job.state === "interrupted") {
            setSubmitted(job.question || "");
            setSearchError("The previous search was interrupted. It will not resume automatically. Start a new Search to try again.");
          }
        }).catch(function () {});
        return function () { gone = true; };
      }, [statusInfo && statusInfo.provider]);

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
        // Consume the claim a terminal Search left here: this read is the one
        // that re-ranks the feed below, so it is the one that may announce
        // (review finding 9). Consuming it up front means a superseded read
        // cannot announce, and two Searches cannot share one announcement.
        var announce = feedNoticeRequested.current;
        feedNoticeRequested.current = false;
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
          if (announce) announceFeedUpdate();
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
        if (!focusHeadingOnMount || headingFocusDone.current) return;
        headingFocusDone.current = true;
        if (headingRef.current && headingRef.current.focus) headingRef.current.focus();
      }, []);

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
        if (searchEnd === 0) return;
        // A search recovered on page load does not move focus: nothing was
        // started in this session (N2).
        if (!searchEndFocus.current) return;
        var node = searchEndTarget.current === "alert" ? searchAlertRef.current : resultsRef.current;
        if (node && node.focus) node.focus();
      }, [searchEnd]);

      useEffect(function () {
        if (!feedAnnouncementNonce || statusMessage !== "") return;
        // This effect only runs after React committed the blank live region.
        // Scheduling here, not beside setStatus(""), prevents automatic batching
        // from swallowing the blank, including when a frame runs before commit.
        var cancelled = false;
        pushNextFrame(function () {
          if (!cancelled) setStatus(FEED_UPDATE_NOTICE);
        });
        return function () { cancelled = true; };
      }, [feedAnnouncementNonce, statusMessage]);

      function announceFeedUpdate() {
        if (statusMessage !== FEED_UPDATE_NOTICE) {
          setStatus(FEED_UPDATE_NOTICE);
          return;
        }
        setStatus("");
        requestFeedAnnouncement(function (nonce) { return nonce + 1; });
      }

      function endSearch(target, focus) {
        // The results heading and the error alert both live inside the
        // collapsible controls, so a panel collapsed while the search ran has
        // to be expanded before the focus move below can reach its target (N1).
        if (focus !== false) setControlsExpanded(true);
        searchEndFocus.current = focus !== false;
        searchEndTarget.current = target;
        setSearchEnd(function (value) { return value + 1; });
      }

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
          if (!controlsChosen.current) setControlsExpanded(next.interests.length === 0);
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

      useEffect(function () {
        var cancelled = false;
        if (!searchOpen || !SDK.fetchJSON) return;
        var epoch = configuration.current.epoch;
        SDK.fetchJSON("/api/model/auxiliary").then(function (assignments) {
          var selected = ((assignments && assignments.tasks) || []).find(function (row) { return row.task === "hackertube_search"; }) || {};
          return SDK.fetchJSON("/api/model/options?explicit_only=true").then(function (body) {
            if (cancelled || !body || !Array.isArray(body.providers) || !acceptConfigurationRead("model", epoch)) return;
            setModelOptions(body);
            setModelChoice(selected.provider && selected.provider !== "auto" && selected.model
              ? JSON.stringify([selected.provider, selected.model]) : "");
          });
        }).catch(function () { if (!cancelled) setModelMessage("Choose HackerTube search in Hermes Models → Auxiliary."); });
        return function () { cancelled = true; };
      }, [searchOpen]);

      useEffect(function () {
        var cancelled = false;
        if (!searchOpen || !SDK.fetchJSON) return;
        var epoch = configuration.current.epoch;
        SDK.fetchJSON("/api/plugins/hackertube/sources").then(function (body) {
          if (!cancelled && body && Array.isArray(body.sources) && acceptConfigurationRead("sources", epoch)) setSourceRows(body.sources);
        }).catch(function () { /* Search still reports source availability. */ });
        return function () { cancelled = true; };
      }, [searchOpen]);

      function acceptConfigurationRead(kind, epoch) {
        var current = configuration.current;
        if (current.pending || current.epoch !== epoch) return false;
        if (current.failures.delete(kind)) refreshConfiguration(function (value) { return value + 1; });
        return true;
      }

      function writeConfiguration(kind, path, body, accept) {
        if (!SDK.fetchJSON || searchBusy || configuration.current.pending) return;
        var current = configuration.current;
        current.pending += 1;
        current.epoch += 1;
        refreshConfiguration(function (value) { return value + 1; });
        var settled = false;
        function finish(ok) {
          if (settled) return;
          settled = true;
          current.pending -= 1;
          current.epoch += 1;
          if (ok) current.failures.delete(kind);
          else current.failures.add(kind);
          refreshConfiguration(function (value) { return value + 1; });
        }
        try {
          SDK.fetchJSON(path, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          }).then(function (payload) { finish(accept(payload)); }).catch(function () {
            setModelMessage("Hermes could not save that change. Retry it or reopen Search to reload the saved settings.");
            finish(false);
          });
        } catch (error) {
          setModelMessage("Hermes could not save that change. Retry it or reopen Search to reload the saved settings.");
          finish(false);
        }
      }

      function changeSource(sourceId, enabled) {
        writeConfiguration("sources", "/api/plugins/hackertube/sources", { source_id: sourceId, enabled: enabled }, function (body) {
          if (body && Array.isArray(body.sources)) { setSourceRows(body.sources); return true; }
          setModelMessage("Hermes could not change that source. Check its setup in plugin settings.");
          return false;
        });
      }

      function applySearchModel() {
        var selected = modelChoice ? JSON.parse(modelChoice) : ["auto", ""];
        var assignment = { scope: "auxiliary", task: "hackertube_search", provider: selected[0], model: selected[1] };
        writeConfiguration("model", "/api/model/set", assignment, function (body) {
          var ok = !!(body && body.ok);
          setModelMessage(ok ? "Search model saved in Hermes."
            : ((body && (body.confirm_message || body.detail)) || "Use Hermes Models → Auxiliary to finish choosing this model."));
          return ok;
        });
      }

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

      function pollSearch(session) {
        if (session.finished || searchEpoch.current !== session.epoch) return;
        if (pollTimer.current) clearTimeout(pollTimer.current);
        pollTimer.current = setTimeout(function () {
          if (session.finished || searchEpoch.current !== session.epoch) return;
          SDK.fetchJSON("/api/plugins/hackertube/search/jobs/" + encodeURIComponent(session.id))
            .then(function (body) { receiveSearch(body, session); })
            .catch(function () {
              if (searchEpoch.current !== session.epoch || session.finished) return;
              if (Date.now() > session.until) {
                session.finished = true;
                setSearchStatus("error");
                setSearchError("Search status is unavailable. Local work still stops at its deadline. Reopen Search to check it.");
                endSearch("alert", !session.recovered);
                return;
              }
              pollSearch(session);
            });
        }, 250);
      }

      function receiveSearch(body, session) {
        if (searchEpoch.current !== session.epoch || session.finished) return;
        var job = body && body.job;
        if (job && ["queued", "running", "cancelling"].indexOf(job.state) !== -1) {
          session.id = job.job_id;
          if (!session.until) session.until = Date.now() + (((job.limits || {}).deadline_seconds || 45) * 1000) + 2000;
          if (job.question) setSubmitted(job.question);
          if (session.cancelRequested && !session.cancelSent) sendCancel(session);
          else pollSearch(session);
          return;
        }
        session.finished = true;
        if (pollTimer.current) clearTimeout(pollTimer.current);
        setCancelBusy(false);
        if (!body || body.error) {
          setSearchStatus("error");
          setSearchError(searchRefusalMessage(body));
          endSearch("alert", !session.recovered);
          return;
        }
        if (body.catalog) setCatalog(body.catalog);
        setSearchResult(body);
        setSearchStatus("done");
        // Search may have persisted new records, even with no final matches or
        // after cancellation. Reread both local catalog and interest rankings.
        // The session/epoch guards above make this once per current Search.
        // The ranked feed below has not changed yet: the /feed reread is what
        // re-ranks it, so that read announces the update when it is accepted
        // (review finding 9).
        feedNoticeRequested.current = true;
        setPreparedNonce(function (nonce) { return nonce + 1; });
        endSearch("results", !session.recovered);
      }

      function sendCancel(session) {
        if (!session.id || session.finished || session.cancelSent) return;
        session.cancelSent = true;
        SDK.fetchJSON("/api/plugins/hackertube/search/jobs/" + encodeURIComponent(session.id) + "/cancel", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
        }).then(function (body) { receiveSearch(body, session); }).catch(function () {
          if (session.finished || searchEpoch.current !== session.epoch) return;
          session.cancelRequested = session.cancelSent = false;
          setCancelBusy(false);
          setSearchError("Cancellation could not be confirmed. Try Cancel again; the deadline remains enforced.");
          pollSearch(session);
        });
      }

      function cancelSearch() {
        var session = activeSearch.current;
        if (!session || session.finished) return;
        session.cancelRequested = true;
        setCancelBusy(true);
        sendCancel(session);
      }

      function onSubmit(event) {
        event.preventDefault();
        if (searchBusy) return;
        if (configuration.current.pending || configuration.current.failures.size) {
          showFormAlert("Finish saving model and source settings before searching. Retry failed changes or reopen Search to reload saved settings.");
          return;
        }
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
          endSearch("alert");
          return;
        }
        // Claim a sequence number for this request. Each handler only applies
        // its result while its epoch is still the latest, so a late response
        // from an earlier search cannot reopen the panel or overwrite newer
        // results.
        var epoch = searchEpoch.current + 1;
        searchEpoch.current = epoch;
        var session = { epoch: epoch, id: null, finished: false, cancelRequested: false, cancelSent: false };
        activeSearch.current = session;
        setCancelBusy(false);
        SDK.fetchJSON("/api/plugins/hackertube/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ question: value, disclosure_accepted: true, background: true }),
        }).then(function (body) {
          receiveSearch(body, session);
        }).catch(function (error) {
          if (searchEpoch.current !== epoch || session.finished) return;
          function unavailable() {
            if (searchEpoch.current !== epoch || session.finished) return;
            session.finished = true;
            setSearchStatus("error");
            setSearchError(searchRefusalMessage(null, error));
            endSearch("alert");
          }
          // A failed HTTP acknowledgement does not prove the accepted worker
          // never started. Observe existing work; never resend a paid start.
          SDK.fetchJSON("/api/plugins/hackertube/search").then(function (info) {
            if (info && info.job && ["queued", "running", "cancelling"].indexOf(info.job.state) !== -1) receiveSearch(info, session);
            else unavailable();
          }).catch(unavailable);
        });
      }

      function backToDiscovery() {
        // Refuse while a search is running: clearing the status here would reset
        // the busy guard and let a second paid request be submitted while the
        // first is still in flight. The Back control is disabled for the same
        // reason.
        if (searchBusy) return;
        // Close the results panel: it renders while searchBusy, searchError, or
        // searchResult is set, so clearing those returns to discovery. The typed
        // question, the feed, and the saves are kept.
        setSearchResult(null);
        setSearchError("");
        setSearchStatus("idle");
        if (!searchOpen) setSearchOpen(true);
        setTimeout(function () {
          if (inputRef.current) inputRef.current.focus();
        }, 0);
      }

      function postProfile(path, body, revert, onReady) {
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
            setProfileStatus(revert ? "ready" : "error");
            setStatus("The profile did not accept that change.");
            return;
          }
          profileRef.current = next;
          setProfile(next);
          setProfileStatus("ready");
          if (onReady) onReady(next);
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

      function onRemoveInterest(text) {
        var current = profileRef.current;
        postProfile("/api/plugins/hackertube/profile/interests", { text: text, remove: true }, current, function (next) {
          var interests = (next && next.interests) || [];
          if (interests.indexOf(text) !== -1) return;
          setStatus("Removed interest " + text + ".");
          if (interestInputRef.current && interestInputRef.current.focus) interestInputRef.current.focus();
        });
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

      function markArtFailed(itemId) {
        setArtFailed(function (prev) {
          if (prev[itemId]) return prev;
          var next = Object.assign({}, prev);
          next[itemId] = true;
          return next;
        });
      }

      function renderThumbnail(item, extraClassName) {
        // A YouTube thumbnail is shown exactly as the Data API returned it:
        // no crop, no overlay, no play button over the image. The official
        // linked Icon stays beside it as attribution. A thumbnail that fails
        // to load drops out and leaves the Icon: never a broken image hole.
        if (!item.art_url || !item.art_hotlink || artFailed[item.item_id]) return null;
        // Render-time host check: the stored URL must still point at an official
        // YouTube thumbnail host. Anything else drops out and leaves the Icon.
        var decision = thumbnailDecision(item.art_url);
        if (!decision.ok) return null;
        return h("img", {
          className: "ht-thumb" + (extraClassName ? " " + extraClassName : ""),
          src: decision.href,
          alt: "",
          onError: function () { markArtFailed(item.item_id); },
        });
      }

      function renderYouTubeBrand(item, compact) {
        // The logo links to the video: that is this card's single
        // source-opening link, and its name says what it opens. The mark is
        // the official asset at the brand site's published digital minimum
        // height (100px), unaltered, and the link is the tap target.
        var link = h("a", {
          className: compact ? "ht-youtube-icon" : undefined,
          href: destinationDecision(item.destination).href,
          target: "_blank",
          rel: "noopener noreferrer",
          "aria-label": 'Watch "' + String(item.title || "this item") + '" on YouTube',
          onClick: function () { onOpen(item); },
        },
          h("img", { src: YOUTUBE_ICON, alt: "YouTube" }),
          compact ? null : h("span", { className: "ht-youtube-action" }, "Watch on YouTube"));
        if (compact) {
          return h("div", { className: "ht-youtube-compact" },
            renderThumbnail(item, "ht-thumb-compact"),
            link);
        }
        return h("div", { className: "ht-youtube-media" },
          renderThumbnail(item),
          h("div", { className: "ht-art ht-youtube-brand" }, link));
      }

      function renderArt(item) {
        if (usesYouTubeBrandLink(item)) {
          return renderYouTubeBrand(item, false);
        }
        var decision = item.art_url ? destinationDecision(item.art_url) : { ok: false };
        var showImage = !!(item.art_url && item.art_hotlink && decision.ok && !artFailed[item.item_id]);
        if (!showImage) {
          return null;
        }
        var fit = item.format === "video" ? "ht-cover" : "ht-contain";
        return h("div", { className: "ht-art" + (fit === "ht-contain" ? " ht-art-cover" : "") },
          h("img", {
            src: decision.href,
            alt: "",
            className: fit,
            onError: function () { markArtFailed(item.item_id); },
          })
        );
      }

      function renderEvidence(item, evidence, sources, length) {
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
        var retrieved = formatRetrieved(presented.retrievedAt);
        var shortDate = /^(\d{4})-(\d{2})-(\d{2})T/.exec(String(presented.retrievedAt || ""));
        var shortRetrieved = shortDate && retrieved !== "retrieved time unknown"
          ? "retrieved " + MONTHS[Number(shortDate[2]) - 1].slice(0, 3) + " " + Number(shortDate[3]) + ", " + shortDate[1]
          : "retrieved time unknown";
        var destination = destinationLabel(item);
        var sameSource = presented.kind === "candidate" && presented.sourceName === destination;
        return h("div", { className: "ht-evidence" },
          presented.kind === "candidate" ? null : h("p", null, body),
          h("p", { className: "ht-meta-line" },
            presented.kind === "candidate" ? [body, sourceBit, " · "] : null,
            !sameSource && !usesYouTubeBrandLink(item) ? destination + " · " : null,
            h("time", { dateTime: presented.retrievedAt || "", title: retrieved }, shortRetrieved),
            length ? " · " + length : null)
        );
      }

      function renderActions(item, compact) {
        var decision = destinationDecision(item.destination);
        var state = itemState(profile, item.item_id);
        var isSaved = state.saved;
        var isDismissed = state.dismissed;
        var openControl;
        if (!decision.ok) {
          openControl = h("p", { className: "ht-alert", role: "alert" }, refusalMessage(decision));
        } else if (usesYouTubeBrandLink(item)) {
          // One source-opening link per card: the linked attribution icon
          // above already opens this destination, in a compact row too
          // (review finding 6).
          openControl = null;
        } else {
          openControl = h("a", {
            className: "ht-action ht-open",
            href: decision.href,
            target: "_blank",
            rel: "noopener noreferrer",
            "aria-label": usesYouTubeBrandLink(item) ? 'Watch "' + String(item.title || "this item") + '" on YouTube' : "Open at source: " + destinationLabel(item),
            onClick: function () { onOpen(item); },
          }, usesYouTubeBrandLink(item) ? "Watch on YouTube" : "Open at source");
        }
        var saveButton = h(Button, {
          type: "button",
          outlined: true,
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
          className: "ht-action ht-dismiss",
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

      function renderCard(item, byId, evidence, sources, editions, inLibrary, focusId, whyLines, compact) {
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
        var badge = Badge
          ? h(Badge, { tone: "secondary", className: "ht-format" }, format)
          : h("p", { className: "ht-format" }, format);
        var creator = creatorLine(item, byId)
          ? h("p", { className: "ht-creator" }, creatorLine(item, byId))
          : null;
        var noteEl = note ? h("p", { className: "ht-meta" }, note) : null;
        // T28: approved short attribution note, secondary tier only.
        var youtubeNote = String(item.item_id || "").indexOf("youtube:") === 0
          ? h("p", { className: "ht-note" }, "Metadata from YouTube. Explanations and library actions are HackerTube’s.")
          : null;
        var libraryNote = inLibrary
          ? h("p", { className: "ht-meta" },
              (itemState(profile, item.item_id).opens.length ? "Opened" : "Not opened") + " · " +
              (itemState(profile, item.item_id).completed ? "Completed" : "Not completed"))
          : null;
        var actions = renderActions(item, compact);
        // The compact row's HEADER is exactly these three lines, named rather
        // than sliced out of a longer list so a later edit to that list cannot
        // silently move a line in or out of the header. The art is placed
        // separately: in a full card between the creator line and the
        // evidence, and in a compact row between the header and the rest, so
        // heading navigation leads with the badge, title and creator and this
        // row's own Watch link, Save and Dismiss follow it (WCAG 1.3.2 and
        // 2.4.3). CSS arranges the side column at 768px and up.
        var header = [badge, title, creator];
        var rest = [
          renderEvidence(item, evidence, sources, length),
          whyText(whyLines),
          noteEl,
          youtubeNote,
          libraryNote,
          actions,
        ];
        var art = compact
          ? (usesYouTubeBrandLink(item) ? renderYouTubeBrand(item, true) : null)
          : null;
        var body;
        if (compact) {
          // The row HEADER (badge, title, creator) is the first child in the
          // DOM, then the media column (the thumbnail and its Watch link), then
          // the rest of the text and its Save/Dismiss actions. A screen-reader
          // user who jumps to a title and presses Tab therefore reaches that
          // same row's Watch link, then Save and Dismiss — never the next row's
          // link (WCAG 1.3.2 reading order, 2.4.3 focus order). CSS keeps the
          // media column on the LEFT of the text at 768px and up with grid
          // areas, so the painted order is still media column then text column
          // and the focusable order (Watch, Save, Dismiss) matches the paint.
          // Below 768px the three parts stack in DOM order.
          body = art
            ? h("div", { className: "ht-compact-row" },
                h("div", { className: "ht-compact-head" }, header),
                h("div", { className: "ht-compact-side" }, art),
                h("div", { className: "ht-compact-main" }, rest))
            : header.concat(rest);
        } else {
          body = header.concat([renderArt(item)], rest);
        }
        return h("article", { key: item.item_id },
          h(Card, { className: "ht-card" + (compact ? " ht-compact" : "") },
            h(CardContent, null, body)
          )
        );
      }

      function reloadPrepared() {
        setPreparedNonce(function (nonce) { return nonce + 1; });
      }

      function openFocusedSearch() {
        setControlsExpanded(true);
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
            ? h("div", { className: inLibrary ? "ht-grid" : "ht-rows" }, shown.map(function (item, index) {
                var focusId = expanded[section.id] && index === INITIAL_CARDS ? "ht-expanded-" + section.id : "";
                return renderCard(item, byId, catalog.evidence, catalog.sources, catalog.editions, inLibrary, focusId, null, !inLibrary);
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
        return h("div", { className: "ht-rows" }, shown.map(function (item, index) {
          var focusId = expanded[key] && index === INITIAL_CARDS ? "ht-expanded-" + key : "";
          var lines = withWhy && discovery.why ? discovery.why[item.item_id] : null;
          return renderCard(item, byId, catalog.evidence, catalog.sources, catalog.editions, false, focusId, lines, true);
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
                  h("p", { id: "hackertube-ranked-counts", className: "ht-meta" }, countLine(rows)),
                  h("details", { className: "ht-explain" },
                    h("summary", null, "How this feed is ordered"),
                    h("p", { id: "hackertube-signals", className: "ht-note" }, POLICY_NOTE),
                    h("p", { className: "ht-note" }, RANK_NOTE)),
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
                h(Button, { type: "button", className: "ht-action", onClick: reloadPrepared }, "Reload catalog")
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
          browse.length ? h("div", { className: "ht-browse", id: browseKey },
            h("h3", { id: section.id + "-browse-heading" },
              browseHeading(section.label),
              h("span", { className: "ht-count" }, " " + browse.length)
            ),
            cardGrid(browse, browseKey, byId, false),
            browse.length > visibleSlice(browse, !!expanded[browseKey], INITIAL_CARDS).length
              ? showMore(browseKey, browse.length)
              : null
          ) : null
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
        notes.push(h("p", { className: "ht-why", key: "why" },
          result.relevance === "model_inferred" ? "Model relevance: " : "", resultWhy(result)));
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
          h("details", { className: "ht-explain ht-search-details" },
          h("summary", null, "Search details"),
          result && result.interpretation ? h("p", { className: "ht-meta" },
            "Topic: " + (result.interpretation.retrieval_query || result.interpretation.topic || "unknown") +
            ". Level: " + (result.interpretation.depth || "unspecified") + ".") : null,
          h("p", { className: "ht-constraints" }, constraintLine(result && result.interpretation)),
          h("p", { className: "ht-cost", id: "hackertube-job-cost" }, formatCost(usage)),
          h("p", { className: "ht-meta", id: "hackertube-job-limits" }, limitsLine(job.limits, usage))),
          notes.length ? h("p", { className: "ht-note", id: "hackertube-coverage-notes", role: "status" }, plainCoverageNotes(notes).join(" ")) : null,
          renderResultSections(result)
        );
      }

      function renderSearch() {
        var searchDescriptionIds = "hackertube-disclosure";
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
                h("div", { className: "ht-model-picker" },
                  h(Label, { htmlFor: "hackertube-search-model" }, "Search provider and model"),
                  h("select", { id: "hackertube-search-model", value: modelChoice, disabled: searchBusy || settingsSaving,
                    onChange: function (event) { setModelChoice(event.target.value); } },
                    [h("option", { key: "default", value: "" }, "Use current Hermes model")].concat(
                      ((modelOptions && modelOptions.providers) || []).filter(function (provider) { return provider.authenticated !== false; }).flatMap(function (provider) {
                        return (provider.models || []).map(function (model) {
                          var id = typeof model === "string" ? model : model.id;
                          if (!id) return null;
                          var value = JSON.stringify([provider.slug, id]);
                          return h("option", { key: value, value: value }, (provider.label || provider.slug) + " · " + id);
                        });
                      })
                    )
                  ),
                  h(Button, { type: "button", onClick: applySearchModel, disabled: searchBusy || settingsSaving, className: "ht-action" }, "Use for search"),
                  h("a", { href: "/models" }, "Manage providers in Hermes"),
                  modelMessage ? h("p", { role: "status" }, modelMessage) : null
                ),
                sourceRows.length ? h("details", { className: "ht-source-settings" },
                  h("summary", null, "Search sources"),
                  sourceRows.map(function (source) {
                    var blocked = !!source.blocked_reason && source.blocked_reason !== "disabled";
                    return h("div", { key: source.source_id },
                      h("label", null, h("input", { type: "checkbox", checked: !!source.enabled, disabled: blocked || searchBusy || settingsSaving,
                        onChange: function (event) { changeSource(source.source_id, !!event.target.checked); } }), " " + source.name),
                      blocked ? h("p", { className: "ht-note" }, source.source_id === "reddit"
                        ? "Reddit access requires approval and selected subreddits."
                        : "Add this source’s credentials in Hermes plugin settings to enable it.") : null,
                      source.last_error ? h("p", { className: "ht-note" }, "Last retrieval failed. Other sources remain available.") : null
                    );
                  }),
                  h("p", { className: "ht-note" }, "YouTube uses its Data API and quota. Review the source terms and privacy information in ", h("a", { href: "#about" }, "About"), " before enabling it. Changing sources does not start a search.")
                ) : null,
                h(Label, { htmlFor: "hackertube-question" }, "Question"),
                h(Input, {
                  id: "hackertube-question",
                  className: "ht-input",
                  ref: inputRef,
                  type: "text",
                  value: question,
                  placeholder: DEMO_QUESTION,
                  autoComplete: "off",
                  "aria-describedby": searchDescriptionIds,
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
                formAlert
                  ? h("p", { className: "ht-alert", role: "alert", tabIndex: -1, ref: alertRef }, formAlert)
                  : null,
                h("div", { className: "ht-search-actions" },
                  h(Button, {
                    type: "submit",
                    className: "ht-action",
                    "aria-describedby": searchDescriptionIds,
                    disabled: searchBusy || settingsBlocked,
                    "aria-disabled": searchBusy || settingsBlocked ? "true" : undefined,
                  }, searchBusy ? "Searching" : settingsSaving ? "Saving settings" : "Search"),
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
                searchBusy ? h(Button, {
                  type: "button",
                  className: "ht-action",
                  onClick: function () {
                    if (cancelBusy) return;
                    cancelSearch();
                  },
                  "aria-disabled": cancelBusy ? "true" : undefined,
                }, cancelBusy ? "Stopping search" : "Cancel search") : null,
                searchError ? h("p", { className: "ht-alert", role: "alert", tabIndex: -1, ref: searchAlertRef }, searchError) : null,
                searchResult ? renderJob(searchResult) : null,
                h(Button, {
                  type: "button",
                  outlined: true,
                  className: "ht-action",
                  disabled: searchBusy,
                  "aria-disabled": searchBusy ? "true" : undefined,
                  onClick: backToDiscovery,
                }, "Back to discovery")
              )
            : null
        );
      }

      function renderDiscover() {
        return h("div", null,
          h("h1", { id: "discover", tabIndex: -1, ref: headingRef }, "Discover"),
          h("p", { className: "ht-lead" }, "Browse videos, podcasts, books, and audiobooks, then open them at their sources."),
          renderNav("discover"),
          h("div", { className: "ht-status", role: "status", "aria-live": "polite" }, statusMessage),
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
          h("details", {
            className: "ht-feed-controls",
            open: controlsExpanded,
            onToggle: function (event) { controlsChosen.current = true; setControlsExpanded(event.currentTarget.open); },
          },
            h("summary", null, controlsExpanded ? "Hide controls" : "Show controls", searchBusy ? " · Search running" : ""),
            h("div", { className: "ht-feed-controls-body" },
              Separator ? h(Separator, null) : null,
              renderInterests(true),
              renderSearch(),
              h("nav", { className: "ht-sections", "aria-label": "Media sections" },
                SECTIONS.map(function (section) {
                  return h("a", { href: "#" + section.id, key: section.id }, section.label);
                })
              )
            )
          ),
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
              return h("li", { key: text }, text,
                editable ? h(Button, {
                  type: "button",
                  className: "ht-remove-interest",
                  "aria-label": "Remove interest " + text,
                  onClick: function () { onRemoveInterest(text); },
                }, "Remove") : null);
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
                  ref: interestInputRef,
                  type: "text",
                  value: interestDraft,
                  autoComplete: "off",
                  "aria-describedby": "hackertube-interest-note",
                  onChange: function (event) { setInterestDraft(event.target.value); },
                }),
                h("p", { id: "hackertube-interest-note", className: "ht-note" },
                  "Any subject, up to 80 characters. An item is recommended only when a word in its title or contributor matches."
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

      function renderMissingSaved() {
        if (!catalog || profileStatus !== "ready") return null;
        var known = itemsById(catalog.items || []);
        var missing = Object.keys(savedMap(profile)).filter(function (id) { return !known[id]; });
        if (!missing.length) return null;
        return h("section", { className: "ht-missing-saved" },
          h("h2", null, "Saved items awaiting metadata"),
          missing.map(function (id) {
            return h("article", { key: id },
              h("h3", null, id.indexOf("youtube:") === 0 ? "Saved YouTube video" : "Saved item"),
              h("p", null, "Metadata unavailable. Run an explicit search to retrieve current details. Your saved status is retained.")
            );
          })
        );
      }

      function renderLibrary() {
        var count = Object.keys(savedMap(profile)).length;
        return h("div", null,
          h("h1", { id: "library", tabIndex: -1, ref: headingRef }, "Library"),
          h("p", { className: "ht-lead" }, "Items you save stay here, across refreshes and restarts."),
          renderNav("library"),
          h("div", { className: "ht-status", role: "status", "aria-live": "polite" }, statusMessage),
          renderInterests(false),
          profileStatus === "ready" && count === 0
            ? h("p", null, "Nothing is saved yet. ", h("a", { className: "ht-text-link", href: "#discover" }, "Discover"))
            : null,
          catalog ? renderSections(true) : null,
          renderMissingSaved(),
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
          h("p", null, "Explicit searches retrieve from enabled Hacker News, Apple/iTunes, Open Library, LibriVox, and configured Hermes web search. YouTube Data API and Podcast Index need their own source credentials. Reddit stays disabled until approved. Results name unavailable sources. Artwork and media files are not downloaded by search."),
          h("p", null, "Book covers load from Open Library and YouTube thumbnails load from the official YouTube thumbnail host, and only when the catalog marks them as verified hotlinks. This page does not cache those images. A YouTube thumbnail is shown unaltered and is never cropped or covered. Apple artwork is not loaded."),
          h("h2", null, "Coverage"),
          h("p", null, "The opening feed recommends an item only after a word match in the title or a contributor name. Matching items are ordered with fixed weights for community evidence, freshness, and variety. The line on each recommendation names only the signals that applied to that item. This page does not show scores. Community evidence means an established endorsement on the record. A mention is not an endorsement. This catalog has no established Hacker News endorsement to rank. An item needs catalog evidence that has not passed its refresh time. Dismissed and completed items stay out of the ranked feed and the section lists. Each format section lists matches first. The not-matched group stays in capture order and is not a recommendation. Coverage is the seeded titles and contributors. A subject outside that set has no ranked match. A format can be empty. Unknown duration and unknown length stay unknown. Saves and interests stay in this profile. Opening a source records that open and does not mark the item completed."),
          h("h2", null, "Search and privacy"),
          h("p", null, "Only explicit searches send the question and bounded retrieved metadata to the selected Hermes provider and configured web-search service. Hermes handles model credentials. HackerTube requests no memory or unrelated chat history. Retrieved identities and library state stay in this Hermes profile. Clear HackerTube plugin data while Hermes is stopped to remove them. Source metadata expires after 30 days. Hourly housekeeping while Hermes runs and cleanup before metadata access remove expired copies. Use Privacy to inspect the policy or delete this profile’s HackerTube data."),
          h("p", null, "When YouTube is enabled, using its features means agreeing to the ",
            h("a", { href: "https://www.youtube.com/t/terms", target: "_blank", rel: "noopener noreferrer" }, "YouTube Terms of Service"),
            "; Google describes its privacy practices in the ", h("a", { href: "https://policies.google.com/privacy", target: "_blank", rel: "noopener noreferrer" }, "Google Privacy Policy"), "."),
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

    function PrivacyPage() {
      var state = useState(null), policy = state[0], setPolicy = state[1];
      var errorState = useState(""), error = errorState[0], setError = errorState[1];
      var busyState = useState(false), busy = busyState[0], setBusy = busyState[1];
      var showState = useState(false), show = showState[0], setShow = showState[1];
      var ackState = useState(false), ack = ackState[0], setAck = ackState[1];
      var deleteState = useState(false), deleting = deleteState[0], setDeleting = deleteState[1];
      var focusState = useState(false), focusHeading = focusState[0], setFocusHeading = focusState[1];
      useEffect(function () {
        var gone = false;
        if (!SDK.fetchJSON) { setError("Privacy policy could not be loaded. Reopen HackerTube to retry."); return; }
        SDK.fetchJSON("/api/plugins/hackertube/privacy").then(function (body) {
          if (!gone && body && typeof body.version === "string" && typeof body.text === "string" && typeof body.accepted === "boolean") setPolicy(body);
          else if (!gone) setError("Privacy policy could not be loaded. Reopen HackerTube to retry.");
        }).catch(function () { if (!gone) setError("Privacy policy could not be loaded. Reopen HackerTube to retry."); });
        return function () { gone = true; };
      }, []);
      function update(remove) {
        if (busy || (!remove && !ack)) return;
        setBusy(true); setError("");
        SDK.fetchJSON("/api/plugins/hackertube/privacy" + (remove ? "/delete" : ""), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(remove ? {} : { version: policy.version, accepted: true }),
        }).then(function (body) {
          if (!body || typeof body.accepted !== "boolean" || !body.version) throw new Error("privacy response");
          // Set the hand-off before mounting the page, including on hosts
          // that do not batch promise-callback state updates.
          if (!remove) setFocusHeading(true);
          setPolicy(body); setShow(false); setAck(false); setDeleting(false);
        }).catch(function () { setError(remove ? "Deletion did not complete. Cancel any active Search and retry. Your data has not been cleared." : "Agreement could not be saved. Please retry."); })
          .finally(function () { setBusy(false); });
      }
      function link(url, label) { return h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, label); }
      // The gate has to render even if the host is missing its component set,
      // so the SDK button falls back to a native one.
      var GateButton = Button || "button";
      var policyShown = !!(policy && (!policy.accepted || show));
      return h("div", { className: "hackertube" },
        h(GateButton, {
          type: "button",
          outlined: true,
          className: "ht-action",
          // The toggle reports the state of the section it controls: while the
          // policy is unaccepted it is forced open, so it reads expanded.
          "aria-expanded": policyShown ? "true" : "false",
          "aria-controls": "hackertube-privacy-policy",
          onClick: function () { setShow(!show); },
        }, "Privacy"),
        policy ? h("section", { id: "hackertube-privacy-policy", "aria-label": "Privacy policy", hidden: !policyShown },
          h("h1", null, "HackerTube privacy and terms"),
          h("p", null, "Read the policy and agree before using HackerTube. Version " + policy.version),
          h("div", { style: { whiteSpace: "pre-wrap" } }, policy.text),
          h("p", null, link("https://www.youtube.com/t/terms", "YouTube Terms of Service"), " · ", link("https://policies.google.com/privacy", "Google Privacy Policy"), " · ", link("https://security.google.com/settings/security/permissions", "Google permissions")),
          !policy.accepted ? h("div", null,
            h("label", null, h("input", { type: "checkbox", checked: ack, disabled: busy,
              onChange: function (event) { setAck(!!event.target.checked); } }), " I agree to the HackerTube privacy policy and terms, including the YouTube Terms of Service."),
            h(GateButton, { type: "button", disabled: busy || !ack, onClick: function () { update(false); } }, "Agree and continue")
          ) : null,
          h("p", null, "Deletion removes this profile’s HackerTube library, history, searches, source settings and agreement. It does not change data held by YouTube or remove Hermes credentials. Cancel an active Search first."),
          h("label", null, h("input", { type: "checkbox", checked: deleting, disabled: busy,
            onChange: function (event) { setDeleting(!!event.target.checked); } }), " Delete all HackerTube data in this profile"),
          h(GateButton, { type: "button", outlined: true, disabled: busy || !deleting, onClick: function () { update(true); } }, "Delete HackerTube data and revoke agreement")
        ) : null,
        error ? h("p", { role: "alert" }, error) : null,
        !policy && !error ? h("p", null, "Loading privacy policy…") : null,
        policy && policy.accepted ? h(HackerTubePage, { focusHeading: focusHeading }) : null
      );
    }
    // Content is exposed for the component-only harness; production mounts PrivacyPage.
    PrivacyPage.Content = HackerTubePage;
    return PrivacyPage;
  }

  return {
    DEMO_QUESTION: DEMO_QUESTION,
    DISCLOSURE: DISCLOSURE,
    DISCLOSURE_ACK: DISCLOSURE_ACK,
    DISCLOSURE_ACK_ALERT: DISCLOSURE_ACK_ALERT,
    SEARCH_PROVIDER_NOTE: SEARCH_PROVIDER_NOTE,
    SEARCH_SCHEMA: SEARCH_SCHEMA,
    SEARCH_COST_UNKNOWN: SEARCH_COST_UNKNOWN,
    SEARCH_LIMIT_NOTE: SEARCH_LIMIT_NOTE,
    searchRefusalMessage: searchRefusalMessage,
    formatCost: formatCost,
    plainCoverageNotes: plainCoverageNotes,
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
