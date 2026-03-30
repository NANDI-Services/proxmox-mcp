import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [leftArg = ".mcp/server.json", rightArg = "marketplace/mcp-registry/server.json"] = process.argv.slice(2);

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

async function readJson(path) {
  const absolutePath = resolve(process.cwd(), path);
  const text = await readFile(absolutePath, "utf8");
  return JSON.parse(text);
}

const left = normalize(await readJson(leftArg));
const right = normalize(await readJson(rightArg));

if (JSON.stringify(left) !== JSON.stringify(right)) {
  console.error(`Descriptor drift detected between ${leftArg} and ${rightArg}.`);
  console.error("--- left ---");
  console.error(JSON.stringify(left, null, 2));
  console.error("--- right ---");
  console.error(JSON.stringify(right, null, 2));
  process.exit(1);
}

console.log(`Descriptor sync OK: ${leftArg} == ${rightArg}`);
