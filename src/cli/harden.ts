import { findInstances, instanceRef, sanitizeInstanceName, type InstanceRef, type InstanceScope } from "../config/instances.js";
import { humanGateToolNames, writeHumanGateRules } from "../config/permissions.js";

export type HardenOptions = {
  /** Which configured instance to harden. Every one of them when omitted. */
  name?: string;
  /** Only consulted with `--name`, and only when the instance is not on disk. */
  scope?: string;
};

/**
 * Applies the human-approval rules to an install that already exists.
 *
 * `setup` writes them as it goes, but plenty of installs never run it: adding
 * the server with `claude mcp add`, copying a config between machines, or
 * upgrading from a version that predates the guard all produce a working server
 * with nothing standing between an agent and a delete. This is the command that
 * closes that gap, and it is safe to run repeatedly.
 */
export const runHarden = async (options: HardenOptions = {}, cwd: string = process.cwd()): Promise<void> => {
  const configured = await findInstances(cwd);

  let targets: InstanceRef[];

  if (options.name) {
    const name = sanitizeInstanceName(options.name);
    const known = configured.find((instance) => instance.name === name);

    // An instance added straight to the client config has no credentials file
    // here, so fall back to the requested scope rather than refusing: the rules
    // are about a server key, and the server key is the name.
    targets = known
      ? [known]
      : [instanceRef(name, options.scope === "user" ? "user" : "project", cwd)];
  } else {
    targets = configured;
  }

  if (targets.length === 0) {
    process.stdout.write(
      "No Proxmox instances configured on this machine.\n" +
        "Run `nandi-proxmox-mcp setup`, or pass --name to harden a server you configured by hand.\n"
    );
    return;
  }

  process.stdout.write(`Requiring human approval for ${humanGateToolNames().length} destructive tools.\n\n`);

  const failures: string[] = [];

  for (const instance of targets) {
    try {
      const result = await writeHumanGateRules(instance.serverKey, instance.scope as InstanceScope, cwd);
      process.stdout.write(
        `  ${instance.name} (${instance.scope})\n` +
          `    ${result.path}\n` +
          `    ${result.added === 0 ? "already covered" : `${result.added} rule(s) added`}\n\n`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      failures.push(`${instance.name}: ${message}`);
      process.stdout.write(`  ${instance.name} (${instance.scope})\n    FAILED: ${message}\n\n`);
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    "Restart your MCP client for the rules to take effect.\n" +
      "From then on every delete, migrate, rollback and in-container command stops for a\n" +
      "person to answer -- including in permission modes that otherwise skip prompts.\n"
  );
};
