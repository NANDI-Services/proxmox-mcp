import { ProxmoxHttpError, ProxmoxResponseFormatError, describeProxmoxHttpError } from "../proxmox/errors.js";
import { GuestNotFoundError, SshDisabledError } from "../ssh/nodeRouter.js";
import type { ToolError } from "./result.js";

/**
 * Node/undici surface the real failure on `error.cause`, not `error.message`:
 * `fetch` rejects with a bare `TypeError: fetch failed` and hangs the useful
 * detail (ECONNREFUSED, a TLS cert code, ...) one or more levels down. Walking
 * the chain is what keeps connectivity and TLS faults from collapsing into
 * UNHANDLED_ERROR.
 */
const MAX_CAUSE_DEPTH = 5;

type FlattenedError = {
  messages: string[];
  codes: string[];
};

const flattenError = (error: unknown, maxDepth: number = MAX_CAUSE_DEPTH): FlattenedError => {
  const messages: string[] = [];
  const codes: string[] = [];

  let current: unknown = error;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (!(current instanceof Error)) {
      break;
    }

    messages.push(current.message.toLowerCase());

    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      codes.push(code.toUpperCase());
    }

    current = (current as { cause?: unknown }).cause;
  }

  return { messages, codes };
};

const CONNECTION_REFUSED_CODES = new Set(["ECONNREFUSED"]);
const DNS_FAILURE_CODES = new Set(["ENOTFOUND", "EAI_AGAIN"]);
const UNREACHABLE_CODES = new Set(["EHOSTUNREACH", "ENETUNREACH", "ENETDOWN"]);
const RESET_CODES = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"]);
const TIMEOUT_CODES = new Set([
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ERR_SOCKET_CONNECTION_TIMEOUT"
]);
const TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER"
]);

const hasAnyCode = (codes: string[], candidates: Set<string>): boolean =>
  codes.some((code) => candidates.has(code));

const mapProxmoxHttpError = (error: ProxmoxHttpError): ToolError => {
  const described = describeProxmoxHttpError(error);

  const code =
    error.status === 401
      ? "PROXMOX_AUTH_FAILED"
      : error.status === 403
        ? "PROXMOX_ACL_FORBIDDEN"
        : error.status === 404
          ? "PROXMOX_NOT_FOUND"
          : error.status >= 500
            ? "PROXMOX_SERVER_ERROR"
            : "PROXMOX_REQUEST_REJECTED";

  return described.hint
    ? { code, message: described.message, hint: described.hint }
    : { code, message: described.message };
};

const mapByCause = (flattened: FlattenedError): ToolError | undefined => {
  const { codes } = flattened;

  if (hasAnyCode(codes, CONNECTION_REFUSED_CODES)) {
    return {
      code: "CONNECTION_REFUSED",
      message: "The Proxmox host refused the connection.",
      hint: "Confirm the host and port are correct, that the Proxmox web service is running, and that your VPN tunnel is up."
    };
  }

  if (hasAnyCode(codes, DNS_FAILURE_CODES)) {
    return {
      code: "DNS_RESOLUTION_FAILED",
      message: "The Proxmox hostname could not be resolved.",
      hint: "Check the hostname spelling. If it resolves only on the remote network, confirm the VPN is connected and pushing DNS."
    };
  }

  if (hasAnyCode(codes, UNREACHABLE_CODES)) {
    return {
      code: "HOST_UNREACHABLE",
      message: "No network route to the Proxmox host.",
      hint: "The host is not reachable from this machine. Verify the VPN tunnel and any firewall rules between you and the cluster."
    };
  }

  if (hasAnyCode(codes, TIMEOUT_CODES)) {
    return {
      code: "TIMEOUT",
      message: "The connection to Proxmox timed out.",
      hint: "The host accepted no response in time. Check VPN latency, or raise the timeout for this operation."
    };
  }

  if (hasAnyCode(codes, TLS_CODES)) {
    return {
      code: "TLS_ERROR",
      message: "TLS certificate validation failed.",
      hint: "Proxmox ships a self-signed certificate by default. Trust the cluster CA on this machine, or set allowInsecureTls only for lab use."
    };
  }

  if (hasAnyCode(codes, RESET_CODES)) {
    return {
      code: "CONNECTION_RESET",
      message: "The connection to Proxmox was reset before a response arrived.",
      hint: "This often means an unstable VPN link or a proxy closing idle connections."
    };
  }

  return undefined;
};

export const mapError = (error: unknown): ToolError => {
  // Proxmox answered with a real HTTP status: prefer its dedicated description
  // over any generic message matching below.
  if (error instanceof ProxmoxHttpError) {
    return mapProxmoxHttpError(error);
  }

  if (error instanceof SshDisabledError) {
    return {
      code: "SSH_DISABLED",
      message: error.message,
      hint: "Set sshStrategy to \"auto\" and configure sshHost/sshKeyPath to enable container command execution."
    };
  }

  if (error instanceof GuestNotFoundError) {
    return {
      code: "GUEST_NOT_FOUND",
      message: error.message,
      hint: "Check the VM/container id. Use pve_list_cluster_resources to see every guest across the cluster."
    };
  }

  if (error instanceof ProxmoxResponseFormatError) {
    return {
      code: "PROXMOX_INVALID_RESPONSE",
      message: "Proxmox returned a response that was not valid JSON.",
      hint: "A reverse proxy, captive portal, or login page is most likely answering instead of the Proxmox API. Verify the host, port, and that no gateway intercepts /api2/json."
    };
  }

  if (error instanceof Error) {
    const flattened = flattenError(error);
    const message = flattened.messages.join(" | ");

    // The client converts an aborted request into this message
    // (src/proxmox/client.ts), so keep matching it before code-based mapping.
    if (message.includes("timed out")) {
      return {
        code: "TIMEOUT",
        message: "The operation exceeded the allowed timeout.",
        hint: "Retry the action or increase timeout settings in your local config."
      };
    }

    const byCause = mapByCause(flattened);
    if (byCause) {
      return byCause;
    }

    if (message.includes("forbidden") || message.includes("403")) {
      return {
        code: "PROXMOX_ACL_FORBIDDEN",
        message: "Proxmox rejected this request with 403 (insufficient ACL).",
        hint: "Grant minimum ACL permissions to the API token user and retry."
      };
    }

    if (message.includes("self signed") || message.includes("certificate")) {
      return {
        code: "TLS_ERROR",
        message: "TLS certificate validation failed.",
        hint: "For self-signed certs, configure trusted certs or explicitly enable insecure TLS only for lab use."
      };
    }

    if (message.includes("docker: command not found")) {
      return {
        code: "DOCKER_NOT_AVAILABLE",
        message: "Docker is not installed or not available inside the target container.",
        hint: "Use a container with Docker runtime or switch to non-Docker diagnostics."
      };
    }

    if (message.includes("qemu guest agent is not running") || message.includes("no qemu guest agent configured")) {
      return {
        code: "QEMU_GUEST_AGENT_UNAVAILABLE",
        message: "QEMU guest agent is not running in this VM.",
        hint: "Enable/start qemu-guest-agent in the guest OS and retry."
      };
    }

    if (message.includes("cloud-init") && message.includes("not")) {
      return {
        code: "CLOUDINIT_UNAVAILABLE",
        message: "Cloud-init data is not available for this VM.",
        hint: "Use a cloud-init-enabled VM or configure cloud-init first."
      };
    }

    return {
      code: "UNHANDLED_ERROR",
      message: error.message
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "Unknown error shape received from operation."
  };
};
