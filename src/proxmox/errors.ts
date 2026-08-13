export class ProxmoxHttpError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string, public readonly body?: unknown) {
    super(message);
    this.status = status;
  }
}

/**
 * Raised when Proxmox answers 2xx with a body that is not JSON. In practice this
 * means something other than the Proxmox API responded -- a reverse proxy, a
 * captive portal, or an SSO login page.
 */
export class ProxmoxResponseFormatError extends Error {
  public constructor(message: string, public readonly snippet?: string) {
    super(message);
    this.name = "ProxmoxResponseFormatError";
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
