#!/usr/bin/env node

/**
 * Decides the next version from the commits since the last release tag.
 *
 * The classification logic is exported and pure so it can be tested without a
 * git repository: this is the code that decides what reaches npm, and a
 * misread commit becomes a published version number that cannot be taken back.
 *
 * Convention (conventional commits, strict semver):
 *   `!` after the type, or a `BREAKING CHANGE:` footer  -> major
 *   feat                                                -> minor
 *   fix, perf, revert                                   -> patch
 *   chore, docs, test, ci, build, style, refactor       -> no release
 *   anything else                                       -> ignored, reported
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const RANK = { none: 0, patch: 1, minor: 2, major: 3 };

const LEVEL_BY_TYPE = {
  feat: "minor",
  fix: "patch",
  perf: "patch",
  revert: "patch",
  chore: "none",
  docs: "none",
  test: "none",
  ci: "none",
  build: "none",
  style: "none",
  refactor: "none"
};

const SUBJECT = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?: (?<summary>.+)$/;

/** `BREAKING CHANGE:` or `BREAKING-CHANGE:` on its own line, per the spec. */
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;

export const classifyCommit = (message) => {
  const text = String(message ?? "");
  const subject = text.split(/\r?\n/, 1)[0]?.trim() ?? "";

  // A merge commit's subject describes the merge, not the change. The commits
  // it brings in are in the log on their own, so counting the merge too would
  // classify the same work twice.
  if (subject.length === 0 || subject.startsWith("Merge ")) {
    return { subject, level: null, reason: "merge or empty" };
  }

  const match = SUBJECT.exec(subject);
  if (!match?.groups) {
    return { subject, level: null, reason: "not a conventional commit" };
  }

  const { type, breaking } = match.groups;

  if (breaking === "!" || BREAKING_FOOTER.test(text)) {
    return { subject, level: "major", reason: "breaking change" };
  }

  const level = LEVEL_BY_TYPE[type];
  if (level === undefined) {
    return { subject, level: null, reason: `unknown type "${type}"` };
  }

  return { subject, level, reason: type };
};

export const classify = (messages) => {
  const considered = [];
  const ignored = [];

  for (const message of messages) {
    const result = classifyCommit(message);
    if (result.level === null) {
      ignored.push(result);
    } else {
      considered.push(result);
    }
  }

  const level = considered.reduce((highest, item) => (RANK[item.level] > RANK[highest] ? item.level : highest), "none");

  return { level, releasable: level !== "none", considered, ignored };
};

export const nextVersion = (current, level) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(current));
  if (!match) {
    throw new Error(`cannot bump "${current}": not a semver version`);
  }

  const [major, minor, patch] = match.slice(1, 4).map(Number);

  switch (level) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      return `${major}.${minor}.${patch}`;
  }
};

const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();

/** Commit messages since the last `v*` tag, or all of them if none exists. */
export const commitsSinceLastTag = () => {
  let range;
  try {
    range = `${git(["describe", "--tags", "--abbrev=0", "--match", "v*"])}..HEAD`;
  } catch {
    range = "HEAD";
  }

  // NUL-separated so bodies containing blank lines survive: the footer is where
  // `BREAKING CHANGE:` lives, and splitting on newlines would lose it.
  const raw = execFileSync("git", ["log", range, "--format=%B%x00"], { encoding: "utf8" });
  return raw.split("\0").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
};

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const current = JSON.parse(readFileSync("package.json", "utf8")).version;
  const messages = commitsSinceLastTag();
  const result = classify(messages);

  process.stdout.write(
    `${JSON.stringify(
      {
        current,
        next: nextVersion(current, result.level),
        level: result.level,
        releasable: result.releasable,
        considered: result.considered.map((item) => `${item.level.padEnd(5)} ${item.subject}`),
        ignored: result.ignored.map((item) => `${item.reason}: ${item.subject}`)
      },
      null,
      2
    )}\n`
  );
}
