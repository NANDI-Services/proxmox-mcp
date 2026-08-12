import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GlobalSetupContext } from "vitest/node";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const composeFile = join(repoRoot, "emulator", "docker-compose.yml");

const apiPort = Number(process.env.EMU_API_PORT ?? 18006);
const ctrlPort = Number(process.env.EMU_CTRL_PORT ?? 18765);
const sshPort = Number(process.env.EMU_SSH_PORT ?? 12222);
/** Node pve02, published so the direct-route test can reach it explicitly. */
const ssh2Port = Number(process.env.EMU_SSH2_PORT ?? 12223);

const tokenUser = "svc_mcp";
const tokenRealm = "pve";
const tokenName = "emu";
const tokenSecret = "emulator-secret-token";

const run = (command: string, args: string[], env?: NodeJS.ProcessEnv): { status: number; stdout: string; stderr: string } => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    env: { ...process.env, ...env }
  });

  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }

  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

const requireDocker = (): void => {
  const version = run("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (version.status !== 0) {
    throw new Error(
      "The e2e suite needs a running Docker daemon. Start Docker Desktop and retry.\n" +
        `docker version failed: ${version.stderr.trim()}`
    );
  }

  const compose = run("docker", ["compose", "version"]);
  if (compose.status !== 0) {
    throw new Error("`docker compose` (v2) is required but not available.");
  }
};

export default async ({ provide }: GlobalSetupContext): Promise<() => Promise<void>> => {
  requireDocker();

  const keyDir = mkdtempSync(join(tmpdir(), "nandi-emu-"));
  const keyPath = join(keyDir, "id_ed25519");

  const keygen = run("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", keyPath, "-q", "-C", "nandi-emulator"]);
  if (keygen.status !== 0) {
    throw new Error(`ssh-keygen failed: ${keygen.stderr.trim()}`);
  }

  // Windows OpenSSH refuses a private key that other principals can read.
  if (process.platform === "win32") {
    run("icacls", [keyPath, "/inheritance:r"]);
    run("icacls", [keyPath, "/grant:r", `${process.env.USERNAME ?? "user"}:F`]);
  }

  // The emulator regenerates its host key on every `down -v`, but host:port stays
  // the same. Without this, the second run fails host key verification.
  run("ssh-keygen", ["-R", `[127.0.0.1]:${sshPort}`]);

  const authorizedKey = readFileSync(`${keyPath}.pub`, "utf8").trim();
  const composeEnv: NodeJS.ProcessEnv = {
    AUTHORIZED_KEY: authorizedKey,
    // Mirrors the cluster's shared /etc/pve/priv/authorized_keys trust, which
    // is what lets the entry node hop to a peer.
    NODE_PRIVATE_KEY: readFileSync(keyPath, "utf8"),
    EMU_API_PORT: String(apiPort),
    EMU_CTRL_PORT: String(ctrlPort),
    EMU_SSH_PORT: String(sshPort),
    EMU_SSH2_PORT: String(ssh2Port),
    EMU_TOKEN_SECRET: tokenSecret
  };

  const up = run("docker", ["compose", "-f", composeFile, "up", "-d", "--wait", "--build"], composeEnv);
  if (up.status !== 0) {
    throw new Error(`Failed to start the emulator stack:\n${up.stderr}`);
  }

  run("ssh-keygen", ["-R", `[127.0.0.1]:${ssh2Port}`]);

  provide("emulator", {
    apiPort,
    ctrlPort,
    sshPort,
    ssh2Port,
    keyPath,
    tokenUser,
    tokenRealm,
    tokenName,
    tokenSecret
  });

  return async (): Promise<void> => {
    run("docker", ["compose", "-f", composeFile, "down", "-v"], composeEnv);
    rmSync(keyDir, { recursive: true, force: true });
  };
};

export type EmulatorHandle = {
  apiPort: number;
  ctrlPort: number;
  sshPort: number;
  ssh2Port: number;
  keyPath: string;
  tokenUser: string;
  tokenRealm: string;
  tokenName: string;
  tokenSecret: string;
};

declare module "vitest" {
  export interface ProvidedContext {
    emulator: EmulatorHandle;
  }
}
