#!/usr/bin/env node

/**
 * Prepends a section for the version being released.
 *
 * Deliberately terse. The hand-written entries in this file explain *why* a
 * change was made, which no generator can recover from a subject line; this
 * only guarantees that a released version is never absent from the changelog.
 * Rewriting a section afterwards is expected and breaks nothing -- the file is
 * not an input to any gate.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { classify, commitsSinceLastTag } from "./next-version.mjs";

const version = process.argv[2];
const today = process.argv[3] ?? new Date().toISOString().slice(0, 10);

if (!version) {
  console.error("usage: node scripts/write-changelog.mjs <version> [YYYY-MM-DD]");
  process.exit(1);
}

const HEADINGS = [
  ["breaking", "Breaking changes"],
  ["feat", "Added"],
  ["fix", "Fixed"],
  ["perf", "Performance"],
  ["revert", "Reverted"]
];

const bucketFor = (item) => {
  if (item.level === "major") return "breaking";
  if (item.reason === "feat") return "feat";
  if (item.reason === "fix") return "fix";
  if (item.reason === "perf") return "perf";
  if (item.reason === "revert") return "revert";
  return null;
};

const { considered } = classify(commitsSinceLastTag());

const buckets = new Map();
for (const item of considered) {
  const bucket = bucketFor(item);
  if (bucket === null) {
    continue;
  }
  // Drop the `type(scope): ` prefix: the heading already says what it is.
  const summary = item.subject.replace(/^[a-z]+(?:\([^)]*\))?!?:\s*/, "");
  buckets.set(bucket, [...(buckets.get(bucket) ?? []), summary]);
}

const sections = HEADINGS.filter(([key]) => buckets.has(key)).map(
  ([key, heading]) => `### ${heading}\n\n${buckets.get(key).map((line) => `- ${line}`).join("\n")}\n`
);

if (sections.length === 0) {
  console.error(`refusing to write an empty section for ${version}: no releasable commits found`);
  process.exit(1);
}

const entry = `## ${version} - ${today}\n\n${sections.join("\n")}`;

const path = "CHANGELOG.md";
const current = readFileSync(path, "utf8");

if (current.includes(`\n## ${version} - `) || current.startsWith(`# Changelog\n\n## ${version} - `)) {
  console.log(`CHANGELOG already has a ${version} section; leaving it alone`);
  process.exit(0);
}

// Insert under the top-level title so the newest release stays first.
const marker = "# Changelog\n";
if (!current.startsWith(marker)) {
  console.error("CHANGELOG.md does not start with '# Changelog'; refusing to guess where the entry goes");
  process.exit(1);
}

writeFileSync(path, `${marker}\n${entry}\n${current.slice(marker.length).replace(/^\n+/, "")}`, "utf8");
console.log(`CHANGELOG.md: added section for ${version}`);
