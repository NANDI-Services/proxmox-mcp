export class ProxmoxHttpError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string, public readonly body?: unknown) {
    super(message);
    this.status = status;
  }
}

export const describeProxmoxHttpError = (error: ProxmoxHttpError): { message: string; hint?: string } => {
  if (error.status === 401) {
    return {
      message: "Proxmox authentication failed (401).",
      hint: "Verify token name/secret, user and realm values in local config."
    };
  }

  if (error.status === 403) {
    return {
      message: "Proxmox denied access (403): ACL is insufficient for this operation.",
      hint: "Assign minimum ACL on the target path (for example /nodes/<node>) with VM.Audit/VM.PowerMgmt as needed."
    };
  }

  if (error.status >= 500) {
    return {
      message: "Proxmox internal server error.",
      hint: "Retry shortly and inspect Proxmox task logs."
    };
  }

  return {
    message: `Proxmox request failed with HTTP ${error.status}.`
  };
};
