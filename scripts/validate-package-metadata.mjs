import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

const expectedRepositoryUrl = "https://github.com/NANDI-Services/proxmox-mcp";
const expectedRepositoryGitUrl = "git+https://github.com/NANDI-Services/proxmox-mcp.git";
const expectedIssuesUrl = "https://github.com/NANDI-Services/proxmox-mcp/issues";
const expectedHomepage = "https://github.com/NANDI-Services/proxmox-mcp#readme";
const expectedMcpName = "io.github.NANDI-Services/nandi-proxmox-mcp";
const expectedPackageName = "nandi-proxmox-mcp";

const readJson = async (relativePath) => {
  const absolutePath = resolve(root, relativePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
};

const packageJson = await readJson("package.json");
const manifest = await readJson("mcp-manifest.json");
const descriptor = await readJson(".mcp/server.json");
const marketplaceDescriptor = await readJson("marketplace/mcp-registry/server.json");
const pluginManifest = await readJson("marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/plugin.json");
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
expect(pluginMcpConfig?.servers?.[expectedPackageName]?.command === "npx", "plugin .mcp.json command must be npx");

const pluginArgs = pluginMcpConfig?.servers?.[expectedPackageName]?.args;
expect(Array.isArray(pluginArgs), "plugin .mcp.json args must be an array");
expect(pluginArgs?.[0] === `${expectedPackageName}@${packageJson.version}`, "plugin .mcp.json must pin the published npm version");
expect(pluginArgs?.[1] === "run", "plugin .mcp.json args[1] must be run");

expect(manifest.id === expectedPackageName, `manifest id must be ${expectedPackageName}`);
expect(manifest.runtime?.command === "npx", "manifest runtime.command must be npx");
expect(Array.isArray(manifest.runtime?.args), "manifest runtime.args must be an array");
expect(manifest.runtime?.args?.[0] === expectedPackageName, "manifest runtime args[0] must be the package name");
expect(manifest.runtime?.args?.[1] === "run", "manifest runtime args[1] must be run");

const versionedArtifacts = [
  ["package.json", packageJson.version],
  [".mcp/server.json", descriptor.version],
  ["marketplace/mcp-registry/server.json", marketplaceDescriptor.version],
  ["marketplace plugin.json", pluginManifest.version],
  ["descriptor package version", descriptor.packages?.[0]?.version]
];

for (const [label, value] of versionedArtifacts) {
  expect(value === packageJson.version, `${label} must match package.json version ${packageJson.version}`);
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
