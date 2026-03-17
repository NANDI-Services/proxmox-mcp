import type { SshBatchOptions } from "../ssh/sshClient.js";
import { runGuarded } from "../guardian/guardian.js";
import { diagnoseBatchOnlyFailure } from "../ssh/batchDiagnostics.js";
import type { ToolResult } from "../guardian/result.js";

export const sshBatchDiagnostics = async (options: SshBatchOptions): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => await diagnoseBatchOnlyFailure(options), { timeoutMs: 20_000 });
};
