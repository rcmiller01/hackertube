const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const OUT = __dirname;
const REPO = path.resolve(__dirname, "../../..");
const BASE = "http://127.0.0.1:9119/hackertube";
const QUESTION = "What can I read or listen to by Jane Austen?";
const COMMAND = "NODE_PATH=/tmp/pw/node_modules node docs/receipts/feed/capture.js";
const AFTER = process.argv.includes("--after-restart");
const pluginCommit = (process.env.HACKERTUBE_PLUGIN_COMMIT || execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" })).trim();
const hermesVersion = (process.env.HACKERTUBE_HERMES_VERSION || "").trim();
const walkPath = path.join(OUT, "walk.log");
if (!AFTER) fs.writeFileSync(walkPath, "");

const hosts = new Set();
const notes = [];
const PAID = /openai|anthropic|generativelanguage|exa\.ai|tavily|serpapi|brave\.com|googleapis\.com/;

function log(line) {
  const row = String(line);
  fs.appendFileSync(walkPath, row + "\n");
  console.log(row);
}

function record(url) {
  try {
    hosts.add(new URL(url).host);
  } catch (err) {
    /* ignore */
  }
}

function paidHosts() {
  return [...hosts].filter((host) => PAID.test(host));
}

async function shot(page, name) {
  const file = path.join(OUT, name + ".png");
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function activeInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    const root = document.querySelector(".hackertube");
    return {
      tag: el.tagName,
      text: (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 160),
      id: el.id || "",
      inside: !!(root && root.contains(el)),
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      ariaDisabled: el.getAttribute("aria-disabled"),
    };
  });
}

async function tabUntil(page, pred, max, backwards) {
  let last = await activeInfo(page);
  for (let i = 0; i < max; i += 1) {
    if (pred(last)) {
      log("focus " + last.tag + " " + JSON.stringify(last.text));
      return last;
    }
    const key = backwards ? "Shift+Tab" : "Tab";
    log("key " + key + " from " + last.tag + " " + JSON.stringify(last.text));
    await page.keyboard.press(key);
    last = await activeInfo(page);
  }
  if (pred(last)) {
    log("focus " + last.tag + " " + JSON.stringify(last.text));
    return last;
  }
  throw new Error("tab miss: " + JSON.stringify(last));
}

async function axe(page, name) {
  const results = await new AxeBuilder({ page }).include(".hackertube").analyze();
  const compact = {
    name,
    violations: results.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.length,
      help: item.help,
    })),
  };
  fs.writeFileSync(path.join(OUT, "axe-" + name + ".json"), JSON.stringify(compact, null, 2));
  if (compact.violations.length) {
    throw new Error("axe " + name + " " + JSON.stringify(compact.violations));
  }
  return compact;
}

async function dismissBanner(page) {
  const thanks = page.getByRole("button", { name: "No thanks" });
  if (await thanks.count()) {
    await thanks.first().focus();
    await page.keyboard.press("Enter");
    await thanks.first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    notes.push("dismissed host shared-metrics banner with the keyboard");
  }
}

async function libraryState(page) {
  await page.locator('.ht-nav a[href="#library"]').click();
  await page.waitForFunction(() => {
    const heading = document.querySelector(".hackertube h1");
    return heading && heading.textContent === "Library";
  });
  await page.locator("#podcasts").scrollIntoViewIfNeeded();
  return page.locator("#podcasts").innerText();
}

async function sectionCounts(page) {
  const names = ["videos", "podcasts", "books", "audiobooks"];
  const counts = {};
  for (const name of names) {
    const heading = await page.locator("#" + name + "-heading").innerText();
    const cards = await page.locator("#" + name + " article").count();
    counts[name] = { heading: heading.replace(/\s+/g, " ").trim(), cards };
  }
  return counts;
}

