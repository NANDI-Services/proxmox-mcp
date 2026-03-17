import { z } from "zod";

export const runtimeConfigSchema = z.object({
  proxmoxHost: z.string().min(3),
  proxmoxPort: z.number().int().positive().max(65535),
  proxmoxUser: z.string().min(1),
  proxmoxRealm: z.string().min(1),
  tokenName: z.string().min(1),
  tokenSecret: z.string().min(10),
  allowInsecureTls: z.boolean().default(false),
  sshHost: z.string().min(3),
  sshPort: z.number().int().positive().max(65535).default(22),
  sshUser: z.string().min(1),
  sshKeyPath: z.string().min(3)
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
