import type { SshBatchOptions } from "./sshClient.js";
import { runSshBatch } from "./sshClient.js";

const shellEscape = (value: string): string => {
  return `'${value.replace(/'/g, "'\\''")}'`;
};

export const pctExec = async (options: SshBatchOptions, ctid: number, command: string): Promise<string> => {
  const remote = `pct exec ${ctid} -- bash -lc ${shellEscape(command)}`;
  const result = await runSshBatch(options, remote);

  if (result.exitCode !== 0) {
    throw new Error(`pct exec failed for CT ${ctid}: ${result.stderr.trim()}`);
  }

  return result.stdout;
};
