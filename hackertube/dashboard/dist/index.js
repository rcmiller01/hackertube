/* HackerTube dashboard page.
 *
 * Catalog rows come from GET /api/plugins/hackertube/catalog, which reads the
 * local fixture through catalog_adapter.py. This file does not import
 * hackertube_core. Save, dismiss, and open state live in the page visit only
 * (task 2.2). Feed order is fixture capture order (task 3.2). Search renders
 * the question, disclosure, and results area and does not call a model,
 * search provider, or paid API (tasks 4.1 and 4.2).
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

  function isPrivateIp(host) {
    var mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
    if (mapped) return isPrivateIp(mapped[1]);
    var v4 = ipv4Parts(host);
    if (v4) {
      var a = v4[0];
      var b = v4[1];
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      if (a >= 224) return true;
      return false;
    }
    if (host.indexOf(":") === -1) return false;
    if (host === "::1" || host === "::") return true;
    if (/^fe[89ab]/.test(host)) return true;
    if (/^f[cd]/.test(host)) return true;
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

  function applySave(saved, itemId, clock) {
    if (saved[itemId]) return saved;
    var at = clock.current + 1;
    clock.current = at;
    var next = Object.assign({}, saved);
    next[itemId] = { at: at };
    return next;
  }

  function applyDismiss(dismissed, itemId) {
    if (dismissed[itemId]) return dismissed;
    var next = Object.assign({}, dismissed);
    next[itemId] = true;
    return next;
  }

  function itemsById(items) {
    var map = {};
    (items || []).forEach(function (item) { map[item.item_id] = item; });
    return map;
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
      var fixtureState = useState(false);
      var fixture = fixtureState[0];
      var setFixture = fixtureState[1];
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
      var savedState = useState({});
      var saved = savedState[0];
      var setSaved = savedState[1];
      var dismissedState = useState({});
      var dismissed = dismissedState[0];
      var setDismissed = dismissedState[1];
      var openedState = useState({});
      var opened = openedState[0];
      var setOpened = openedState[1];
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
      var saveClock = useRef(0);
      var savedRef = useRef({});
      var seenView = useRef(null);
      var wasOpen = useRef(false);
      var searchBusy = false;

      useEffect(function () {
        var cancelled = false;
        if (!SDK.fetchJSON) {
          setLoadError(true);
          return function () { cancelled = true; };
        }
        SDK.fetchJSON("/api/plugins/hackertube/catalog").then(function (body) {
          if (cancelled) return;
          if (!body || !body.catalog || !body.catalog.items) {
            setLoadError(true);
            return;
          }
          setCatalog(body.catalog);
          setFixture(body.fixture === true);
        }).catch(function () {
          if (!cancelled) setLoadError(true);
        });
        return function () { cancelled = true; };
      }, []);

      useEffect(function () {
        function onHash() {
          var value = hashValue();
          if (value === "library" || value === "about" || value === "discover") {
            setView(value);
            return;
          }
          if (value === "videos" || value === "podcasts" || value === "books" || value === "audiobooks") {
            setView("discover");
            var node = document.getElementById(value);
            if (node && node.scrollIntoView) node.scrollIntoView();
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
        savedRef.current = saved;
      }, [saved]);

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

      function onSubmit(event) {
        event.preventDefault();
        var value = question.trim();
        if (!value) {
          setFormAlert("Enter a question before searching.");
          if (alertRef.current) alertRef.current.focus();
          return;
        }
        setFormAlert("");
        setSubmitted(value);
        setSubmitCount(function (count) { return count + 1; });
      }

      function backToDiscovery() {
        setSubmitted("");
        if (!searchOpen) setSearchOpen(true);
        setTimeout(function () {
          if (inputRef.current) inputRef.current.focus();
        }, 0);
      }

      function onSave(item) {
        var next = applySave(savedRef.current, item.item_id, saveClock);
        if (next === savedRef.current) return;
        savedRef.current = next;
        setSaved(next);
        setStatus("Saved " + item.title + ". Library has " + Object.keys(next).length + " saved.");
      }

      function onDismiss(item) {
        setDismissed(function (prev) {
          var next = applyDismiss(prev, item.item_id);
          if (next !== prev) {
            setStatus("Dismissed " + item.title + ". The feed is unchanged.");
          }
          return next;
        });
      }

      function onOpen(item) {
        setOpened(function (prev) { return applyOpen(prev, item.item_id); });
      }

      function renderNav(current) {
        var count = Object.keys(saved).length;
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
        var isSaved = !!saved[item.item_id];
        var isDismissed = !!dismissed[item.item_id];
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

      function renderCard(item, byId, evidence, sources, editions, inLibrary) {
        var note = editionNote(item, editions, byId);
        var length = lengthLine(item);
        var format = FORMAT_LABEL[item.format] || item.format;
        var titleProps = { className: "ht-title" };
        return h("article", { key: item.item_id },
          h(Card, { className: "ht-card" },
            h(CardContent, null,
              Badge
                ? h(Badge, { tone: "secondary", className: "ht-format" }, format)
                : h("p", { className: "ht-format" }, format),
              CardTitle
                ? h(CardTitle, titleProps, item.title)
                : h("h3", titleProps, item.title),
              h("p", { className: "ht-creator" }, creatorLine(item, byId)),
              renderArt(item),
              h("p", { className: "ht-destination" }, destinationLabel(item)),
              renderEvidence(item, evidence, sources),
              length ? h("p", { className: "ht-length" }, length) : null,
              note ? h("p", { className: "ht-meta" }, note) : null,
              inLibrary
                ? h("p", { className: "ht-meta" }, opened[item.item_id] ? "Opened" : "Not opened")
                : null,
              renderActions(item)
            )
          )
        );
      }

      function renderSections(inLibrary) {
        var items = catalog && catalog.items ? catalog.items : [];
        var byId = itemsById(items);
        return h("div", null,
          fixture ? h("p", { className: "ht-note" }, "Seeded fixture, in capture order.") : null,
          SECTIONS.map(function (section) {
            var rows = sectionItems(items, section, inLibrary ? saved : null);
            var shown = visibleSlice(rows, !!expanded[section.id], INITIAL_CARDS);
            var empty = inLibrary
              ? "No saved " + section.label.toLowerCase() + "."
              : "No " + section.label.toLowerCase() + " in this fixture.";
            return h("section", { className: "ht-section", id: section.id, key: section.id, "aria-labelledby": section.id + "-heading" },
              h("h2", { id: section.id + "-heading" },
                section.label,
                h("span", { className: "ht-count" }, " " + rows.length)
              ),
              rows.length
                ? h("div", { className: "ht-grid" }, shown.map(function (item) {
                    return renderCard(item, byId, catalog.evidence, catalog.sources, catalog.editions, inLibrary);
                  }))
                : h("p", null, empty),
              rows.length > shown.length
                ? h(Button, {
                    type: "button",
                    outlined: true,
                    className: "ht-action",
                    onClick: function () {
                      setExpanded(function (prev) {
                        var next = Object.assign({}, prev);
                        next[section.id] = true;
                        return next;
                      });
                    },
                  }, "Show more")
                : null
            );
          })
        );
      }

      function renderSearch() {
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
                formAlert
                  ? h("p", { className: "ht-alert", role: "alert", tabIndex: -1, ref: alertRef }, formAlert)
                  : null,
                h("div", { className: "ht-search-actions" },
                  h(Button, {
                    type: "submit",
                    className: "ht-action",
                    "aria-describedby": "hackertube-disclosure",
                  }, "Search"),
                  h(Button, {
                    type: "button",
                    outlined: true,
                    className: "ht-action",
                    onClick: closeSearch,
                  }, "Close search")
                )
              )
            : null,
          submitted
            ? h("div", { className: "ht-results", "aria-busy": "false" },
                h("h2", { tabIndex: -1, ref: resultsRef }, "Search results"),
                h("p", { className: "ht-question" }, "Question: " + submitted),
                h("p", { className: "ht-constraints" }, "Constraints: none applied."),
                h("p", { role: "status" }, "No search was started. This page does not call a model or a search provider."),
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
          renderSearch(),
          h("nav", { className: "ht-sections", "aria-label": "Media sections" },
            SECTIONS.map(function (section) {
              return h("a", { href: "#" + section.id, key: section.id }, section.label);
            })
          ),
          loadError
            ? h("p", { role: "alert" }, "No prepared feed is available. The local fixture did not load. Browsing does not start a search.")
            : null,
          !catalog && !loadError ? h("p", { role: "status" }, "Loading the seeded fixture.") : null,
          catalog ? renderSections(false) : null,
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

      function renderLibrary() {
        var count = Object.keys(saved).length;
        return h("div", null,
          h("h1", { id: "library", tabIndex: -1, ref: headingRef }, "Library"),
          h("p", { className: "ht-lead" }, "Saved items stay in this list for this visit. Saving does not open this view."),
          renderNav("library"),
          h("div", { className: "ht-status", role: "status", "aria-live": "polite" }, statusMessage),
          count === 0
            ? h("p", null, "Nothing is saved yet. ", h("a", { className: "ht-text-link", href: "#discover" }, "Discover"))
            : null,
          catalog ? renderSections(true) : null,
          !catalog && loadError
            ? h("p", { role: "alert" }, "No prepared feed is available. The local fixture did not load.")
            : null
        );
      }

      function renderAbout() {
        return h("div", { className: "ht-about" },
          h("h1", { id: "about", tabIndex: -1, ref: headingRef }, "About"),
          h("p", null,
            "Andrej Karpathy created the original HackerTube and inspired this project. Read his ",
            h("a", { href: "https://karpathy.bearblog.dev/hacker-tube/", target: "_blank", rel: "noopener noreferrer" }, "original HackerTube post"),
            " and visit ",
            h("a", { href: "https://hackertube.org/", target: "_blank", rel: "noopener noreferrer" }, "hackertube.org"),
            "."
          ),
          h("p", null, "This is an independent Hermes adaptation. It extends the original community-curated discovery idea across several media formats."),
          renderNav("about"),
          h("h2", null, "Sources"),
          h("p", null, "The seeded page shows podcasts from Apple Podcasts, books from Open Library, and audiobooks from LibriVox. Hacker News is evidence on a media card. It is not a fifth format. Reddit is not used."),
          h("p", null, "Book covers load from Open Library only when the fixture marks them as hotlinks. This page does not cache those images. Apple artwork is not loaded."),
          h("h2", null, "Coverage"),
          h("p", null, "This fixture is a small set of records in capture order. Ranking is not applied. A format can be empty. Unknown duration and unknown length stay unknown. Saves last for this visit only."),
          h("h2", null, "Opening a source"),
          h("p", null, "Open at source leaves this page and opens the public destination in the browser. HackerTube does not download the media and does not play it. A destination that is not public https is refused.")
        );
      }

      if (!Card || !CardContent || !Button || !Input || !Label) {
        return h("p", { role: "alert" }, "This Hermes build is missing dashboard components HackerTube needs.");
      }

      return h("div", { className: "hackertube", "data-fixture": fixture ? "true" : "false" },
        view === "library" ? renderLibrary() : view === "about" ? renderAbout() : renderDiscover()
      );
    }

    return HackerTubePage;
  }

  function applyOpen(opened, itemId) {
    if (opened[itemId]) return opened;
    var next = Object.assign({}, opened);
    next[itemId] = true;
    return next;
  }

  return {
    DEMO_QUESTION: DEMO_QUESTION,
    DISCLOSURE: DISCLOSURE,
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
    applySave: applySave,
    applyDismiss: applyDismiss,
    applyOpen: applyOpen,
    creatorLine: creatorLine,
    lengthLine: lengthLine,
    destinationLabel: destinationLabel,
  };
});
