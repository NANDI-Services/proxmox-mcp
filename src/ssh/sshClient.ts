import { safeExec } from "../utils/safeExec.js";

export type SshBatchOptions = {
  host: string;
  port: number;
  user: string;
  keyPath: string;
  timeoutMs: number;
  maxOutputBytes?: number;
};

export type SshBatchResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const hasControlChars = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

const assertSafeCliValue = (label: string, value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required for SSH execution`);
  }

  if (trimmed.startsWith("-")) {
    throw new Error(`${label} cannot start with '-'`);
  }

  if (hasControlChars(trimmed) || /\s/.test(trimmed)) {
    throw new Error(`${label} cannot contain whitespace or control characters`);
  }

  return trimmed;
};

const assertSafePath = (label: string, value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required for SSH execution`);
  }

  if (hasControlChars(trimmed)) {
    throw new Error(`${label} cannot contain control characters`);
  }

  return trimmed;
};

export const runSshBatch = async (options: SshBatchOptions, remoteCommand: string): Promise<SshBatchResult> => {
  const host = assertSafeCliValue("SSH host", options.host);
  const user = assertSafeCliValue("SSH user", options.user);
  const keyPath = assertSafePath("SSH key path", options.keyPath);

  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "PreferredAuthentications=publickey",
    "-o",
    "LogLevel=ERROR",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=2",
    "-p",
    String(options.port),
    "-i",
    keyPath,
    `${user}@${host}`,
    remoteCommand
  ];

  const result = await safeExec("ssh", args, options.timeoutMs, options.maxOutputBytes ?? 2 * 1024 * 1024);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.code
  };
};
