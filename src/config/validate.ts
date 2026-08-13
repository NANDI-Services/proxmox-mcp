import { z } from "zod";

const hostDisallowedChars = /[\s/?#\\]/;

const hasControlChars = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

const nonEmptyTrimmed = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(4096, `${label} is too long`);

const safeHostSchema = nonEmptyTrimmed("host")
  .refine((value) => !value.startsWith("-"), "Host cannot start with '-'")
  .refine((value) => !hasControlChars(value), "Host cannot contain control characters")
  .refine((value) => !hostDisallowedChars.test(value), "Host cannot contain whitespace, slashes, or URI delimiters");

const safeUserSchema = nonEmptyTrimmed("user")
  .refine((value) => !value.startsWith("-"), "User cannot start with '-'")
  .refine((value) => !hasControlChars(value), "User cannot contain control characters")
  .refine((value) => !/\s/.test(value), "User cannot contain whitespace");

const safeTokenSchema = nonEmptyTrimmed("token")
  .refine((value) => !hasControlChars(value), "Token values cannot contain control characters");

const safeTokenSecretSchema = nonEmptyTrimmed("tokenSecret")
  .min(10, "tokenSecret must be at least 10 characters")
  .refine((value) => !hasControlChars(value), "tokenSecret cannot contain control characters");

const safeFilePathSchema = nonEmptyTrimmed("file path").refine(
  (value) => !hasControlChars(value),
  "File paths cannot contain control characters"
);

const safeNodeNameSchema = nonEmptyTrimmed("node name")
  .refine((value) => !value.startsWith("-"), "Node name cannot start with '-'")
  .refine((value) => !hasControlChars(value), "Node name cannot contain control characters")
  .refine((value) => !/\s/.test(value), "Node name cannot contain whitespace");

/**
 * How SSH-backed tools reach the node that actually hosts a guest.
 *
 * `pct exec` is a node-local command, so in a cluster the MCP must first work
 * out which node holds the container and then reach that node.
 *
 * - `auto`     resolve the node, try it directly, and fall back to hopping
 *              through the entry host. Correct for both clusters and
 *              standalone installs; this is the default so nobody has to know.
 * - `direct`   always connect straight to the resolved node.
 * - `hop`      always go through the entry host (`ssh entry ssh node ...`),
 *              for setups where only one node is reachable from outside.
 * - `disabled` never use SSH; only REST tools work.
 */
export const sshStrategyValues = ["auto", "direct", "hop", "disabled"] as const;

const sshNodeOverrideSchema = z.object({
  host: safeHostSchema,
  port: z.number().int().positive().max(65535).optional(),
  user: safeUserSchema.optional()
});

export const runtimeConfigSchema = z.object({
  proxmoxHost: safeHostSchema,
  proxmoxPort: z.number().int().positive().max(65535),
  proxmoxUser: safeUserSchema,
  proxmoxRealm: safeUserSchema,
  tokenName: safeTokenSchema,
  tokenSecret: safeTokenSecretSchema,
  allowInsecureTls: z.boolean().default(false),
  sshHost: safeHostSchema,
  sshPort: z.number().int().positive().max(65535).default(22),
  sshUser: safeUserSchema,
  sshKeyPath: safeFilePathSchema,

  // Everything below is optional: a standalone install needs none of it.
  sshStrategy: z.enum(sshStrategyValues).default("auto"),
  /**
   * Which Proxmox node `sshHost` actually is. Lets the router skip all routing
   * when a guest already lives on the node we connect to. `setup` fills this in
   * by asking the node its own hostname, so nobody has to know it.
   */
  sshNodeName: safeNodeNameSchema.optional(),
  /**
   * Per-node connection overrides, keyed by Proxmox node name. Only needed when
   * a node's address cannot be discovered or differs from what the cluster
   * reports (for example a NAT or VPN address).
   */
  sshNodes: z.record(safeNodeNameSchema, sshNodeOverrideSchema).optional()
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type SshStrategy = (typeof sshStrategyValues)[number];
