import type { ProxmoxClient } from "../proxmox/client.js";
import type { RuntimeConfig } from "../config/validate.js";
import type { SshBatchOptions } from "./sshClient.js";

/**
 * Routes SSH-backed tools to the node that actually hosts a guest.
 *
 * The Proxmox REST API is already cluster-wide: pveproxy forwards a request
 * aimed at another node automatically. `pct` is not -- it is a node-local CLI,
 * so a container on node B cannot be reached by running `pct` on node A.
 *
 * Two facts make this solvable without asking the admin to configure anything:
 *
 *  1. `/cluster/resources` reports which node holds every guest.
 *  2. In a cluster, `/root/.ssh/authorized_keys` is a symlink to
 *     `/etc/pve/priv/authorized_keys` on the shared pmxcfs filesystem, so one
 *     authorized key works on every node, and nodes already trust each other.
 *
 * So we resolve the node, then either connect to it directly or hop through the
 * entry host. Which of the two works is discovered and cached, because it
 * depends on the operator's network, not on Proxmox.
 */

const shellEscape = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

export type ResolvedTarget = {
  node: string;
  ssh: SshBatchOptions;
  /** Identity for a direct connection; wraps in a nested ssh for a hop. */
  wrapCommand: (remoteCommand: string) => string;
  route: "direct" | "hop";
};

export class SshDisabledError extends Error {
  public constructor() {
    super(
      "SSH is disabled for this Proxmox connection (sshStrategy: \"disabled\"), " +
        "so container command execution is unavailable. REST API tools still work."
    );
    this.name = "SshDisabledError";
  }
}

export class GuestNotFoundError extends Error {
  public constructor(vmid: number) {
    super(`No VM or container with id ${vmid} exists in this Proxmox installation.`);
    this.name = "GuestNotFoundError";
  }
}

type ClusterResource = {
  type?: string;
  vmid?: number;
  node?: string;
};

type ClusterStatusEntry = {
  type?: string;
  name?: string;
  ip?: string;
  local?: number;
  online?: number;
  quorate?: number;
  nodes?: number;
};

export type ClusterTopology = {
  isCluster: boolean;
  clusterName?: string;
  quorate?: boolean;
  nodes: Array<{ name: string; ip?: string; local: boolean; online: boolean }>;
};

/**
 * Reads cluster membership. A standalone node answers with a single node entry
 * and no cluster entry, which is exactly how we tell the two apart.
 */
export const readClusterTopology = async (client: ProxmoxClient): Promise<ClusterTopology> => {
  const entries = await client.requestEndpoint<ClusterStatusEntry[]>(
    { id: "cluster.status", method: "GET", path: "/api2/json/cluster/status" },
    {}
  );

  const list = Array.isArray(entries) ? entries : [];
  const clusterEntry = list.find((entry) => entry.type === "cluster");
  const nodes = list
    .filter((entry) => entry.type === "node" && typeof entry.name === "string")
    .map((entry) => ({
      name: entry.name as string,
      ip: entry.ip,
      local: entry.local === 1,
      // A standalone node omits `online`; treat absence as online.
      online: entry.online === undefined ? true : entry.online === 1
    }));

  return {
    isCluster: Boolean(clusterEntry),
    clusterName: clusterEntry?.name,
    quorate: clusterEntry ? clusterEntry.quorate === 1 : undefined,
    nodes
  };
};

export class NodeRouter {
  private topology?: ClusterTopology;
  private readonly routeCache = new Map<string, "direct" | "hop">();

  public constructor(
    private readonly client: ProxmoxClient,
    private readonly config: RuntimeConfig
  ) {}

  private baseSsh(): SshBatchOptions {
    return {
      host: this.config.sshHost,
      port: this.config.sshPort,
      user: this.config.sshUser,
      keyPath: this.config.sshKeyPath,
      timeoutMs: 20_000
    };
  }

  public async topologySnapshot(): Promise<ClusterTopology> {
    this.topology ??= await readClusterTopology(this.client);
    return this.topology;
  }

  /** Finds the node hosting a guest. Cluster-wide, so it works from any node. */
  public async resolveNodeForGuest(vmid: number): Promise<string> {
    const resources = await this.client.requestEndpoint<ClusterResource[]>(
      {
        id: "cluster.resources",
        method: "GET",
        path: "/api2/json/cluster/resources",
        queryParams: ["type"]
      },
      { type: "vm" }
    );

    const match = (Array.isArray(resources) ? resources : []).find((entry) => Number(entry.vmid) === vmid);
    if (!match?.node) {
      throw new GuestNotFoundError(vmid);
    }

    return match.node;
  }

  /**
   * True when the entry host we already SSH into is the node in question, in
   * which case no routing is needed at all.
   */
  private async isEntryNode(node: string): Promise<boolean> {
    // Recorded by setup, which asks the node its own hostname over SSH.
    if (this.config.sshNodeName) {
      return this.config.sshNodeName === node;
    }

    if (this.config.sshHost === node) {
      return true;
    }

    const topology = await this.topologySnapshot();
    const entry = topology.nodes.find((candidate) => candidate.name === node);
    if (entry?.ip && entry.ip === this.config.sshHost) {
      return true;
    }

    // Single-node installs always route through the entry host.
    return topology.nodes.length <= 1;
  }

  private async addressFor(node: string): Promise<string> {
    const override = this.config.sshNodes?.[node];
    if (override) {
      return override.host;
    }

    const topology = await this.topologySnapshot();
    const entry = topology.nodes.find((candidate) => candidate.name === node);
    // Fall back to the node name: cluster members resolve each other by name.
    return entry?.ip ?? node;
  }

  private directTarget(node: string, host: string): ResolvedTarget {
    const override = this.config.sshNodes?.[node];
    return {
      node,
      route: "direct",
      ssh: {
        ...this.baseSsh(),
        host,
        port: override?.port ?? this.config.sshPort,
        user: override?.user ?? this.config.sshUser
      },
      wrapCommand: (remoteCommand) => remoteCommand
    };
  }

  private hopTarget(node: string, address: string): ResolvedTarget {
    return {
      node,
      route: "hop",
      ssh: this.baseSsh(),
      // Runs on the entry node, which already trusts its peers through the
      // cluster's shared authorized_keys.
      wrapCommand: (remoteCommand) =>
        `ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR ` +
        `-o ConnectTimeout=10 ${address} ${shellEscape(remoteCommand)}`
    };
  }

  /**
   * Returns every route worth attempting, in order. `auto` yields the direct
   * route first and the hop as a fallback; the caller records which succeeded.
   */
  public async routesForNode(node: string): Promise<ResolvedTarget[]> {
    if (this.config.sshStrategy === "disabled") {
      throw new SshDisabledError();
    }

    if (await this.isEntryNode(node)) {
      return [this.directTarget(node, this.config.sshHost)];
    }

    const address = await this.addressFor(node);

    if (this.config.sshStrategy === "direct") {
      return [this.directTarget(node, address)];
    }
    if (this.config.sshStrategy === "hop") {
      return [this.hopTarget(node, address)];
    }

    const cached = this.routeCache.get(node);
    if (cached === "direct") {
      return [this.directTarget(node, address)];
    }
    if (cached === "hop") {
      return [this.hopTarget(node, address)];
    }

    return [this.directTarget(node, address), this.hopTarget(node, address)];
  }

  public rememberWorkingRoute(node: string, route: "direct" | "hop"): void {
    this.routeCache.set(node, route);
  }

  public async routesForGuest(vmid: number): Promise<ResolvedTarget[]> {
    const node = await this.resolveNodeForGuest(vmid);
    return await this.routesForNode(node);
  }
}
