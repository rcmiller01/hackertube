"use strict";
const fs = require("fs");
const path = require("path");
const { runBrowserWalk, fixtureItems } = require("../../../tests/browser_net_harness");
runBrowserWalk(fixtureItems()).then((record) => {
  record.scope = "real page; stub API; offline artwork responses; browser request attempts, not live deliveries";
  fs.writeFileSync(path.join(__dirname, "browser-report.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify({ counters: record.counters, phases: record.phases.map((phase) => ({
    phase: phase.phase, local: phase.served.length, free: phase.artwork.length, outside: phase.outside.length,
  })), reopened: record.reopened }, null, 2));
}).catch((err) => { console.error(err); process.exitCode = 1; });
