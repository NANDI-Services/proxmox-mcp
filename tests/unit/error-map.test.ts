import { describe, expect, it } from "vitest";
import { mapError } from "../../src/guardian/errorMap.js";
import { ProxmoxHttpError, ProxmoxResponseFormatError } from "../../src/proxmox/errors.js";

/**
 * Builds the error shape undici produces: a bare `TypeError: fetch failed`
 * whose real reason lives on `cause`.
 */
const fetchFailed = (code: string, message = "connect error"): Error => {
  const cause = new Error(message) as Error & { code: string };
  cause.code = code;
  return new TypeError("fetch failed", { cause });
};

describe("error map", () => {
  it("maps docker unavailable errors", () => {
    const mapped = mapError(new Error("pct exec failed: bash: line 1: docker: command not found"));
    expect(mapped.code).toBe("DOCKER_NOT_AVAILABLE");
  });

  it("maps qemu guest agent unavailable errors", () => {
    const mapped = mapError(new Error("HTTP 500: QEMU guest agent is not running"));
    expect(mapped.code).toBe("QEMU_GUEST_AGENT_UNAVAILABLE");
  });

  it("maps qemu guest agent missing configuration errors", () => {
    const mapped = mapError(new Error("HTTP 500: No QEMU guest agent configured"));
    expect(mapped.code).toBe("QEMU_GUEST_AGENT_UNAVAILABLE");
  });

  describe("cause-chain classification", () => {
    it("maps a refused connection", () => {
      const mapped = mapError(fetchFailed("ECONNREFUSED"));
      expect(mapped.code).toBe("CONNECTION_REFUSED");
      expect(mapped.hint).toContain("VPN");
    });

    it("maps DNS resolution failure", () => {
      const mapped = mapError(fetchFailed("ENOTFOUND"));
      expect(mapped.code).toBe("DNS_RESOLUTION_FAILED");
    });

    it("maps an unreachable host", () => {
      const mapped = mapError(fetchFailed("EHOSTUNREACH"));
      expect(mapped.code).toBe("HOST_UNREACHABLE");
    });

    it("maps a self-signed certificate", () => {
      const mapped = mapError(fetchFailed("DEPTH_ZERO_SELF_SIGNED_CERT"));
      expect(mapped.code).toBe("TLS_ERROR");
    });

    it("maps an expired certificate", () => {
      const mapped = mapError(fetchFailed("CERT_HAS_EXPIRED"));
      expect(mapped.code).toBe("TLS_ERROR");
    });

    it("maps a connect timeout code", () => {
      const mapped = mapError(fetchFailed("UND_ERR_CONNECT_TIMEOUT"));
      expect(mapped.code).toBe("TIMEOUT");
    });

    it("maps a reset connection", () => {
      const mapped = mapError(fetchFailed("ECONNRESET"));
      expect(mapped.code).toBe("CONNECTION_RESET");
    });

    it("finds a code nested more than one level deep", () => {
      const root = new Error("socket hang up") as Error & { code: string };
      root.code = "ECONNREFUSED";
      const middle = new Error("connection failure", { cause: root });
      const top = new TypeError("fetch failed", { cause: middle });

      expect(mapError(top).code).toBe("CONNECTION_REFUSED");
    });

    it("does not loop forever on a self-referential cause chain", () => {
      const looped = new Error("looped") as Error & { cause?: unknown };
      looped.cause = looped;

      expect(mapError(looped).code).toBe("UNHANDLED_ERROR");
    });

    it("still reports UNHANDLED_ERROR when nothing matches", () => {
      const mapped = mapError(new Error("something entirely unexpected"));
      expect(mapped.code).toBe("UNHANDLED_ERROR");
      expect(mapped.message).toBe("something entirely unexpected");
    });
  });

  describe("ProxmoxHttpError classification", () => {
    it("maps 401 to an authentication failure with a hint", () => {
      const mapped = mapError(new ProxmoxHttpError(401, "HTTP 401: authentication failure"));
      expect(mapped.code).toBe("PROXMOX_AUTH_FAILED");
      expect(mapped.hint).toContain("token");
    });

    it("maps 403 to an ACL failure", () => {
      const mapped = mapError(new ProxmoxHttpError(403, "HTTP 403: Permission check failed"));
      expect(mapped.code).toBe("PROXMOX_ACL_FORBIDDEN");
    });

    it("maps 404 to a not-found error", () => {
      const mapped = mapError(new ProxmoxHttpError(404, "HTTP 404"));
      expect(mapped.code).toBe("PROXMOX_NOT_FOUND");
    });

    it("maps 500 to a server error", () => {
      const mapped = mapError(new ProxmoxHttpError(500, "HTTP 500"));
      expect(mapped.code).toBe("PROXMOX_SERVER_ERROR");
    });

    it("maps a 502 HTML proxy page to a server error, not a JSON parse failure", () => {
      const mapped = mapError(new ProxmoxHttpError(502, "HTTP 502: <html> 502 Bad Gateway </html>"));
      expect(mapped.code).toBe("PROXMOX_SERVER_ERROR");
      expect(mapped.message).not.toContain("Unexpected token");
    });
  });

  it("maps a non-JSON 2xx body to an invalid-response error", () => {
    const mapped = mapError(new ProxmoxResponseFormatError("Proxmox returned a non-JSON response (HTTP 200)."));
    expect(mapped.code).toBe("PROXMOX_INVALID_RESPONSE");
    expect(mapped.hint).toContain("proxy");
  });

  it("keeps the client-side abort message mapped to TIMEOUT", () => {
    const mapped = mapError(new Error("Proxmox request timed out after 8000ms"));
    expect(mapped.code).toBe("TIMEOUT");
  });
});
