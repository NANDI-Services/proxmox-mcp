import { runGuarded } from "../guardian/guardian.js";
import { defaultRetryPolicy, singleAttemptPolicy } from "../guardian/retryPolicy.js";
import type { ToolResult } from "../guardian/result.js";
import { PctExecError, pctExecOn } from "../ssh/pctExec.js";
import type { NodeRouter } from "../ssh/nodeRouter.js";

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

/**
 * Runs a command in a container, on whichever node hosts it.
 *
 * The router yields candidate routes in preference order. Only a connectivity
 * failure justifies trying the next one: if `pct` itself reported an error, the
 * command really did run and re-running it elsewhere would execute it twice.
 *
 * `retryable` must only be set for commands known to be safe to repeat.
 * `withTimeout` does not cancel the underlying ssh process, so a retry after a
 * timeout can run concurrently with the original command.
 */
const runPctExec = async (
  router: NodeRouter,
  ctid: number,
  command: string,
  retryable: boolean
): Promise<ToolResult<unknown>> => {
  return await runGuarded(
    async () => {
      const routes = await router.routesForGuest(ctid);
      let lastError: unknown;

      for (const route of routes) {
        try {
          const result = await pctExecOn(route, ctid, command);
          router.rememberWorkingRoute(result.node, result.route);
          return { stdout: result.stdout, node: result.node, route: result.route };
        } catch (error) {
          lastError = error;
          if (error instanceof PctExecError && error.isConnectivityFailure) {
            continue;
          }
          throw error;
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(`Could not reach any node able to run commands for CT ${ctid}.`);
    },
    {
      timeoutMs: 20_000,
      retryPolicy: retryable ? defaultRetryPolicy : singleAttemptPolicy
    }
  );
};

export const execInContainer = async (
  router: NodeRouter,
  ctid: number,
  command: string
): Promise<ToolResult<unknown>> => {
  // Caller-supplied command: never repeat it automatically.
  return await runPctExec(router, ctid, command, false);
};

export const dockerPsInContainer = async (router: NodeRouter, ctid: number): Promise<ToolResult<unknown>> => {
  return await runPctExec(router, ctid, "docker ps", true);
};

export const dockerLogsInContainer = async (
  router: NodeRouter,
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

  return await runPctExec(router, ctid, `docker logs --tail ${tail} ${shellEscape(containerName)}`, true);
};

export const runRemoteDiagnostic = async (
  router: NodeRouter,
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

  // Allow-listed read-only diagnostics are safe to repeat.
  return await runPctExec(router, ctid, command, true);
};
