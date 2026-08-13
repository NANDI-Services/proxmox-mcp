import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

const expectedRepositoryUrl = "https://github.com/NANDI-Services/proxmox-mcp";
const expectedRepositoryGitUrl = "git+https://github.com/NANDI-Services/proxmox-mcp.git";
const expectedIssuesUrl = "https://github.com/NANDI-Services/proxmox-mcp/issues";
const expectedHomepage = "https://github.com/NANDI-Services/proxmox-mcp#readme";
const expectedMcpName = "io.github.NANDI-Services/nandi-proxmox-mcp";
const expectedPackageName = "nandi-proxmox-mcp";
const expectedOwner = "NANDI-Services";

const readJson = async (relativePath) => {
  const absolutePath = resolve(root, relativePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
};

const packageJson = await readJson("package.json");
const manifest = await readJson("mcp-manifest.json");
const descriptor = await readJson(".mcp/server.json");
const marketplaceDescriptor = await readJson("marketplace/mcp-registry/server.json");
const pluginManifest = await readJson("marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/plugin.json");
const marketplaceManifest = await readJson("marketplace/agent-plugin-marketplace/.github/plugin/marketplace.json");
const pluginMcpConfig = await readJson("marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/.mcp.json");

const errors = [];
const expect = (condition, message) => {
  if (!condition) {
    errors.push(message);
  }
};

expect(packageJson.name === expectedPackageName, `package name must be ${expectedPackageName}`);
expect(packageJson.mcpName === expectedMcpName, `package mcpName must be ${expectedMcpName}`);
expect(packageJson.repository?.type === "git", "package repository.type must be git");
expect(packageJson.repository?.url === expectedRepositoryGitUrl, `package repository.url must be ${expectedRepositoryGitUrl}`);
expect(packageJson.homepage === expectedHomepage, `package homepage must be ${expectedHomepage}`);
expect(packageJson.bugs?.url === expectedIssuesUrl, `package bugs.url must be ${expectedIssuesUrl}`);
expect(packageJson.publishConfig?.access === "public", "publishConfig.access must be public");
expect(packageJson.publishConfig?.provenance === true, "publishConfig.provenance must be true");
expect(packageJson.main === "dist/src/index.js", "package main must be dist/src/index.js");
expect(packageJson.bin?.[expectedPackageName] === "dist/src/cli/main.js", "package bin path must be dist/src/cli/main.js");
expect(packageJson.exports?.["."] === "./dist/src/index.js", "package exports['.'] must target dist/src/index.js");
expect(Array.isArray(packageJson.files) && packageJson.files.includes(".mcp/server.json"), "package files must include .mcp/server.json");
expect(
  Array.isArray(packageJson.files) && packageJson.files.includes("marketplace/mcp-registry/server.json"),
  "package files must include marketplace/mcp-registry/server.json"
);

expect(descriptor.name === expectedMcpName, "descriptor name must match package mcpName");
expect(descriptor.repository?.url === expectedRepositoryUrl, `descriptor repository.url must be ${expectedRepositoryUrl}`);
expect(descriptor.packages?.[0]?.identifier === expectedPackageName, `descriptor package identifier must be ${expectedPackageName}`);
expect(descriptor.packages?.[0]?.transport?.type === "stdio", "descriptor transport must be stdio");

expect(JSON.stringify(descriptor) === JSON.stringify(marketplaceDescriptor), "registry descriptors must be identical");

expect(pluginManifest.id === expectedPackageName, `plugin id must be ${expectedPackageName}`);
expect(pluginManifest.repository === expectedRepositoryUrl, `plugin repository must be ${expectedRepositoryUrl}`);
expect(pluginManifest.homepage === expectedRepositoryUrl, `plugin homepage must be ${expectedRepositoryUrl}`);
expect(pluginManifest.support === expectedIssuesUrl, `plugin support must be ${expectedIssuesUrl}`);
expect(pluginManifest.publisher === expectedOwner, `plugin publisher must be ${expectedOwner}`);

// The marketplace descriptor was previously unchecked, which let its support
// URL drift to a repository that does not exist while every gate stayed green.
expect(marketplaceManifest.marketplace?.owner === expectedOwner, `marketplace owner must be ${expectedOwner}`);
expect(
  marketplaceManifest.marketplace?.support === expectedIssuesUrl,
  `marketplace support must be ${expectedIssuesUrl}`
);
expect(
  Array.isArray(marketplaceManifest.plugins) &&
    marketplaceManifest.plugins.some((entry) => entry?.id === expectedPackageName),
  `marketplace plugins must list ${expectedPackageName}`
);
// `.mcp.json` is Claude Code's filename and its root key is `mcpServers`; the
// `servers` root belongs to `.vscode/mcp.json`. See src/config/clients.ts,
// which is the authority both this file and setup follow.
const pluginServer = pluginMcpConfig?.mcpServers?.[expectedPackageName];
expect(pluginServer !== undefined, `plugin .mcp.json must define mcpServers.${expectedPackageName}`);
expect(pluginServer?.command === "npx", "plugin .mcp.json command must be npx");

const pluginArgs = pluginServer?.args;
expect(Array.isArray(pluginArgs), "plugin .mcp.json args must be an array");
expect(pluginArgs?.[0] === `${expectedPackageName}@${packageJson.version}`, "plugin .mcp.json must pin the published npm version");
expect(pluginArgs?.[1] === "run", "plugin .mcp.json args[1] must be run");

// A published plugin runs on someone else's machine, so it cannot name a path.
// It used to point NANDI_PROXMOX_CONFIG at `${workspaceFolder}\.nandi-proxmox-mcp\config.json`:
// a VS Code variable, Windows separators, and the legacy filename the
// multi-instance layout stopped writing. Installing it produced a server that
// could not start, and nothing here opened the env block to notice.
// The server discovers the config itself now, so the key must simply be absent.
const pluginEnv = pluginServer?.env ?? {};
expect(
  pluginEnv.NANDI_PROXMOX_CONFIG === undefined,
  "plugin .mcp.json must not set NANDI_PROXMOX_CONFIG: the path differs per machine and the server discovers it"
);

for (const [key, value] of Object.entries(pluginEnv)) {
  const text = String(value);
  expect(
    !/[\\/]|\$\{|%[A-Za-z_]+%/.test(text),
    `plugin .mcp.json env.${key} must not contain a path or a client-specific variable (got "${text}")`
  );
}

// Shipping the permissive default to people who install by one click is the
// wrong way round: the server defaults to `full`, so the plugin states the
// restricted tier explicitly.
expect(
  pluginEnv.PVE_ACCESS_TIER === "read-only",
  "plugin .mcp.json must set PVE_ACCESS_TIER=read-only; the server default is full"
);

expect(manifest.id === expectedPackageName, `manifest id must be ${expectedPackageName}`);
expect(manifest.runtime?.command === "npx", "manifest runtime.command must be npx");
expect(Array.isArray(manifest.runtime?.args), "manifest runtime.args must be an array");
expect(manifest.runtime?.args?.[0] === expectedPackageName, "manifest runtime args[0] must be the package name");
expect(manifest.runtime?.args?.[1] === "run", "manifest runtime args[1] must be run");

// Versions that live in *code* rather than in a manifest.
//
// This gate used to cover only the JSON artifacts below, so these two drifted
// unnoticed and 0.3.1 shipped introducing itself to MCP clients as 0.2.4. Every
// site `scripts/set-version.mjs` writes has to be checked here: a writer that
// touches a place the validator does not look is exactly how that happened.
const readSourceVersion = async (relativePath, pattern, label) => {
  const source = await readFile(resolve(root, relativePath), "utf8");
  const match = source.match(pattern);
  expect(match !== null, `${label}: no version literal found in ${relativePath}; the file changed shape`);
  return match?.[1];
};

const cliVersion = await readSourceVersion("src/cli/main.ts", /\.version\("([^"]*)"\)/, "CLI --version");
const serverInfoVersion = await readSourceVersion(
  "src/server/mcpServer.ts",
  /name: "nandi-proxmox-mcp",\s*\n\s*version: "([^"]*)"/,
  "MCP serverInfo"
);

