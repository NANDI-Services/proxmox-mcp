import { computeDelayMs, defaultRetryPolicy, type RetryPolicy } from "./retryPolicy.js";
import { errorResult, okResult, type ToolResult } from "./result.js";
import { withTimeout } from "./timeout.js";
import { mapError } from "./errorMap.js";

export type GuardianOptions = {
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const runGuarded = async <T>(
  operation: () => Promise<T>,
  options: GuardianOptions = {}
): Promise<ToolResult<T>> => {
  const startedAt = Date.now();
  const policy = options.retryPolicy ?? defaultRetryPolicy;
  const timeoutMs = options.timeoutMs ?? 8_000;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      const data = await withTimeout(operation, timeoutMs);
      return okResult(data, {
        durationMs: Date.now() - startedAt,
        retries: attempt - 1
      });
    } catch (error) {
      if (attempt >= policy.maxAttempts) {
        return errorResult(mapError(error), {
          durationMs: Date.now() - startedAt,
          retries: attempt - 1
        });
      }

      await sleep(computeDelayMs(attempt, policy));
    }
  }

  return errorResult(
    {
      code: "GUARDIAN_INVARIANT",
      message: "Unexpected guardian exit path."
    },
    {
      durationMs: Date.now() - startedAt,
      retries: 0
    }
  );
};