(async () => {
  log("command " + COMMAND + (AFTER ? " --after-restart" : ""));
  log("pluginCommit " + pluginCommit);
  log("hermesVersion " + hermesVersion);
  log("base " + BASE);
  if (AFTER) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on("request", (req) => record(req.url()));
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.locator(".hackertube h1").waitFor();
    await dismissBanner(page);
    const interest = await page.locator(".ht-interest-list").innerText();
    const interestLines = interest.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!interestLines.includes("gardening")) throw new Error("PREF01 restart missing gardening " + interest);
    if (!interestLines.includes("AI")) throw new Error("AI interest missing " + interest);
    if (!interestLines.includes("C++")) throw new Error("C++ interest missing " + interest);
    if (!interest.includes(QUESTION)) throw new Error("demo question interest missing " + interest);
    const count = await page.locator('.ht-nav a[href="#library"]').innerText();
    if (!count.includes("(1 saved)")) throw new Error("LIB02 restart count " + count);
    await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
    const ranked = await page.locator("#ranked-feed").innerText();
    const podcasts = await page.locator("#podcasts").innerText();
    if (ranked.includes("Jane Austen Stories") || podcasts.includes("Jane Austen Stories")) {
      throw new Error("FEED05 restart still shows the dismissed show");
    }
    if (podcasts.includes("The Python Show")) throw new Error("ranked podcasts still list The Python Show");
    await shot(page, "24-pref01-after-restart");
    log("PREF01 gardening and the demo question retained after Hermes restart");
    const podcast = await libraryState(page);
    if (!podcast.includes("Saved") || !podcast.includes("Opened") || !podcast.includes("Not completed")) {
      throw new Error("LIB02 restart library " + podcast.slice(0, 400));
    }
    if (!podcast.includes("Dismissed")) throw new Error("FEED05 dismissal missing from the library");
    if (podcast.includes("Completed") && !podcast.includes("Not completed")) throw new Error("completion changed");
    await shot(page, "21-lib02-after-restart");
    log("LIB02 saved item and open event retained after Hermes restart");
    log("FEED05 dismissed item stayed out of the discovery feed after restart");
    const reportPath = path.join(OUT, "report.json");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    report.afterRestart = {
      pluginCommit: pluginCommit,
      libraryCount: count,
      interest: interest.replace(/\s+/g, " ").trim(),
      opened: podcast.includes("Opened"),
      notCompleted: podcast.includes("Not completed"),
      dismissedKeptOut: true,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    if (paidHosts().length) throw new Error("paid hosts " + paidHosts().join(","));
    log("wrote report.json restart");
    await browser.close();
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("request", (req) => record(req.url()));
  page.on("console", (msg) => {
    if (msg.type() === "error") notes.push("console " + msg.text().slice(0, 180));
  });

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator(".hackertube h1").waitFor();
  await dismissBanner(page);
  await page.locator("text=Seeded catalog, in capture order.").waitFor();
  await page.locator("#hackertube-feed-note").waitFor();
  const feed07 = await page.locator("#hackertube-feed-note").innerText();
  if (!feed07.includes("Nothing here is ranked for you yet")) throw new Error("FEED07 " + feed07);
  if (/personalized recommendations/i.test(feed07)) throw new Error("FEED07 claimed personalized results");
  const noInterest = await sectionCounts(page);
  log("FEED07 sections " + JSON.stringify(noInterest));
  if (noInterest.videos.cards !== 0) throw new Error("videos " + noInterest.videos.cards);
  if (noInterest.podcasts.cards !== 4 || noInterest.books.cards !== 4 || noInterest.audiobooks.cards !== 4) {
    throw new Error("no-interest sections " + JSON.stringify(noInterest));
  }
  const podcastsBefore = await page.locator("#podcasts").innerText();
  if (!podcastsBefore.includes("The Python Show")) throw new Error("no-interest podcasts dropped The Python Show");
  await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
  await shot(page, "31-feed07-no-interests");
  await shot(page, "01-discover-top");

  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".hackertube h1").waitFor();
  await dismissBanner(page);
  const reloaded = await page.locator(".hackertube h1").innerText();
  const navHref = await page.locator('a[href="/hackertube"]').first().getAttribute("href");
  log("UI01 heading " + JSON.stringify(reloaded) + " nav " + navHref);
  if (reloaded !== "HackerTube") throw new Error("reload heading " + reloaded);
  if (navHref !== "/hackertube") throw new Error("nav href");
  await shot(page, "02-after-reload");

  const sections = ["videos", "podcasts", "books", "audiobooks"];
  const labels = ["Videos", "Podcasts", "Books", "Audiobooks"];
  for (let i = 0; i < sections.length; i += 1) {
    await page.locator("#" + sections[i]).scrollIntoViewIfNeeded();
    const heading = await page.locator("#" + sections[i] + "-heading").innerText();
    if (!heading.startsWith(labels[i])) throw new Error("heading " + heading);
    const cards = await page.locator("#" + sections[i] + " article").count();
    if (sections[i] === "videos") {
      if (cards !== 0) throw new Error("videos should be empty, got " + cards);
      const empty = await page.locator("#videos").innerText();
      if (!empty.includes("No videos in this catalog.")) throw new Error(empty);
    } else if (cards < 2) {
      throw new Error(sections[i] + " cards " + cards);
    }
    log("UI02 " + sections[i] + " heading " + JSON.stringify(heading) + " cards " + cards);
    await shot(page, "0" + (3 + i) + "-" + sections[i]);
  }
  await page.locator("#books").scrollIntoViewIfNeeded();
  const candidate = await page.locator("#books").innerText();
  if (!candidate.includes("Source candidate")) throw new Error("FEED03 missing source candidate");
  if (candidate.includes("Recommended in Hacker News")) throw new Error("FEED03 fabricated an endorsement");
  await shot(page, "27-feed03-source-candidate");
  log("FEED03 books are source candidates");

  const media = await page.evaluate(() => ({
    video: document.querySelectorAll(".hackertube video").length,
    audio: document.querySelectorAll(".hackertube audio").length,
    iframe: document.querySelectorAll(".hackertube iframe").length,
    hnCards: Array.from(document.querySelectorAll(".hackertube h3")).filter((node) => /hacker news/i.test(node.textContent)).length,
  }));
  if (media.video || media.audio || media.iframe || media.hnCards) throw new Error("media " + JSON.stringify(media));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("body").focus();
  const hostBefore = [];
  await tabUntil(page, (info) => {
    if (!info.inside) hostBefore.push(info.text);
    return info.inside && info.text === "Discover";
  }, 40);
  const discoverFocus = await activeInfo(page);
  if (discoverFocus.outlineStyle === "none" || discoverFocus.outlineWidth === "0px") {
    throw new Error("discover outline " + JSON.stringify(discoverFocus));
  }
  await shot(page, "12-keyboard-focus");

  await tabUntil(page, (info) => info.text === "Focused search", 12);
  await page.keyboard.press("Enter");
  await page.locator("#hackertube-question").waitFor();
  const inputFocus = await activeInfo(page);
  if (inputFocus.id !== "hackertube-question") throw new Error("input focus " + JSON.stringify(inputFocus));
  if (inputFocus.outlineStyle === "none") throw new Error("input outline");
  const disclosure = await page.locator("#hackertube-disclosure").innerText();
  if (!disclosure.includes("Browsing is free.")) throw new Error("disclosure");
  await page.keyboard.press("Escape");
  const closed = await activeInfo(page);
  if (closed.text !== "Focused search") throw new Error("escape focus " + JSON.stringify(closed));
  if (await page.locator("#hackertube-question").count()) throw new Error("escape left the editor open");

  await page.keyboard.press("Enter");
  await page.locator("#hackertube-question").waitFor();
  await page.keyboard.type(QUESTION);
  const described = await page.locator("#hackertube-question").getAttribute("aria-describedby");
  if (described !== "hackertube-disclosure") throw new Error("describedby");
  await shot(page, "07-search-disclosure");
  await axe(page, "search-open");
  await tabUntil(page, (info) => info.text === "Search", 4);
  const beforeSearchHosts = new Set(hosts);
  await page.keyboard.press("Enter");
  const resultsFocus = await activeInfo(page);
  if (!resultsFocus.text.startsWith("Search results")) throw new Error("results focus " + JSON.stringify(resultsFocus));
  const status = await page.locator(".ht-results [role=status]").innerText();
  if (!status.includes("No search was started")) throw new Error(status);
  const questionLine = await page.locator(".ht-question").innerText();
  if (!questionLine.includes(QUESTION)) throw new Error(questionLine);
  await shot(page, "08-search-results");
  const afterSearchHosts = [...hosts].filter((host) => !beforeSearchHosts.has(host));

  await tabUntil(page, (info) => info.text === "Save", 24);
  const saveDone = page.waitForResponse((res) => res.url().includes("/profile/saves") && res.status() === 200);
  await page.keyboard.press("Enter");
  await saveDone;
  const savedFocus = await activeInfo(page);
  if (savedFocus.text !== "Saved" || savedFocus.ariaDisabled !== "true") {
    throw new Error("saved control " + JSON.stringify(savedFocus));
  }
  const live = await page.locator(".ht-status").first().innerText();
  if (!live.includes("Saved ") || !live.includes("Library has 1 saved")) throw new Error("live " + live);
  const libraryLabel = await page.locator('.ht-nav a[href="#library"]').innerText();
  if (!libraryLabel.includes("(1 saved)")) throw new Error("count " + libraryLabel);
  await page.keyboard.press("Enter");
  const stillOne = await page.locator('.ht-nav a[href="#library"]').innerText();
  if (!stillOne.includes("(1 saved)")) throw new Error("duplicate " + stillOne);
  await shot(page, "09-saved-focus");
  await shot(page, "19-lib01-one-save");
  log("LIB01 second save kept one library record");

  await tabUntil(page, (info) => info.text === "Open at source", 6, true);
  const openDone = page.waitForResponse((res) => res.url().includes("/profile/opens") && res.status() === 200);
  const popupPromise = page.waitForEvent("popup");
  await page.keyboard.press("Enter");
  await openDone;
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  const openedUrl = popup.url();
  log("UI04 opened " + openedUrl.split("&")[0]);
  if (!openedUrl.startsWith("https://podcasts.apple.com/")) throw new Error("opened " + openedUrl.split("&")[0]);
  const videoCards = await page.locator("#videos article").count();
  if (videoCards !== 0) throw new Error("videos rendered cards");
  const stillNoPlayer = await page.locator(".hackertube video, .hackertube iframe, .hackertube audio").count();
  if (stillNoPlayer) throw new Error("player embedded");
  await popup.close();

  await tabUntil(page, (info) => info.text === "About", 30, true);
  await page.keyboard.press("Enter");
  await page.locator(".hackertube h1").waitFor();
  const aboutFocus = await activeInfo(page);
  if (aboutFocus.text !== "About") throw new Error("about focus " + JSON.stringify(aboutFocus));
  const credit = page.locator('.hackertube a[href="https://karpathy.bearblog.dev/hacker-tube/"]');
  await credit.waitFor();
  const box = await credit.boundingBox();
  if (!box || box.y > 680) throw new Error("credit below fold " + JSON.stringify(box));
  const aboutText = await page.locator(".hackertube").innerText();
  log("UI03 credit box " + JSON.stringify(box));
  if (!aboutText.includes("Andrej Karpathy") || !aboutText.includes("independent Hermes adaptation")) {
    throw new Error("about credit missing");
  }
  if (!aboutText.includes("word match") || !aboutText.includes("capture order")) throw new Error("ranking policy missing from About");
  await shot(page, "11-about");
  await axe(page, "about");

  await tabUntil(page, (info) => info.text.startsWith("Library ("), 8);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const heading = document.querySelector(".hackertube h1");
    return heading && heading.textContent === "Library";
  });
  const libraryHeading = await page.locator(".hackertube h1").innerText();
  if (libraryHeading !== "Library") throw new Error(libraryHeading);
  const libraryFocus = await activeInfo(page);
  if (libraryFocus.text !== "Library") throw new Error("library focus " + JSON.stringify(libraryFocus));
  const podcastLibrary = await page.locator("#podcasts").innerText();
  if (!podcastLibrary.includes("Saved")) throw new Error("library missing saved card");
  const videoLibrary = await page.locator("#videos").innerText();
  if (!videoLibrary.includes("No saved videos.")) throw new Error(videoLibrary);
  if (!podcastLibrary.includes("Opened") || !podcastLibrary.includes("Not completed")) {
    throw new Error("LIB03 library " + podcastLibrary.slice(0, 400));
  }
  await shot(page, "10-library");
  await page.locator("#podcasts").scrollIntoViewIfNeeded();
  await shot(page, "22-lib03-opened-not-completed");
  log("LIB03 open recorded and completion unchanged");
  await axe(page, "library");

  await page.keyboard.press("Shift+Tab");
  await page.locator('.ht-nav a[href="#discover"]').click();
  await page.locator("text=Seeded catalog").waitFor();
  await axe(page, "discover");

  log("a11y empty alert");
  if (await page.locator("#hackertube-question").count() === 0) {
    await page.getByRole("button", { name: "Focused search" }).click();
    await page.locator("#hackertube-question").waitFor();
  }
  await page.locator("#hackertube-question").fill("");
  await page.locator("#hackertube-search-panel").getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForFunction(() => {
    const el = document.activeElement;
    return el && el.getAttribute("role") === "alert" && (el.textContent || "").indexOf("Enter a question") !== -1;
  });
  log("a11y alert focus " + JSON.stringify(await activeInfo(page)));
  await shot(page, "16-focused-alert");

  log("a11y section heading");
  await page.locator('.ht-sections a[href="#podcasts"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "podcasts-heading");
  log("a11y section focus " + JSON.stringify(await activeInfo(page)));
  await shot(page, "17-focused-section");

  log("a11y text links");
  await page.locator('.ht-nav a[href="#about"]').click();
  const creditLink = page.locator('a.ht-text-link[href="https://karpathy.bearblog.dev/hacker-tube/"]');
  await creditLink.waitFor();
  const linkStyle = await creditLink.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      height: el.getBoundingClientRect().height,
      decoration: cs.textDecorationLine,
      className: el.className,
    };
  });
  log("a11y link style " + JSON.stringify(linkStyle));
  if (linkStyle.height < 40) throw new Error("text link shorter than 40px");
  if (String(linkStyle.decoration).indexOf("underline") === -1) throw new Error("text link not underlined");
  log("a11y evidence text links " + await page.locator(".ht-evidence a.ht-text-link").count());
  await shot(page, "18-underlined-links");

  log("FEED04 refresh");
  await page.locator('.ht-nav a[href="#discover"]').click();
  await page.locator("#hackertube-feed-note").waitFor();
  const beforeRefresh = new Set(hosts);
  const refreshDone = page.waitForResponse((res) => res.url().includes("/api/plugins/hackertube/feed") && res.status() === 200);
  await page.getByRole("button", { name: "Refresh prepared catalog" }).click();
  const refreshResponse = await refreshDone;
  const refreshBody = await refreshResponse.json();
  if (refreshBody.paid_calls !== 0) throw new Error("FEED04 paid_calls " + refreshBody.paid_calls);
  if (refreshBody.personalized !== false) throw new Error("FEED04 refresh became personalized");
  const refreshHosts = [...hosts].filter((host) => !beforeRefresh.has(host));
  log("FEED04 new hosts " + JSON.stringify(refreshHosts));
  await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
  await shot(page, "33-feed04-refresh");

  log("LIB02 catalog refresh reload");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await dismissBanner(page);
  const refreshedCount = await page.locator('.ht-nav a[href="#library"]').innerText();
  if (!refreshedCount.includes("(1 saved)")) throw new Error("LIB02 refresh count " + refreshedCount);
  const refreshedPodcast = await libraryState(page);
  if (!refreshedPodcast.includes("Saved") || !refreshedPodcast.includes("Opened") || !refreshedPodcast.includes("Not completed")) {
    throw new Error("LIB02 refresh library " + refreshedPodcast.slice(0, 400));
  }
  await shot(page, "20-lib02-after-reload");
  log("LIB02 reload kept the save and the open");
  await page.locator('.ht-nav a[href="#discover"]').click();
  await page.locator("#hackertube-feed-note").waitFor();

  const narrowContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const narrow = await narrowContext.newPage();
  narrow.on("request", (req) => record(req.url()));
  await narrow.goto(BASE, { waitUntil: "networkidle" });
  await dismissBanner(narrow);
  await narrow.locator(".hackertube h1").waitFor();
  const overflow390 = await narrow.evaluate(() => {
    const root = document.querySelector(".hackertube");
    const grid = getComputedStyle(document.querySelector(".ht-grid"));
    return {
      rootWider: root.scrollWidth > root.clientWidth + 1,
      docWider: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      columns: grid.gridTemplateColumns,
    };
  });
  if (overflow390.rootWider) throw new Error("390 root overflow " + JSON.stringify(overflow390));
  if (overflow390.columns.split(" ").length !== 1) throw new Error("390 columns " + overflow390.columns);
  await shot(narrow, "14-width-390");
  await axe(narrow, "width-390");

  const midContext = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const mid = await midContext.newPage();
  await mid.goto(BASE, { waitUntil: "networkidle" });
  await dismissBanner(mid);
  const columns768 = await mid.evaluate(() => getComputedStyle(document.querySelector(".ht-grid")).gridTemplateColumns);
  if (columns768.split(" ").length !== 1) throw new Error("768 columns " + columns768);
  await shot(mid, "15-width-768");

  const unsafeContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const unsafe = await unsafeContext.newPage();
  await unsafe.addInitScript(() => sessionStorage.setItem("hackertube-unsafe-check", "1"));
  await unsafe.goto(BASE + "?ht_unsafe=1", { waitUntil: "networkidle" });
  await dismissBanner(unsafe);
  await unsafe.locator("#unsafe-heading").scrollIntoViewIfNeeded();
  const unsafeText = await unsafe.locator(".hackertube").innerText();
  if (!unsafeText.includes("does not use https")) throw new Error("scheme refusal missing");
  if (!unsafeText.includes("private-network")) throw new Error("private refusal missing");
  const badLinks = await unsafe.evaluate(() => Array.from(document.querySelectorAll(".hackertube a")).map((a) => a.getAttribute("href") || "").filter((href) => /^(javascript:|data:|file:|http:)/.test(href) || /^https:\/\/(127\.|localhost|10\.|192\.168\.|\[::1\])/.test(href)));
  log("UI05 scheme " + unsafeText.includes("does not use https") + " private " + unsafeText.includes("private-network") + " badLinks " + badLinks.length);
  if (badLinks.length) throw new Error("unsafe link rendered " + badLinks.join(","));
  await shot(unsafe, "13-unsafe");

  async function addInterest(text) {
    await page.locator("#hackertube-interest").fill(text);
    const done = page.waitForResponse((res) => res.url().includes("/profile/interests") && res.status() === 200);
    await page.getByRole("button", { name: "Add interest" }).click();
    await done;
    await page.locator(".ht-interest-list li", { hasText: new RegExp("^" + text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }).waitFor();
  }

  async function assertSparse(label) {
    await page.locator("#hackertube-coverage").waitFor();
    const coverage = await page.locator("#hackertube-coverage").innerText();
    if (!coverage.includes("Coverage is limited")) throw new Error(label + " " + coverage);
    if (await page.locator("#hackertube-feed-note").count()) throw new Error(label + " showed the empty-profile note");
    const emptyPodcasts = await page.locator("#podcasts").innerText();
    const emptyBooks = await page.locator("#books").innerText();
    if (emptyPodcasts.includes("The Python Show") || emptyPodcasts.includes("Jane Austen Stories") || emptyBooks.includes("Pride and Prejudice")) {
      throw new Error(label + " filled a section " + emptyPodcasts.slice(0, 180));
    }
    if (!emptyPodcasts.includes("No podcasts match these interests.")) throw new Error(emptyPodcasts.slice(0, 240));
  }

  log("FEED06 store AI");
  await page.locator("#hackertube-interest").waitFor();
  await addInterest("AI");
  await assertSparse("FEED06 AI");
  await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
  await shot(page, "35-feed06-ai");
  log("FEED06 AI has no seeded match and did not fill the catalog");

  log("FEED06 store C++");
  await addInterest("C++");
  await assertSparse("FEED06 C++");
  await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
  await shot(page, "36-feed06-cpp");
  await shot(page, "30-feed06-no-match");
  log("FEED06 C++ has no seeded match and did not fill the catalog");

  log("FEED06 add gardening");
  await page.locator("#hackertube-interest").waitFor();
  await page.locator("#hackertube-interest").fill("gardening");
  const interestDone = page.waitForResponse((res) => res.url().includes("/profile/interests") && res.status() === 200);
  await page.getByRole("button", { name: "Add interest" }).click();
  await interestDone;
  await page.locator(".ht-interest-list li", { hasText: /^gardening$/ }).waitFor();
  await page.locator("#hackertube-coverage").waitFor();
  const coverage = await page.locator("#hackertube-coverage").innerText();
  if (!coverage.includes("Coverage is limited")) throw new Error("FEED06 " + coverage);
  const note = await page.locator("#hackertube-interest-note").innerText();
  if (!note.includes("not limited to technology")) throw new Error("coverage note");
  const emptyPodcasts = await page.locator("#podcasts").innerText();
  if (emptyPodcasts.includes("The Python Show") || emptyPodcasts.includes("Jane Austen Stories")) {
    throw new Error("FEED06 filled the podcast section " + emptyPodcasts.slice(0, 240));
  }
  if (!emptyPodcasts.includes("No podcasts match these interests.")) throw new Error(emptyPodcasts.slice(0, 240));
  await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
  await shot(page, "23-pref01-gardening");
  log("FEED06 gardening has no seeded match");

  log("FEED01 store the demo question");
  await page.locator("#hackertube-interest").fill(QUESTION);
  const questionDone = page.waitForResponse((res) => res.url().includes("/profile/interests") && res.status() === 200);
  await page.getByRole("button", { name: "Add interest" }).click();
  await questionDone;
  await page.locator("#hackertube-ranked-counts").waitFor();
  const rankedCounts = await page.locator("#hackertube-ranked-counts").innerText();
  log("FEED01 counts " + rankedCounts);
  if (rankedCounts !== "Videos 0, Podcasts 2, Books 4, Audiobooks 4.") throw new Error(rankedCounts);
  const signals = await page.locator("#hackertube-signals").innerText();
  if (!signals.includes("interest word match") || !signals.includes("capture order") || !signals.includes("unexpired catalog evidence")) {
    throw new Error("FEED02 " + signals);
  }
  const rankedText = await page.locator("#ranked-feed").innerText();
  const rankedPodcasts = await page.locator("#podcasts").innerText();
  if (rankedText.includes("The Python Show") || rankedPodcasts.includes("The Python Show")) {
    throw new Error("demo question still lists The Python Show");
  }
  if (rankedText.includes("The Future of Python Security") || rankedPodcasts.includes("The Future of Python Security")) {
    throw new Error("demo question still lists the Python episode");
  }
  if (!rankedPodcasts.includes("Jane Austen Stories") || !rankedPodcasts.includes("A Jane Austen Year")) {
    throw new Error("ranked podcasts " + rankedPodcasts.slice(0, 300));
  }
  if (rankedText.includes("Recommended in Hacker News")) throw new Error("ranked feed fabricated an endorsement");
  if (!rankedText.includes("Source candidate")) throw new Error("ranked feed missing source candidate");
  await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
  await shot(page, "25-feed01-ranked");
  await shot(page, "26-feed02-signals");
  await page.locator("#podcasts").scrollIntoViewIfNeeded();
  await shot(page, "34-feed-podcasts-ranked");
  log("FEED01 ranked feed dropped the two Python records");

  log("FEED04 show more");
  const beforeMore = await page.locator("#ranked-feed article").count();
  const showMore = page.locator("#ranked-feed").getByRole("button", { name: "Show more" });
  await showMore.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const el = document.activeElement;
    return el && el.tagName === "H3" && el.tabIndex === -1 && el.id === "ht-expanded-ranked";
  });
  const afterMore = await page.locator("#ranked-feed article").count();
  const moreFocus = await activeInfo(page);
  const expandLive = await page.locator("#hackertube-expand-live").innerText();
  log("FEED04 ranked cards " + beforeMore + " then " + afterMore);
  log("show more activeElement " + JSON.stringify(moreFocus));
  log("show more live " + JSON.stringify(expandLive));
  if (!(beforeMore === 4 && afterMore === 10)) throw new Error("paging " + beforeMore + " " + afterMore);
  if (moreFocus.tag !== "H3" || moreFocus.text !== "Sense and Sensibility") {
    throw new Error("show more focus " + JSON.stringify(moreFocus));
  }
  if (expandLive !== "10 of 10") throw new Error("expand live " + expandLive);
  await page.locator("#ht-expanded-ranked").scrollIntoViewIfNeeded();
  await shot(page, "37-show-more-focus");
  await shot(page, "28-feed04-show-more");

  log("FEED05 dismiss Jane Austen Stories");
  const dismissCard = page.locator("#podcasts article", { hasText: "Jane Austen Stories" });
  const dismissDone = page.waitForResponse((res) => res.url().includes("/profile/dismissals") && res.status() === 200);
  await dismissCard.getByRole("button", { name: "Dismiss" }).click();
  await dismissDone;
  await page.waitForFunction(() => {
    const node = document.querySelector("#podcasts");
    return node && node.textContent.indexOf("Jane Austen Stories") === -1;
  });
  const afterDismiss = await page.locator("#podcasts").innerText();
  const rankedAfter = await page.locator("#ranked-feed").innerText();
  if (afterDismiss.includes("Jane Austen Stories") || rankedAfter.includes("Jane Austen Stories")) {
    throw new Error("FEED05 card remained");
  }
  if (!afterDismiss.includes("A Jane Austen Year")) throw new Error("FEED05 dropped the other show");
  const dismissStatus = await page.locator(".ht-status").first().innerText();
  if (!dismissStatus.includes("stays out of the discovery feed")) throw new Error(dismissStatus);
  await page.locator("#podcasts").scrollIntoViewIfNeeded();
  await shot(page, "29-feed05-dismissed");
  log("FEED05 dismissed show left the discovery feed");

  await page.goto(BASE, { waitUntil: "networkidle" });
  await dismissBanner(page);
  await page.locator("#hackertube-ranked-counts").waitFor();
  const reloadedPodcasts = await page.locator("#podcasts").innerText();
  const reloadedRanked = await page.locator("#ranked-feed").innerText();
  if (reloadedPodcasts.includes("Jane Austen Stories") || reloadedRanked.includes("Jane Austen Stories")) {
    throw new Error("FEED05 reload brought the item back");
  }
  if (reloadedPodcasts.includes("The Python Show")) throw new Error("reload listed The Python Show");
  const kept = await page.locator(".ht-interest-list").innerText();
  if (!kept.includes("gardening") || !kept.includes(QUESTION)) throw new Error("interests lost " + kept);
  await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
  await shot(page, "32-feed05-after-reload");
  const libraryAfter = await libraryState(page);
  if (!libraryAfter.includes("Jane Austen Stories") || !libraryAfter.includes("Saved") || !libraryAfter.includes("Dismissed")) {
    throw new Error("library lost the dismissed save " + libraryAfter.slice(0, 400));
  }
  if (!libraryAfter.includes("Not completed")) throw new Error("completion changed after dismiss");
  log("FEED05 dismissal survived a page reload and the save stayed in the library");

  if (paidHosts().length) throw new Error("paid hosts " + paidHosts().join(","));

  const report = {
    pluginCommit: pluginCommit,
    hermesVersion: hermesVersion,
    captureCommand: COMMAND,
    reloadedHeading: reloaded,
    hostTabsBeforePlugin: hostBefore.filter(Boolean).slice(0, 12),
    discoverOutline: discoverFocus,
    openedUrl: openedUrl.split("&")[0],
    afterSearchNewHosts: afterSearchHosts,
    refreshHosts: refreshHosts,
    noInterestSections: noInterest,
    rankedCounts: rankedCounts,
    hosts: [...hosts].sort(),
    paidHosts: paidHosts(),
    overflow390,
    columns768,
    notes,
    axe: ["search-open", "about", "library", "discover", "width-390"],
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  log("UI06 savedFocus " + JSON.stringify(savedFocus));
  log("UI06 outline " + discoverFocus.outlineStyle + " " + discoverFocus.outlineWidth);
  log("wrote report.json");
  await browser.close();
})().catch((err) => {
  console.error("RECEIPT_FAIL", err && err.stack || err);
  process.exit(1);
});
