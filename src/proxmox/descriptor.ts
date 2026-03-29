import type { z } from "zod";

export const httpMethodValues = ["GET", "POST", "PUT", "DELETE"] as const;
export type HttpMethod = (typeof httpMethodValues)[number];

export type EndpointDescriptor = {
  id: string;
  method: HttpMethod;
  path: string;
  pathParams?: readonly string[];
  queryParams?: readonly string[];
  bodyParams?: readonly string[];
  timeoutMs?: number;
  retries?: number;
  outputSchema?: z.ZodTypeAny;
};

export type EndpointRequest = {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  retries?: number;
};

const safeEncode = (value: string | number): string => encodeURIComponent(String(value));

export const buildEndpointRequest = (
  descriptor: EndpointDescriptor,
  args: Record<string, unknown>
): EndpointRequest => {
  let path = descriptor.path;

  for (const pathParam of descriptor.pathParams ?? []) {
    const raw = args[pathParam];
    if (typeof raw !== "string" && typeof raw !== "number") {
      throw new Error(`Missing or invalid path parameter: ${pathParam}`);
    }

    path = path.replace(`{${pathParam}}`, safeEncode(raw));
  }

  const query: Record<string, string | number | boolean | undefined> = {};
  const body: Record<string, string | number | boolean | undefined> = {};

  for (const key of descriptor.queryParams ?? []) {
    const value = args[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query[key] = value;
    }
  }

  for (const key of descriptor.bodyParams ?? []) {
    const value = args[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      body[key] = value;
    }
  }

  return {
    method: descriptor.method,
    path,
    query: Object.keys(query).length > 0 ? query : undefined,
    body: Object.keys(body).length > 0 ? body : undefined,
    timeoutMs: descriptor.timeoutMs,
    retries: descriptor.retries
  };
};
