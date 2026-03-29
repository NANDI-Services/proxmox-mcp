import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const modulePath = resolve(root, "dist", "src", "tools", "catalog.js");
const { toolCatalog, toolCountByCategory } = await import(`file://${modulePath.replaceAll("\\", "/")}`);

const lines = [];
lines.push("# Tool Catalog");
lines.push("");
lines.push(`Total tools: **${toolCatalog.length}**`);
lines.push("");
lines.push("## Count By Category");
lines.push("");
lines.push("| Category | Tools |");
lines.push("|---|---:|");

const counts = toolCountByCategory();
for (const [category, count] of Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`| ${category} | ${count} |`);
}

lines.push("");
lines.push("## Tools");
lines.push("");
lines.push("| Tool | Category | Tier | Module | Destructive | Confirm | Idempotent | Deprecated |");
lines.push("|---|---|---|---|---|---|---|---|");
for (const tool of toolCatalog) {
  lines.push(
    `| ${tool.name} | ${tool.category} | ${tool.accessTier} | ${tool.module} | ${tool.destructive} | ${tool.confirmRequired} | ${tool.idempotent} | ${tool.deprecated === true} |`
  );
}

const outPath = resolve(root, "docs", "TOOLS.md");
writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Generated ${outPath}`);
