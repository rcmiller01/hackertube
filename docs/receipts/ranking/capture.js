const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const OUT = __dirname;
const REPO = path.resolve(__dirname, "../../..");
const BASE = "http://127.0.0.1:9119/hackertube";
const CODE = "b09714354a7ae4685b5fb5874025285ad75d723c";
const pluginCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
const hermesVersion = (process.env.HACKERTUBE_HERMES_VERSION || "").trim();
const walkPath = path.join(OUT, "walk.log");
fs.writeFileSync(walkPath, "");

const hosts = new Set();
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
    /* ignore a non-URL request */
  }
}

async function shot(page, name) {
  const file = path.join(OUT, name + ".png");
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function shotLocator(locator, name) {
  const file = path.join(OUT, name + ".png");
  await locator.screenshot({ path: file });
  return file;
}

async function dismissBanner(page) {
  const thanks = page.getByRole("button", { name: "No thanks" });
  if (await thanks.count()) {
    await thanks.first().click();
    await thanks.first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    log("dismissed host shared-metrics banner");
  }
}

async function addInterest(page, text) {
  await page.locator("#hackertube-interest").fill(text);
  const done = page.waitForResponse((res) => res.url().includes("/profile/interests") && res.status() === 200);
  const feed = page.waitForResponse((res) => res.url().includes("/api/plugins/hackertube/feed") && res.status() === 200);
  await page.getByRole("button", { name: "Add interest" }).click();
  const saved = await done;
  const ranked = await feed;
  const body = await ranked.json();
  log("interest " + text + " feed personalized=" + body.personalized + " paid_calls=" + body.paid_calls + " feed=" + body.feed.length);
  if (body.paid_calls !== 0) throw new Error("paid_calls " + body.paid_calls);
  if (!saved.ok()) throw new Error("interest save failed");
  return body;
}

(async () => {
  if (pluginCommit !== CODE) throw new Error("capture is not at G " + pluginCommit);
  log("command NODE_PATH=/tmp/pw/node_modules node docs/receipts/ranking/capture.js");
  log("pluginCommit " + pluginCommit);
  log("codeCommit " + CODE);
  log("hermesVersion " + hermesVersion);
  log("base " + BASE);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("request", (req) => record(req.url()));
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator(".hackertube h1").waitFor();
  await dismissBanner(page);
  await page.locator("#hackertube-feed-note").waitFor();
  const emptyNote = await page.locator("#hackertube-feed-note").innerText();
  if (!emptyNote.includes("Nothing here is ranked for you yet")) throw new Error("FEED07 " + emptyNote);
  if ((await page.locator("text=not matched").count()) !== 0) throw new Error("FEED07 labeled browse as not matched");
  log("FEED07 empty profile kept the unranked catalog");

  const sparse = await addInterest(page, "AI");
  if (sparse.personalized !== true || sparse.feed.length !== 0) throw new Error("FEED06 AI ranked fill");
  if (Object.keys(sparse.why || {}).length !== 0) throw new Error("FEED06 why on an empty rank");
  await page.locator("#hackertube-coverage").waitFor();
  const coverage = await page.locator("#hackertube-coverage").innerText();
  if (!coverage.includes("Coverage is limited")) throw new Error(coverage);
  const rankedSparse = await page.locator("#ranked-feed").innerText();
  if (/The Python Show|Pride and Prejudice|recommended/i.test(rankedSparse)) {
    throw new Error("FEED06 ranked text " + rankedSparse.slice(0, 240));
  }
  const podcastsSparse = page.locator("#podcasts");
  await podcastsSparse.scrollIntoViewIfNeeded();
  const podcastsSparseText = await podcastsSparse.innerText();
  if (!podcastsSparseText.includes("0 matches")) throw new Error(podcastsSparseText.slice(0, 240));
  if (!podcastsSparseText.includes("More in Podcasts, not matched to your interests")) {
    throw new Error("missing browse heading");
  }
  if (!podcastsSparseText.includes("The Python Show")) throw new Error("browse group hidden");
  if (await page.locator("#podcasts-browse .ht-why").count()) throw new Error("browse why-line");
  if (/recommended/i.test(podcastsSparseText)) throw new Error("browse used recommended");
  await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
  await shot(page, "01-zero-match-coverage");
  await shotLocator(podcastsSparse, "02-zero-match-podcasts");
  log("FEED06 zero-match section shows the coverage note and a labeled browse group");
  log("sparse podcasts " + JSON.stringify({
    matches: sparse.sections.podcasts.match_count,
    browse: sparse.sections.podcasts.browse_count,
  }));

  const ranked = await addInterest(page, "Jane Austen");
  if (ranked.personalized !== true) throw new Error("ranked feed not personalized");
  if (ranked.feed.length !== 10) throw new Error("ranked length " + ranked.feed.length);
  if (ranked.sections.podcasts.match_count !== 2 || ranked.sections.podcasts.browse_count !== 2) {
    throw new Error("podcast counts " + JSON.stringify(ranked.sections.podcasts));
  }
  const whyValues = Object.values(ranked.why || {});
  if (whyValues.length !== ranked.feed.length) throw new Error("why count");
  for (const lines of whyValues) {
    const text = lines.join(". ");
    if (!text.startsWith("Matched interest")) throw new Error("why " + text);
    if (!text.includes("Recent")) throw new Error("expected recent " + text);
    if (/community evidence|hacker news|endorsement|recommended/i.test(text)) throw new Error("invented endorsement " + text);
  }
  const browseIds = ranked.sections.podcasts.browse;
  for (const itemId of browseIds) {
    if (ranked.feed.includes(itemId) || ranked.why[itemId]) throw new Error("browse id in the rank " + itemId);
  }
  await page.locator("#hackertube-ranked-counts").waitFor();
  const counts = await page.locator("#hackertube-ranked-counts").innerText();
  if (counts !== "Videos 0, Podcasts 2, Books 4, Audiobooks 4.") throw new Error(counts);
  const rankedText = await page.locator("#ranked-feed").innerText();
  const whyText = await page.locator("#ranked-feed .ht-why").allInnerTexts();
  if (rankedText.includes("The Python Show")) throw new Error("ranked fill");
  if (!whyText.length || whyText.some((line) => line !== "Matched interest. Recent.")) {
    throw new Error("why lines " + JSON.stringify(whyText));
  }
  if (/Recommended in Hacker News/.test(rankedText)) throw new Error("ranked invented an HN endorsement");
  if (/\b1000\b|\b366\b/.test(rankedText)) throw new Error("score visible");
  await page.locator("#ranked-feed").scrollIntoViewIfNeeded();
  await shot(page, "03-ranked-why");
  const podcasts = page.locator("#podcasts");
  await podcasts.scrollIntoViewIfNeeded();
  const podcastsText = await podcasts.innerText();
  if (!podcastsText.includes("2 matches")) throw new Error(podcastsText.slice(0, 300));
  if (!podcastsText.includes("More in Podcasts, not matched to your interests")) throw new Error("browse heading");
  const matchAt = podcastsText.indexOf("Jane Austen Stories");
  const browseAt = podcastsText.indexOf("not matched to your interests");
  const pythonAt = podcastsText.indexOf("The Python Show");
  if (!(matchAt >= 0 && browseAt > matchAt && pythonAt > browseAt)) {
    throw new Error("order " + JSON.stringify({ matchAt, browseAt, pythonAt }));
  }
  if (await page.locator("#podcasts-matches .ht-why").count() !== 2) throw new Error("match why count");
  if (await page.locator("#podcasts-browse .ht-why").count() !== 0) throw new Error("browse why");
  await shotLocator(podcasts, "04-podcasts-matches-then-browse");
  log("weighted feed why-lines are honest and the podcast section lists matches then browse");

  const paid = [...hosts].filter((host) => PAID.test(host));
  if (paid.length) throw new Error("paid hosts " + paid.join(","));
  const report = {
    codeCommit: CODE,
    pluginCommit,
    hermesVersion,
    paidCalls: ranked.paid_calls,
    rankedCount: ranked.feed.length,
    why: whyValues[0],
    podcasts: {
      match_count: ranked.sections.podcasts.match_count,
      browse_count: ranked.sections.podcasts.browse_count,
    },
    sparsePodcasts: {
      match_count: sparse.sections.podcasts.match_count,
      browse_count: sparse.sections.podcasts.browse_count,
    },
    hosts: [...hosts].sort(),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  log("wrote report.json");
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
