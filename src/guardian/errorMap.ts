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
