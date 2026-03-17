export const withTimeout = async <T>(promiseFactory: () => Promise<T>, timeoutMs: number): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const handle = setTimeout(() => {
      clearTimeout(handle);
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return await Promise.race([promiseFactory(), timeoutPromise]);
};
