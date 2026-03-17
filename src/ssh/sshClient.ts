import { safeExec } from "../utils/safeExec.js";

export type SshBatchOptions = {
  host: string;
  port: number;
  user: string;
  keyPath: string;
  timeoutMs: number;
};

export type SshBatchResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export const runSshBatch = async (options: SshBatchOptions, remoteCommand: string): Promise<SshBatchResult> => {
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-p",
    String(options.port),
    "-i",
    options.keyPath,
    `${options.user}@${options.host}`,
    remoteCommand
  ];

  const result = await safeExec("ssh", args, options.timeoutMs);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.code
  };
};
