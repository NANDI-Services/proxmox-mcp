export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
};

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_500,
  jitter: true
};

/**
 * For operations that are not safe to repeat. A client-side timeout does not
 * prove the server rejected the request -- Proxmox may already have accepted
 * the task -- so retrying can create a second VM, clone, or backup, or re-run
 * an arbitrary command inside a container.
 */
export const singleAttemptPolicy: RetryPolicy = {
  ...defaultRetryPolicy,
  maxAttempts: 1
};

export const computeDelayMs = (attempt: number, policy: RetryPolicy): number => {
  const exp = Math.min(policy.baseDelayMs * 2 ** Math.max(0, attempt - 1), policy.maxDelayMs);
  if (!policy.jitter) {
    return exp;
  }

  const jitterFactor = 0.5 + Math.random();
  return Math.floor(exp * jitterFactor);
};
