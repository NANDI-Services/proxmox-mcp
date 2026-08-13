import type { ResolvedTarget } from "./nodeRouter.js";
import type { SshBatchOptions } from "./sshClient.js";
import { runSshBatch } from "./sshClient.js";

const shellEscape = (value: string): string => {
  return `'${value.replace(/'/g, "'\\''")}'`;
};

/**
 * Wraps plain SSH options as a direct target, for callers that reach a single
 * known host and do not need cluster node resolution (for example `doctor`).
 */
export const directTarget = (options: SshBatchOptions, node = options.host): ResolvedTarget => ({
  node,
  route: "direct",
  ssh: options,
  wrapCommand: (remoteCommand) => remoteCommand
});

export type PctExecResult = {
  stdout: string;
  node: string;
  route: "direct" | "hop";
};

/** ssh itself exits 255 when it cannot establish the connection. */
export const SSH_CONNECT_FAILURE_EXIT_CODE = 255;

export class PctExecError extends Error {
  public constructor(
    message: string,
    public readonly exitCode: number,
    public readonly route: "direct" | "hop"
  ) {
    super(message);
    this.name = "PctExecError";
  }

  /**
   * Distinguishes "could not reach the node" from "the command failed". Only
   * the former justifies trying a different route: retrying a genuine command
   * failure on another path would just run it twice.
   */
  public get isConnectivityFailure(): boolean {
    return this.exitCode === SSH_CONNECT_FAILURE_EXIT_CODE;
  }
}

/**
 * Runs a command inside a container on whichever node hosts it.
 *
 * `target.wrapCommand` is what makes this cluster-aware: for a direct route it
 * is the identity, and for a hop it nests the call inside an ssh to the owning
 * node from the entry host.
 */
export const pctExecOn = async (
  target: ResolvedTarget,
  ctid: number,
  command: string
): Promise<PctExecResult> => {
  const remote = target.wrapCommand(`pct exec ${ctid} -- bash -lc ${shellEscape(command)}`);
  const result = await runSshBatch(target.ssh, remote);

  if (result.exitCode !== 0) {
    throw new PctExecError(
      `pct exec failed for CT ${ctid} on node ${target.node} (${target.route}): ${result.stderr.trim()}`,
      result.exitCode,
      target.route
    );
  }

  return { stdout: result.stdout, node: target.node, route: target.route };
};

/** Back-compatible single-host form. */
export const pctExec = async (options: SshBatchOptions, ctid: number, command: string): Promise<string> => {
  const result = await pctExecOn(directTarget(options), ctid, command);
  return result.stdout;
};
