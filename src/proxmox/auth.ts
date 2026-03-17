import type { RuntimeConfig } from "../config/validate.js";

export const buildTokenHeader = (config: RuntimeConfig): string => {
  return `PVEAPIToken=${config.proxmoxUser}@${config.proxmoxRealm}!${config.tokenName}=${config.tokenSecret}`;
};
