import { Agent, fetch } from "undici";
import type { RuntimeConfig } from "../config/validate.js";
import type { ProxmoxApiEnvelope, ProxmoxContainer, ProxmoxNode, ProxmoxVm } from "./types.js";
import { buildTokenHeader } from "./auth.js";
import { proxmoxEndpoints } from "./endpoints.js";
import { ProxmoxHttpError } from "./errors.js";

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

  private async request<T>(path: string, init?: { method?: "GET" | "POST" }): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json"
      },
      dispatcher: this.dispatcher
    });

    const text = await response.text();
    const body = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      throw new ProxmoxHttpError(response.status, `HTTP ${response.status}`, body);
    }

    const envelope = body as ProxmoxApiEnvelope<T>;
    return envelope.data;
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
    return await this.request<string>(proxmoxEndpoints.startVm(node, vmid), { method: "POST" });
  }

  public async stopVm(node: string, vmid: number): Promise<string> {
    return await this.request<string>(proxmoxEndpoints.stopVm(node, vmid), { method: "POST" });
  }

  public async listContainers(node: string): Promise<ProxmoxContainer[]> {
    return await this.request<ProxmoxContainer[]>(proxmoxEndpoints.listContainers(node));
  }

  public async getContainerStatus(node: string, vmid: number): Promise<Record<string, unknown>> {
    return await this.request<Record<string, unknown>>(proxmoxEndpoints.containerStatus(node, vmid));
  }

  public async startContainer(node: string, vmid: number): Promise<string> {
    return await this.request<string>(proxmoxEndpoints.startContainer(node, vmid), { method: "POST" });
  }

  public async stopContainer(node: string, vmid: number): Promise<string> {
    return await this.request<string>(proxmoxEndpoints.stopContainer(node, vmid), { method: "POST" });
  }
}
