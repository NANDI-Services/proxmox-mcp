export type ToolError = {
  code: string;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
};

export type ToolMeta = {
  durationMs: number;
  retries: number;
  timestamp: string;
};

export type ToolResult<T> = {
  ok: boolean;
  data?: T;
  error?: ToolError;
  meta: ToolMeta;
};

export const okResult = <T>(data: T, meta: Omit<ToolMeta, "timestamp">): ToolResult<T> => ({
  ok: true,
  data,
  meta: {
    ...meta,
    timestamp: new Date().toISOString()
  }
});

export const errorResult = (error: ToolError, meta: Omit<ToolMeta, "timestamp">): ToolResult<never> => ({
  ok: false,
  error,
  meta: {
    ...meta,
    timestamp: new Date().toISOString()
  }
});
