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

export const computeDelayMs = (attempt: number, policy: RetryPolicy): number => {
  const exp = Math.min(policy.baseDelayMs * 2 ** Math.max(0, attempt - 1), policy.maxDelayMs);
  if (!policy.jitter) {
    return exp;
  }

  const jitterFactor = 0.5 + Math.random();
  return Math.floor(exp * jitterFactor);
};
