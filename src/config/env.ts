import { runtimeConfigSchema, type RuntimeConfig } from "./validate.js";
import { parseBool, parseInteger } from "../utils/parsing.js";

export const loadEnvConfig = (): RuntimeConfig => {
  const candidate = {
    proxmoxHost: process.env.PROXMOX_HOST,
    proxmoxPort: parseInteger(process.env.PROXMOX_PORT, 8006),
    proxmoxUser: process.env.PROXMOX_USER,
    proxmoxRealm: process.env.PROXMOX_REALM,
    tokenName: process.env.PROXMOX_TOKEN_NAME,
    tokenSecret: process.env.PROXMOX_TOKEN_SECRET,
    allowInsecureTls: parseBool(process.env.PROXMOX_ALLOW_INSECURE_TLS, false),
    sshHost: process.env.PROXMOX_SSH_HOST ?? process.env.PROXMOX_HOST,
    sshPort: parseInteger(process.env.PROXMOX_SSH_PORT, 22),
    sshUser: process.env.PROXMOX_SSH_USER ?? "root",
    sshKeyPath: process.env.PROXMOX_SSH_KEY_PATH ?? ""
  };

  return runtimeConfigSchema.parse(candidate);
};
