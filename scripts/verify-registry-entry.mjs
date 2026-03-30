import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [manifestArg = ".mcp/server.json"] = process.argv.slice(2);
const registryUrl = process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io/v0/servers";

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value && typeof value === "object") {
    const normalizedEntries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .filter(([key, entryValue]) => !(key === "isSecret" && entryValue === false))
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => [key, normalize(entryValue)]);

    return Object.fromEntries(normalizedEntries);
  }

  return value;
}

function fail(message, context) {
  console.error(message);
  if (context) {
    console.error(JSON.stringify(context, null, 2));
  }
  process.exit(1);
}

const manifestPath = resolve(process.cwd(), manifestArg);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expected = normalize(manifest);

const response = await fetch(`${registryUrl}?search=${encodeURIComponent(expected.name)}`, {
  headers: {
    accept: "application/json",
  },
});

if (!response.ok) {
  fail(`Registry query failed with HTTP ${response.status}.`);
}

const payload = await response.json();
const entries = Array.isArray(payload.servers) ? payload.servers : [];
const sameNameEntries = entries.filter((entry) => entry?.server?.name === expected.name);

if (sameNameEntries.length === 0) {
  fail(`Registry entry not found for ${expected.name}.`, payload);
}

const exactVersionEntry = sameNameEntries.find((entry) => entry?.server?.version === expected.version);
if (!exactVersionEntry) {
  fail(`Registry entry for ${expected.name} does not contain version ${expected.version}.`, payload);
}

const live = normalize(exactVersionEntry.server);
if (JSON.stringify(live) !== JSON.stringify(expected)) {
  fail(`Registry drift detected for ${expected.name}@${expected.version}.`, {
    expected,
    live,
  });
}

const officialMeta = exactVersionEntry?._meta?.["io.modelcontextprotocol.registry/official"];
if (officialMeta?.status !== "active") {
  fail(`Registry entry ${expected.name}@${expected.version} is not active.`, officialMeta);
}

console.log(
  JSON.stringify(
    {
      name: expected.name,
      version: expected.version,
      package: expected.packages?.[0]?.identifier,
      status: officialMeta?.status ?? "unknown",
      isLatest: officialMeta?.isLatest ?? null,
      count: sameNameEntries.length,
    },
    null,
    2,
  ),
);
