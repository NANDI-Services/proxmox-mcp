import { runGuarded } from "../guardian/guardian.js";
import type { ToolResult } from "../guardian/result.js";
import { pctExec } from "../ssh/pctExec.js";
import type { SshBatchOptions } from "../ssh/sshClient.js";

const dockerNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

const shellEscape = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const invalidInputResult = (code: string, message: string, hint: string): ToolResult<unknown> => ({
  ok: false,
  error: {
    code,
    message,
    hint
  },
  meta: {
    durationMs: 0,
    retries: 0,
    timestamp: new Date().toISOString()
  }
});

const allowedDiagnosticCommands = [
  "uname -a",
  "uptime",
  "df -h",
  "free -m",
  "docker ps --format '{{.Names}} {{.Status}}'"
] as const;

export const execInContainer = async (
  ssh: SshBatchOptions,
  ctid: number,
  command: string
): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => ({ stdout: await pctExec(ssh, ctid, command) }), { timeoutMs: 20_000 });
};

export const dockerPsInContainer = async (ssh: SshBatchOptions, ctid: number): Promise<ToolResult<unknown>> => {
  return await execInContainer(ssh, ctid, "docker ps");
};

export const dockerLogsInContainer = async (
  ssh: SshBatchOptions,
  ctid: number,
  containerName: string,
  tail = 200
): Promise<ToolResult<unknown>> => {
  if (!dockerNamePattern.test(containerName)) {
    return invalidInputResult(
      "INVALID_CONTAINER_NAME",
      "Container name contains unsupported characters.",
      "Use a Docker container name or ID containing only letters, numbers, dot, underscore, or dash."
    );
  }

  return await execInContainer(ssh, ctid, `docker logs --tail ${tail} ${shellEscape(containerName)}`);
};

export const runRemoteDiagnostic = async (
  ssh: SshBatchOptions,
  ctid: number,
  command: string
): Promise<ToolResult<unknown>> => {
  if (!allowedDiagnosticCommands.includes(command as (typeof allowedDiagnosticCommands)[number])) {
    return {
      ok: false,
      error: {
        code: "DIAGNOSTIC_COMMAND_NOT_ALLOWED",
        message: "Command is not in the allowed diagnostic list.",
        hint: "Use one of the documented safe diagnostic commands."
      },
      meta: {
        durationMs: 0,
        retries: 0,
        timestamp: new Date().toISOString()
      }
    };
  }

  return await execInContainer(ssh, ctid, command);
};
