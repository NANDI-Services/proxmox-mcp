/**
 * Stateful fake of the Proxmox VE REST API.
 *
 * Speaks the exact wire contract src/proxmox/client.ts expects: a
 * `PVEAPIToken=` Authorization header, form-urlencoded bodies on writes, and a
 * `{ "data": ... }` envelope on success. Errors use the shapes
 * `extractErrorDetail` knows how to read.
 *
 * Serves HTTPS with a self-signed certificate so the TLS path is genuinely
 * exercised rather than stubbed.
 */

import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { createState } from "./state.mjs";
import { applyFault, createFaultController } from "./faults.mjs";

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) {
    return {};
  }
  return Object.fromEntries(new URLSearchParams(raw));
};

/**
 * Path params are percent-encoded by buildEndpointRequest (a UPID's colons
 * become %3A), so every segment must be decoded before matching.
 */
const decodeSegments = (pathname) =>
  pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));

const matchRoute = (pattern, segments) => {
  const patternSegments = pattern.split("/").filter((segment) => segment.length > 0);
  if (patternSegments.length !== segments.length) {
    return null;
  }

  const params = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const expected = patternSegments[index];
    const actual = segments[index];
    if (expected.startsWith("{") && expected.endsWith("}")) {
      params[expected.slice(1, -1)] = actual;
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
};

const buildRoutes = (state) => {
  const requireGuest = (kind, vmid) => {
    const guest = state.getGuest(kind, vmid);
    if (!guest) {
      throw new ApiError(404, `Configuration file 'nodes/pve01/${kind}/${vmid}.conf' does not exist`);
    }
    return guest;
  };

  const requireNode = (node) => {
    if (!state.nodeByName(node)) {
      throw new ApiError(404, `no such node '${node}'`);
    }
  };

  const guestRoutes = (kind) => [
    { method: "GET", path: `/api2/json/nodes/{node}/${kind}`, handle: ({ node }) => (requireNode(node), state.listGuests(kind, node)) },
    { method: "POST", path: `/api2/json/nodes/{node}/${kind}`, handle: ({ node }, { body }) => {
      requireNode(node);
      if (!body.vmid) {
        throw new ApiError(400, "parameter verification failed - vmid: property is missing and it is not optional");
      }
      if (state.getGuest(kind, body.vmid)) {
        throw new ApiError(500, `CT ${body.vmid} already exists on node '${node}'`);
      }
      return state.createGuest(kind, node, body.vmid, body);
    } },
    { method: "GET", path: `/api2/json/nodes/{node}/${kind}/{vmid}/status/current`, handle: ({ vmid }) => {
      const guest = requireGuest(kind, vmid);
      return { vmid: guest.vmid, name: guest.name, status: guest.status, uptime: guest.uptime, cpus: guest.cpus, maxmem: guest.maxmem };
    } },
    { method: "GET", path: `/api2/json/nodes/{node}/${kind}/{vmid}/config`, handle: ({ vmid }) => requireGuest(kind, vmid).config },
    { method: "PUT", path: `/api2/json/nodes/{node}/${kind}/{vmid}/config`, handle: ({ vmid }, { body }) => {
      const guest = requireGuest(kind, vmid);
      Object.assign(guest.config, body);
      return null;
    } },
    { method: "POST", path: `/api2/json/nodes/{node}/${kind}/{vmid}/status/{op}`, handle: ({ node, vmid, op }) => {
      requireGuest(kind, vmid);
      return state.setGuestStatus(kind, node, vmid, op);
    } },
    { method: "DELETE", path: `/api2/json/nodes/{node}/${kind}/{vmid}`, handle: ({ node, vmid }) => {
      requireGuest(kind, vmid);
      return state.deleteGuest(kind, node, vmid);
    } },
    { method: "POST", path: `/api2/json/nodes/{node}/${kind}/{vmid}/clone`, handle: ({ node, vmid }, { body }) => {
      const source = requireGuest(kind, vmid);
      if (!body.newid) {
        throw new ApiError(400, "parameter verification failed - newid: property is missing and it is not optional");
      }
      state.createGuest(kind, node, body.newid, { ...source.config });
      return state.startTask(node, kind === "qemu" ? "qmclone" : "vzclone", body.newid);
    } },
    { method: "POST", path: `/api2/json/nodes/{node}/${kind}/{vmid}/snapshot`, handle: ({ node, vmid }, { body }) => {
      const guest = requireGuest(kind, vmid);
      const name = body.snapname;
      if (!name) {
        throw new ApiError(400, "parameter verification failed - snapname: property is missing and it is not optional");
      }
      guest.snapshots.push({ name, snaptime: Math.floor(Date.now() / 1000), description: body.description ?? "" });
      return state.startTask(node, "snapshot", vmid);
    } },
    { method: "GET", path: `/api2/json/nodes/{node}/${kind}/{vmid}/snapshot`, handle: ({ vmid }) => requireGuest(kind, vmid).snapshots },
    { method: "DELETE", path: `/api2/json/nodes/{node}/${kind}/{vmid}/snapshot/{snapname}`, handle: ({ node, vmid, snapname }) => {
      const guest = requireGuest(kind, vmid);
      guest.snapshots = guest.snapshots.filter((snapshot) => snapshot.name !== snapname);
      return state.startTask(node, "snapshotdelete", vmid);
    } },
    { method: "POST", path: `/api2/json/nodes/{node}/${kind}/{vmid}/snapshot/{snapname}/rollback`, handle: ({ node, vmid, snapname }) => {
      const guest = requireGuest(kind, vmid);
      if (!guest.snapshots.some((snapshot) => snapshot.name === snapname)) {
        throw new ApiError(500, `snapshot '${snapname}' does not exist`);
      }
      return state.startTask(node, "rollback", vmid);
    } },
    { method: "POST", path: `/api2/json/nodes/{node}/${kind}/{vmid}/migrate`, handle: ({ node, vmid }) => {
      requireGuest(kind, vmid);
      return state.startTask(node, "migrate", vmid);
    } }
  ];

  return [
    { method: "GET", path: "/api2/json/nodes", handle: () => state.raw.nodes },
    { method: "GET", path: "/api2/json/nodes/{node}/status", handle: ({ node }) => {
      requireNode(node);
      const found = state.nodeByName(node);
      return { uptime: found.uptime, cpu: found.cpu, memory: { total: found.maxmem, used: found.mem, free: found.maxmem - found.mem }, pveversion: "pve-manager/8.2.2/emulator" };
    } },

    ...guestRoutes("qemu"),
    ...guestRoutes("lxc"),

    { method: "GET", path: "/api2/json/cluster/status", handle: () => state.cluster.status() },
    { method: "GET", path: "/api2/json/cluster/resources", handle: () => state.cluster.resources() },
    { method: "GET", path: "/api2/json/cluster/nextid", handle: () => state.allocateVmid() },
    { method: "GET", path: "/api2/json/cluster/options", handle: () => ({ console: "html5", language: "en" }) },
    { method: "GET", path: "/api2/json/cluster/backup", handle: () => [{ id: "backup-emu-1", schedule: "sat 02:00", storage: "local", enabled: 1, mode: "snapshot" }] },
    { method: "GET", path: "/api2/json/cluster/firewall/rules", handle: () => [] },
    { method: "GET", path: "/api2/json/cluster/firewall/options", handle: () => ({ enable: 0 }) },
    { method: "GET", path: "/api2/json/cluster/ha/status/current", handle: () => [] },
    { method: "GET", path: "/api2/json/cluster/replication", handle: () => [] },
    { method: "GET", path: "/api2/json/cluster/log", handle: () => [] },

    { method: "GET", path: "/api2/json/storage", handle: () => state.raw.storage },
    { method: "GET", path: "/api2/json/nodes/{node}/storage", handle: ({ node }) => (requireNode(node), state.raw.storage) },
    { method: "GET", path: "/api2/json/pools", handle: () => [{ poolid: "emu-pool", comment: "emulator pool" }] },
    { method: "GET", path: "/api2/json/nodes/{node}/network", handle: ({ node }) => {
      requireNode(node);
      return [
        { iface: "vmbr0", type: "bridge", active: 1, autostart: 1, cidr: "10.0.0.10/24", bridge_ports: "eno1" },
        { iface: "eno1", type: "eth", active: 1, autostart: 1 }
      ];
    } },
    { method: "GET", path: "/api2/json/nodes/{node}/dns", handle: ({ node }) => (requireNode(node), { dns1: "1.1.1.1", search: "emu.local" }) },
    { method: "GET", path: "/api2/json/nodes/{node}/services", handle: ({ node }) => (requireNode(node), [{ name: "pveproxy", state: "running", desc: "PVE API Proxy Server" }]) },
    { method: "GET", path: "/api2/json/access/users", handle: () => [{ userid: "svc_mcp@pve", enable: 1, comment: "emulator service account" }] },
    { method: "GET", path: "/api2/json/access/roles", handle: () => [{ roleid: "PVEAuditor", privs: "Datastore.Audit,VM.Audit" }] },

    { method: "GET", path: "/api2/json/nodes/{node}/tasks", handle: ({ node }, { query }) => {
      requireNode(node);
      const limit = query.get("limit");
      return state.listTasks(node, limit ? Number(limit) : undefined);
    } },
    { method: "GET", path: "/api2/json/nodes/{node}/tasks/{upid}/status", handle: ({ upid }) => {
      const status = state.taskStatus(upid);
      if (!status) {
        throw new ApiError(400, `no such task '${upid}'`);
      }
      return status;
    } },
    { method: "GET", path: "/api2/json/nodes/{node}/tasks/{upid}/log", handle: ({ upid }) => {
      const log = state.taskLog(upid);
      if (!log) {
        throw new ApiError(400, `no such task '${upid}'`);
      }
      return log;
    } }
  ];
};

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json;charset=UTF-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
};

