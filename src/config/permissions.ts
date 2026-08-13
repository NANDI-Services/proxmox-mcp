import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { toolCatalog } from "../tools/catalog.js";
import type { InstanceScope } from "./instances.js";

/**
 * Claude Code permission rules that keep a human in front of destructive calls.
 *
 * This is the second half of the guard whose first half is
 * `anthropic/requiresUserInteraction` in the tool registry. That annotation
 * travels with the package and needs no configuration, but it is understood
 * only by Claude Code 2.1.199 and later; these rules cover the versions that
 * ignore it, and they make the guard visible in a file an operator can audit.
 *
 * Both survive `bypassPermissions`, and an `ask` rule beats a matching `allow`
 * rule -- rules are evaluated deny, then ask, then allow, first match wins --
 * so answering "yes, don't ask again" cannot quietly retire one.
 */

export type SettingsDocument = Record<string, unknown>;

/**
 * The tools that may not run without a person answering for them.
 *
 * Derived from `confirmRequired` rather than from a list kept here, so the
 * rules cannot drift from the catalog as tools are added. Aliases are included
 * because each one is a separate tool name on the wire: a rule naming only
 * `pve_stop_qemu_vm` leaves `stopVM` wide open.
 *
 * `destructive` would be the wider net, but it also covers start and resume,
 * which change state without destroying anything. Prompting to power on a VM
 * is friction that buys nothing, and a guard people resent is a guard people
 * find ways around.
 */
export const humanGateToolNames = (): string[] =>
  toolCatalog
    .filter((tool) => tool.confirmRequired)
    .flatMap((tool) => [tool.name, ...(tool.aliases ?? [])]);

/** Rule strings for one configured instance, e.g. `mcp__lab-cluster__pve_qemu_delete`. */
export const humanGateRules = (serverKey: string): string[] =>
  humanGateToolNames().map((name) => `mcp__${serverKey}__${name}`);

/**
 * Where the rules go.
 *
 * Mirrors how instances already choose between the project and the home
 * directory, so a user-scope install -- reachable from every directory --
 * carries its guard everywhere too, instead of being protected in the one
 * repository where setup happened to run.
 */
export const claudeSettingsPath = (scope: InstanceScope, cwd: string): string =>
  scope === "user"
    ? resolve(homedir(), ".claude", "settings.json")
    : resolve(cwd, ".claude", "settings.json");

/**
 * Adds the rules to `permissions.ask`, leaving everything else untouched.
 *
 * `settings.json` routinely holds hooks, env vars and the operator's own
 * permission rules, so this merges instead of writing a fresh document, and
 * refuses outright when a value is not the shape it expects rather than
 * replacing something it does not understand.
 */
export const mergeAskRules = (doc: SettingsDocument | undefined, rules: string[]): SettingsDocument => {
  const next: SettingsDocument = { ...(doc ?? {}) };

  const existingPermissions = next.permissions;
  if (existingPermissions !== undefined && (typeof existingPermissions !== "object" || existingPermissions === null || Array.isArray(existingPermissions))) {
    throw new Error("Refusing to edit settings: `permissions` exists but is not an object.");
  }

  const permissions: Record<string, unknown> = { ...((existingPermissions as Record<string, unknown> | undefined) ?? {}) };

  const existingAsk = permissions.ask;
  if (existingAsk !== undefined && !Array.isArray(existingAsk)) {
    throw new Error("Refusing to edit settings: `permissions.ask` exists but is not an array.");
  }

  const ask = [...((existingAsk as string[] | undefined) ?? [])];
  const present = new Set(ask);
  for (const rule of rules) {
    if (!present.has(rule)) {
      ask.push(rule);
      present.add(rule);
    }
  }

  permissions.ask = ask;
  next.permissions = permissions;
  return next;
};

export type HumanGateWriteResult = {
  path: string;
  /** Rules that were not already there. Zero means the file was already covered. */
  added: number;
  total: number;
};

/**
 * Reads, merges and writes the settings file for one instance.
 *
 * Never clobbers a file it cannot parse: it almost certainly holds
 * configuration the operator wrote by hand, and losing that to a guard meant to
 * protect them would be its own kind of damage.
 */
export const writeHumanGateRules = async (
  serverKey: string,
  scope: InstanceScope,
  cwd: string
): Promise<HumanGateWriteResult> => {
  const targetPath = claudeSettingsPath(scope, cwd);
  const rules = humanGateRules(serverKey);

  let existingRaw: string | undefined;
  try {
    existingRaw = await readFile(targetPath, "utf8");
  } catch {
    existingRaw = undefined;
  }

  let doc: SettingsDocument | undefined;
  if (existingRaw !== undefined && existingRaw.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existingRaw);
    } catch (error) {
      throw new Error(
        `Refusing to overwrite ${targetPath}: it exists but is not valid JSON ` +
          `(${error instanceof Error ? error.message : "parse error"}). Fix or remove it, then re-run.`
      );
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Refusing to overwrite ${targetPath}: expected a JSON object at the root.`);
    }

    doc = parsed as SettingsDocument;
  }

  const before = new Set(
    Array.isArray((doc?.permissions as Record<string, unknown> | undefined)?.ask)
      ? (((doc?.permissions as Record<string, unknown>).ask as string[]))
      : []
  );
  const merged = mergeAskRules(doc, rules);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  return {
    path: targetPath,
    added: rules.filter((rule) => !before.has(rule)).length,
    total: rules.length
  };
};
