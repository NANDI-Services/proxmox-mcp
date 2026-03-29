import { Agent, fetch } from "undici";
import type { RuntimeConfig } from "../config/validate.js";
import type { ProxmoxApiEnvelope, ProxmoxContainer, ProxmoxNode, ProxmoxVm } from "./types.js";
import { buildTokenHeader } from "./auth.js";
import { proxmoxEndpoints } from "./endpoints.js";
import { ProxmoxHttpError } from "./errors.js";
import { buildEndpointRequest, type EndpointDescriptor } from "./descriptor.js";

type Primitive = string | number | boolean;
type RequestInitCompat = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, Primitive | undefined>;
  body?: Record<string, Primitive | undefined>;
  timeoutMs?: number;
  retries?: number;
};

export class ProxmoxClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly dispatcher?: Agent;

  public constructor(private readonly config: RuntimeConfig) {
    this.baseUrl = `https://${config.proxmoxHost}:${config.proxmoxPort}`;
    this.authHeader = buildTokenHeader(config);

    if (config.allowInsecureTls) {
      this.dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false
        }
      });
    }
  }

  private buildUrl(path: string, query?: Record<string, Primitive | undefined>): string {
    const target = new URL(`${this.baseUrl}${path}`);
    if (!query) {
      return target.toString();
    }

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        target.searchParams.set(key, String(value));
      }
    }

    return target.toString();
  }

  private async performRequest<T>(path: string, init: RequestInitCompat): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = init.timeoutMs ?? 15_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const isBodyMethod = (init.method ?? "GET") !== "GET";
      const body =
        isBodyMethod && init.body
          ? new URLSearchParams(
              Object.fromEntries(
                Object.entries(init.body)
                  .filter(([, value]) => value !== undefined)
                  .map(([key, value]) => [key, String(value)])
              )
            ).toString()
          : undefined;

      const response = await fetch(this.buildUrl(path, init.query), {
        method: init.method ?? "GET",
        headers: {
          Authorization: this.authHeader,
          ...(isBodyMethod ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
        },
        body,
        dispatcher: this.dispatcher,
        signal: controller.signal
      });

      const text = await response.text();
      const parsed = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;

      if (!response.ok) {
        const detail = this.extractErrorDetail(parsed);
        const message = detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`;
        throw new ProxmoxHttpError(response.status, message, parsed);
      }

      const envelope = parsed as ProxmoxApiEnvelope<T>;
      return envelope.data;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Proxmox request timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private extractErrorDetail(body: unknown): string | undefined {
    if (!body || typeof body !== "object") {
      return undefined;
    }
    if ("message" in body && typeof body.message === "string" && body.message.length > 0) {
      return body.message;
    }
    if ("data" in body && typeof body.data === "string" && body.data.length > 0) {
      return body.data;
    }
    if ("errors" in body && body.errors && typeof body.errors === "object") {
      const entries = Object.entries(body.errors as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string" && value.length > 0)
        .map(([key, value]) => `${key}: ${String(value)}`);
      if (entries.length > 0) {
        return entries.join("; ");
      }
    }
    return undefined;
  }

  private async request<T>(path: string, init: RequestInitCompat = {}): Promise<T> {
    const retries = init.retries ?? 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.performRequest<T>(path, init);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  public async requestEndpoint<T>(descriptor: EndpointDescriptor, args: Record<string, unknown>): Promise<T> {
    const req = buildEndpointRequest(descriptor, args);
    const output = await this.request<T>(req.path, {
      method: req.method,
      query: req.query,
      body: req.body,
      timeoutMs: req.timeoutMs,
      retries: req.retries
    });

    if (descriptor.outputSchema) {
      return descriptor.outputSchema.parse(output) as T;
    }

    return output;
  }

  public async listNodes(): Promise<ProxmoxNode[]> {
    return await this.request<ProxmoxNode[]>(proxmoxEndpoints.listNodes());
  }

  public async getNodeStatus(node: string): Promise<Record<string, unknown>> {
    return await this.request<Record<string, unknown>>(proxmoxEndpoints.nodeStatus(node));
  }

  public async listVms(node: string): Promise<ProxmoxVm[]> {
    return await this.request<ProxmoxVm[]>(proxmoxEndpoints.listVms(node));
  }

  public async getVmStatus(node: string, vmid: number): Promise<Record<string, unknown>> {
    return await this.request<Record<string, unknown>>(proxmoxEndpoints.vmStatus(node, vmid));
  }

  public async startVm(node: string, vmid: number): Promise<string> {
    return await this.request<string>(proxmoxEndpoints.startVm(node, vmid), { method: "POST", timeoutMs: 20_000 });
  }

  public async stopVm(node: string, vmid: number): Promise<string> {
    return await this.request<string>(proxmoxEndpoints.stopVm(node, vmid), { method: "POST", timeoutMs: 20_000 });
  }

  public async listContainers(node: string): Promise<ProxmoxContainer[]> {
    return await this.request<ProxmoxContainer[]>(proxmoxEndpoints.listContainers(node));
  }

  public async getContainerStatus(node: string, vmid: number): Promise<Record<string, unknown>> {
    return await this.request<Record<string, unknown>>(proxmoxEndpoints.containerStatus(node, vmid));
  }

  public async startContainer(node: string, vmid: number): Promise<string> {
    return await this.request<string>(proxmoxEndpoints.startContainer(node, vmid), { method: "POST", timeoutMs: 20_000 });
  }

  public async stopContainer(node: string, vmid: number): Promise<string> {
    return await this.request<string>(proxmoxEndpoints.stopContainer(node, vmid), { method: "POST", timeoutMs: 20_000 });
  }
}
