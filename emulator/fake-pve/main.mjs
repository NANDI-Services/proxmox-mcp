/**
 * Container entrypoint for the fake Proxmox API.
 *
 * The same server module is started in-process by the e2e harness, so this file
 * only handles env plumbing and certificate bootstrap.
 */

import { startFakeProxmox } from "./server.mjs";
import { generateSelfSignedCert } from "./gen-cert.mjs";

const env = process.env;

const certDir = env.PVE_FAKE_CERT_DIR ?? "/tmp/pve-emulator-certs";
const { certPath, keyPath } = env.PVE_FAKE_CERT_PATH && env.PVE_FAKE_KEY_PATH
  ? { certPath: env.PVE_FAKE_CERT_PATH, keyPath: env.PVE_FAKE_KEY_PATH }
  : generateSelfSignedCert(certDir);

const user = env.PVE_FAKE_USER ?? "svc_mcp";
const realm = env.PVE_FAKE_REALM ?? "pve";
const tokenName = env.PVE_FAKE_TOKEN_NAME ?? "emu";
const tokenSecret = env.PVE_FAKE_TOKEN_SECRET ?? "emulator-secret-token";

const expectedToken = `PVEAPIToken=${user}@${realm}!${tokenName}=${tokenSecret}`;

/** Parses "pve01=host-a,pve02=host-b" into a node -> address map. */
const parseNodeAddresses = (raw) =>
  Object.fromEntries(
    (raw ?? "")
      .split(",")
      .map((pair) => pair.trim())
      .filter((pair) => pair.includes("="))
      .map((pair) => {
        const separator = pair.indexOf("=");
        return [pair.slice(0, separator).trim(), pair.slice(separator + 1).trim()];
      })
  );

const nodeAddresses = parseNodeAddresses(env.PVE_FAKE_NODE_ADDRESSES);

const started = await startFakeProxmox({
  port: Number(env.PVE_FAKE_PORT ?? 8006),
  controlPort: Number(env.PVE_FAKE_CONTROL_PORT ?? 8765),
  host: env.PVE_FAKE_HOST ?? "0.0.0.0",
  certPath,
  keyPath,
  expectedToken,
  taskDurationMs: Number(env.PVE_FAKE_TASK_DURATION_MS ?? 250),
  mode: env.PVE_FAKE_MODE ?? "cluster",
  clusterName: env.PVE_FAKE_CLUSTER_NAME ?? "emu-cluster",
  nodeAddresses: Object.keys(nodeAddresses).length > 0 ? nodeAddresses : undefined
});

console.log(
  JSON.stringify({
    message: "fake proxmox api listening",
    apiPort: started.apiPort,
    controlPort: started.controlPort,
    tokenUser: `${user}@${realm}!${tokenName}`,
    certPath
  })
);

const shutdown = () => {
  void started.close().then(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Keep the process alive; both servers hold the event loop open.
console.log(JSON.stringify({ message: "ready" }));
