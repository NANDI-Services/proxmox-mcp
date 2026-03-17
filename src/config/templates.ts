export const placeholders = {
  proxmoxHost: "__PROXMOX_HOST__",
  proxmoxPort: "__PROXMOX_PORT__",
  proxmoxUser: "__PROXMOX_USER__",
  proxmoxRealm: "__PROXMOX_REALM__",
  tokenName: "__PROXMOX_TOKEN_NAME__",
  tokenSecret: "__PROXMOX_TOKEN_SECRET__",
  sshHost: "__PROXMOX_SSH_HOST__",
  sshPort: "__PROXMOX_SSH_PORT__",
  sshUser: "__PROXMOX_SSH_USER__",
  sshKeyPath: "__PROXMOX_SSH_KEY_PATH__"
} as const;

export type TemplateValues = Record<string, string | number | boolean>;

export const renderTemplate = (template: string, values: TemplateValues): string => {
  let output = template;

  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`__${key.toUpperCase()}__`, "g");
    output = output.replace(pattern, String(value));
  }

  return output;
};
