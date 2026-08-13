#!/usr/bin/env node

/**
 * Writes one version into every place that carries one.
 *
 * There are eight of them across manifests, descriptors, marketplace mirrors,
 * docs and two TypeScript literals. Editing that by hand is how the published
 * 0.3.1 ended up introducing itself to clients as 0.2.4: the bump touched nine
 * of the nine it knew about and missed the one nobody had written down.
 *
 * Every rule below asserts that it actually matched. A writer that silently
 * skips a target is worse than no writer, because the release then looks done.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("usage: node scripts/set-version.mjs <version>   (e.g. 0.3.2)");
  process.exit(1);
}

/**
 * Each rule replaces by matching the *key or call site*, never the old value:
 * a rule keyed on the previous version silently does nothing the second time
 * it runs, or when one file is already ahead of the others.
 */
const rules = [
  {
    file: "src/cli/main.ts",
    pattern: /(\.version\(")[^"]*("\))/,
    replace: (m, a, b) => `${a}${version}${b}`,
    expect: 1
  },
  {
    file: "src/server/mcpServer.ts",
    pattern: /(name: "nandi-proxmox-mcp",\s*\n\s*version: ")[^"]*(")/,
    replace: (m, a, b) => `${a}${version}${b}`,
    expect: 1
  },
  {
    file: ".mcp/server.json",
    pattern: /("version":\s*")[^"]*(")/g,
    replace: (m, a, b) => `${a}${version}${b}`,
    // Top-level and packages[0]. The registry rejects a descriptor whose
    // package version disagrees with the server version.
    expect: 2
  },
  {
    file: "marketplace/mcp-registry/server.json",
    pattern: /("version":\s*")[^"]*(")/g,
    replace: (m, a, b) => `${a}${version}${b}`,
    expect: 2
  },
  {
    file: "marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/plugin.json",
    pattern: /("version":\s*")[^"]*(")/,
    replace: (m, a, b) => `${a}${version}${b}`,
    expect: 1
  },
  {
    file: "marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/.mcp.json",
    pattern: /("nandi-proxmox-mcp@)[^"]*(")/,
    replace: (m, a, b) => `${a}${version}${b}`,
    expect: 1
  },
  {
    file: "docs/MARKETPLACE_GO_LIVE.md",
    pattern: /(npx nandi-proxmox-mcp@)[\d.]+/g,
    replace: (m, a) => `${a}${version}`,
    expect: 3
  }
];

const failures = [];

/**
 * package.json and the lockfile are edited as parsed JSON rather than by regex:
 * `"version": "..."` appears once per dependency in the lock, so a textual rule
 * would rewrite the whole dependency tree.
 *
 * Not delegated to `npm version` either. Node refuses to spawn `npm.cmd`
 * without a shell on Windows, and a release writer that only runs on the CI
 * runner cannot be tried locally before it is trusted with a publish.
 */
const setJsonVersion = (file, apply) => {
  const path = resolve(root, file);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const touched = apply(doc);

  if (touched === 0) {
    failures.push(`${file}: no version field found where one was expected.`);
    return;
  }

  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
};

setJsonVersion("package.json", (doc) => {
  doc.version = version;
  return 1;
});

setJsonVersion("package-lock.json", (doc) => {
  // lockfileVersion 3 carries the root version twice, and both are read: the
  // top-level one by tooling, `packages[""]` by `npm ci`.
  let touched = 0;
  if ("version" in doc) {
    doc.version = version;
    touched += 1;
  }
  if (doc.packages?.[""]) {
    doc.packages[""].version = version;
    touched += 1;
  }
  return touched === 2 ? touched : 0;
});

for (const rule of rules) {
  const path = resolve(root, rule.file);
  const before = readFileSync(path, "utf8");

  const matches = before.match(rule.pattern);
  const found = matches === null ? 0 : rule.pattern.global ? matches.length : 1;

  if (found !== rule.expect) {
    failures.push(`${rule.file}: expected ${rule.expect} version site(s), found ${found}. The file changed shape; fix this rule.`);
    continue;
  }

  const after = before.replace(rule.pattern, rule.replace);
  if (after !== before) {
    writeFileSync(path, after, "utf8");
  }
}

if (failures.length > 0) {
  console.error("set-version could not write every site:\n  " + failures.join("\n  "));
  process.exit(1);
}

const written = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
if (written !== version) {
  console.error(`package.json says ${written} after npm version ${version}`);
  process.exit(1);
}

console.log(`version ${version} written to package.json, package-lock.json and ${rules.length} other file(s)`);
