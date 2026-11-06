const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const OUT = __dirname;
const REPO = path.resolve(__dirname, "../../..");
const BASE = "http://127.0.0.1:9119/hackertube";
const QUESTION = "What can I read or listen to by Jane Austen?";
const COMMAND = "NODE_PATH=/tmp/pw/node_modules node docs/receipts/dashboard/capture.js";
const pluginCommit = (process.env.HACKERTUBE_PLUGIN_COMMIT || execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" })).trim();
const hermesVersion = (process.env.HACKERTUBE_HERMES_VERSION || "").trim();
const walkPath = path.join(OUT, "walk.log");
fs.writeFileSync(walkPath, "");

const hosts = new Set();
const notes = [];

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
  const bad = compact.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  if (bad.length) {
    throw new Error("axe " + name + " " + JSON.stringify(bad));
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

(async () => {
  log("command " + COMMAND);
  log("pluginCommit " + pluginCommit);
  log("hermesVersion " + hermesVersion);
  log("base " + BASE);
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
  await page.locator("text=Seeded fixture, in capture order.").waitFor();
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
      if (!empty.includes("No videos in this fixture.")) throw new Error(empty);
    } else if (cards < 2) {
      throw new Error(sections[i] + " cards " + cards);
    }
    log("UI02 " + sections[i] + " heading " + JSON.stringify(heading) + " cards " + cards);
    await shot(page, "0" + (3 + i) + "-" + sections[i]);
  }

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

  await tabUntil(page, (info) => info.text === "Focused search", 8);
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

  await tabUntil(page, (info) => info.text === "Save", 20);
  await page.keyboard.press("Enter");
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

  await tabUntil(page, (info) => info.text === "Open at source", 6, true);
  const popupPromise = page.waitForEvent("popup");
  await page.keyboard.press("Enter");
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
  await shot(page, "10-library");
  await axe(page, "library");

  await page.keyboard.press("Shift+Tab");
  await page.locator('.ht-nav a[href="#discover"]').click();
  await page.locator("text=Seeded fixture").waitFor();
  await axe(page, "discover");

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

  const report = {
    pluginCommit: pluginCommit,
    hermesVersion: hermesVersion,
    captureCommand: COMMAND,
    reloadedHeading: reloaded,
    hostTabsBeforePlugin: hostBefore.filter(Boolean).slice(0, 12),
    discoverOutline: discoverFocus,
    openedUrl: openedUrl.split("&")[0],
    afterSearchNewHosts: afterSearchHosts,
    hosts: [...hosts].sort(),
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