export const startFakeProxmox = async ({
  port = 8006,
  controlPort = 8765,
  host = "0.0.0.0",
  certPath,
  keyPath,
  expectedToken,
  taskDurationMs,
  mode,
  clusterName,
  nodeAddresses
}) => {
  const state = createState({ taskDurationMs, mode, clusterName, nodeAddresses });
  const faults = createFaultController();
  const routes = buildRoutes(state);

  const apiServer = createHttpsServer(
    { cert: readFileSync(certPath), key: readFileSync(keyPath) },
    (req, res) => {
      void (async () => {
        const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);

        const fault = faults.take(url.pathname);
        if (fault && applyFault(fault, res)) {
          return;
        }

        if (req.headers.authorization !== expectedToken) {
          sendJson(res, 401, { data: null, message: "authentication failure" });
          return;
        }

        const segments = decodeSegments(url.pathname);

        for (const route of routes) {
          if (route.method !== req.method) {
            continue;
          }
          const params = matchRoute(route.path, segments);
          if (!params) {
            continue;
          }

          try {
            const body = req.method === "GET" ? {} : await readBody(req);
            const data = await route.handle(params, { body, query: url.searchParams });
            sendJson(res, 200, { data: data ?? null });
          } catch (error) {
            if (error instanceof ApiError) {
              sendJson(res, error.status, { data: null, message: error.message });
            } else {
              sendJson(res, 500, { data: null, message: String(error?.message ?? error) });
            }
          }
          return;
        }

        sendJson(res, 501, { data: null, message: `emulator does not implement ${req.method} ${url.pathname}` });
      })();
    }
  );

  // Control plane: never exposed as part of the emulated API surface. Used by
  // the test harness to arm faults and by the pct stub to read guest state.
  const controlServer = createHttpServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");

      try {
        if (req.method === "POST" && url.pathname === "/_control/fault") {
          const body = await readBody(req);
          faults.arm({ mode: body.mode, count: body.count ? Number(body.count) : 1, pathPrefix: body.pathPrefix ?? "" });
          sendJson(res, 200, faults.describe());
          return;
        }

        if (req.method === "POST" && url.pathname === "/_control/reset") {
          state.reset();
          faults.clear();
          sendJson(res, 200, { ok: true });
          return;
        }

        if (req.method === "GET" && url.pathname === "/_control/health") {
          sendJson(res, 200, { ok: true, fault: faults.describe() });
          return;
        }

        // Consumed by the pct stub in the SSH container.
        if (req.method === "GET" && url.pathname.startsWith("/_control/lxc/")) {
          const vmid = url.pathname.split("/").pop();
          const guest = state.getGuest("lxc", vmid);
          if (!guest) {
            sendJson(res, 404, { error: `CT ${vmid} does not exist` });
            return;
          }
          sendJson(res, 200, { vmid: guest.vmid, name: guest.name, status: guest.status, node: guest.node });
          return;
        }

        sendJson(res, 404, { error: "unknown control endpoint" });
      } catch (error) {
        sendJson(res, 400, { error: String(error?.message ?? error) });
      }
    })();
  });

  await new Promise((resolve) => apiServer.listen(port, host, resolve));
  await new Promise((resolve) => controlServer.listen(controlPort, host, resolve));

  return {
    state,
    faults,
    apiPort: apiServer.address().port,
    controlPort: controlServer.address().port,
    close: async () => {
      await new Promise((resolve) => apiServer.close(resolve));
      await new Promise((resolve) => controlServer.close(resolve));
    }
  };
};
