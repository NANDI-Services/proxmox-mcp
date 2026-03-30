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
  sshKeyPath: safeFilePathSchema
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
