import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "mcp-manifest.json");
const text = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(text);

const errors = [];
if (manifest.schema_version !== "1.0") errors.push("schema_version must be '1.0'");
if (manifest.id !== "nandi-proxmox-mcp") errors.push("id must be nandi-proxmox-mcp");
if (manifest.transport !== "stdio") errors.push("transport must be stdio");
if (!manifest.runtime || manifest.runtime.command !== "npx") errors.push("runtime.command must be npx");
if (!manifest.runtime || !Array.isArray(manifest.runtime.args) || manifest.runtime.args[0] !== "nandi-proxmox-mcp" || manifest.runtime.args[1] !== "run") {
  errors.push("runtime.args must begin with ['nandi-proxmox-mcp','run']");
}
if (!manifest.docs?.quickstart || !manifest.docs?.security || !manifest.docs?.troubleshooting) {
  errors.push("docs.quickstart, docs.security and docs.troubleshooting are required");
}

if (errors.length > 0) {
  console.error("Manifest validation failed:");
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log("Manifest validation OK");
