import type { ToolError } from "./result.js";

export const mapError = (error: unknown): ToolError => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("timed out")) {
      return {
        code: "TIMEOUT",
        message: "The operation exceeded the allowed timeout.",
        hint: "Retry the action or increase timeout settings in your local config."
      };
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
