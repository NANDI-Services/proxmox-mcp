/**
 * Fault injection.
 *
 * A healthy Proxmox never produces the failures the error-mapping layer is
 * supposed to classify, so the emulator has to produce them on demand. Each
 * fault is armed over the control plane and consumed a fixed number of times.
 */

export const FAULT_MODES = new Set(["none", "401", "403", "500", "html-proxy", "bad-json", "hang"]);

export const createFaultController = () => {
  let mode = "none";
  let remaining = 0;
  let pathPrefix = "";

  const arm = ({ mode: nextMode, count = 1, pathPrefix: prefix = "" }) => {
    if (!FAULT_MODES.has(nextMode)) {
      throw new Error(`Unknown fault mode: ${nextMode}`);
    }
    mode = nextMode;
    remaining = nextMode === "none" ? 0 : count;
    pathPrefix = prefix;
  };

  const clear = () => arm({ mode: "none" });

  /**
   * Returns the fault to apply for this request, consuming one use, or null.
   */
  const take = (pathname) => {
    if (mode === "none" || remaining <= 0) {
      return null;
    }
    if (pathPrefix && !pathname.startsWith(pathPrefix)) {
      return null;
    }

    remaining -= 1;
    const active = mode;
    if (remaining <= 0) {
      mode = "none";
    }
    return active;
  };

  const describe = () => ({ mode, remaining, pathPrefix });

  return { arm, clear, take, describe };
};

/**
 * Writes the response for an armed fault. Returns true when it handled the
 * request. `hang` intentionally never responds so the client aborts.
 */
export const applyFault = (fault, res) => {
  if (fault === "hang") {
    return true;
  }

  if (fault === "401") {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: null, message: "authentication failure" }));
    return true;
  }

  if (fault === "403") {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: null, message: "Permission check failed (/nodes/pve01, VM.Audit)" }));
    return true;
  }

  if (fault === "500") {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: null, message: "internal server error" }));
    return true;
  }

  // A reverse proxy or captive portal answering instead of the API. This is the
  // case that used to surface as "Unexpected token '<'".
  if (fault === "html-proxy") {
    res.writeHead(502, { "content-type": "text/html" });
    res.end("<html><head><title>502 Bad Gateway</title></head><body><h1>502 Bad Gateway</h1><hr>nginx</body></html>");
    return true;
  }

  // 2xx with a non-JSON body: an SSO login page served on a healthy status.
  if (fault === "bad-json") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body>Please sign in to continue</body></html>");
    return true;
  }

  return false;
};
