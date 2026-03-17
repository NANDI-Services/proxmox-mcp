import type { RuntimeConfig } from "../config/validate.js";

export type ProxmoxNode = {
  node: string;
  status: "online" | "offline" | "unknown";
  uptime?: number;
  cpu?: number;
  mem?: number;
};

export type ProxmoxVm = {
  vmid: number;
  name: string;
  node: string;
  status: string;
  uptime?: number;
};

export type ProxmoxContainer = {
  vmid: number;
  name: string;
  node: string;
  status: string;
  uptime?: number;
};

export type ProxmoxApiEnvelope<T> = {
  data: T;
};

export type ProxmoxClientContext = {
  config: RuntimeConfig;
};