const goLiveDoc = await readFile(resolve(root, "docs/MARKETPLACE_GO_LIVE.md"), "utf8");
const goLivePins = [...goLiveDoc.matchAll(/npx nandi-proxmox-mcp@([\d.]+)/g)].map((match) => match[1]);
expect(goLivePins.length > 0, "MARKETPLACE_GO_LIVE must pin the published version in its examples");

const versionedArtifacts = [
  ["package.json", packageJson.version],
  [".mcp/server.json", descriptor.version],
  ["marketplace/mcp-registry/server.json", marketplaceDescriptor.version],
  ["marketplace plugin.json", pluginManifest.version],
  ["descriptor package version", descriptor.packages?.[0]?.version],
  ["src/cli/main.ts --version", cliVersion],
  // The one clients display. A stale value here sends a bug report to the
  // wrong version and nothing else notices.
  ["src/server/mcpServer.ts serverInfo", serverInfoVersion],
  ...goLivePins.map((pin, index) => [`docs/MARKETPLACE_GO_LIVE.md pin #${index + 1}`, pin])
];

for (const [label, value] of versionedArtifacts) {
  expect(value === packageJson.version, `${label} must match package.json version ${packageJson.version} (got ${value})`);
}

if (errors.length > 0) {
  console.error("Package metadata validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      package: packageJson.name,
      version: packageJson.version,
      repository: packageJson.repository.url,
      descriptor: descriptor.name,
      pluginVersion: pluginManifest.version
    },
    null,
    2
  )
);
