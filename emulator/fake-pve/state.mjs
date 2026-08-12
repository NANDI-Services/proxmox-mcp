/**
 * In-memory model of a small Proxmox cluster.
 *
 * Deliberately not a full PVE implementation: it models exactly the resources
 * and the task lifecycle that the MCP tool catalog exercises, and answers 501
 * for everything else so unimplemented tools fail loudly instead of silently
 * returning undefined.
 */

const DEFAULT_TASK_DURATION_MS = 250;

const nowSec = () => Math.floor(Date.now() / 1000);
const hex = (value, width) => value.toString(16).padStart(width, "0");

/**
 * Node addresses as the cluster reports them. In a real deployment these are
 * the corosync ring addresses, which frequently are NOT reachable from an
 * operator's workstation -- which is exactly the case the node router has to
 * survive. `pve03` is deliberately unreachable to model a node behind an
 * internal-only network.
 */
const DEFAULT_NODE_ADDRESSES = {
  pve01: "pve-ssh",
  pve02: "pve-ssh-2",
  pve03: "pve03.internal.invalid"
};

export const createState = ({
  taskDurationMs = DEFAULT_TASK_DURATION_MS,
  mode = "cluster",
  clusterName = "emu-cluster",
  nodeAddresses = DEFAULT_NODE_ADDRESSES
} = {}) => {
  const state = {
    taskDurationMs,
    mode,
    clusterName,
    nodeAddresses,
    nodes: [],
    qemu: new Map(),
    lxc: new Map(),
    storage: [],
    tasks: new Map(),
    taskSeq: 0,
    nextVmid: 100
  };

  const reset = () => {
    const allNodes = [
      { node: "pve01", status: "online", type: "node", cpu: 0.07, maxcpu: 8, mem: 4294967296, maxmem: 17179869184, uptime: 864000, level: "" },
      { node: "pve02", status: "online", type: "node", cpu: 0.03, maxcpu: 8, mem: 2147483648, maxmem: 17179869184, uptime: 863000, level: "" },
      { node: "pve03", status: "online", type: "node", cpu: 0.11, maxcpu: 16, mem: 8589934592, maxmem: 34359738368, uptime: 862000, level: "" }
    ];

    state.nodes = state.mode === "standalone" ? allNodes.slice(0, 1) : allNodes;

    // Guests are spread across nodes on purpose: a container that does not live
    // on the entry node is the whole point of the routing tests.
    const qemuGuests = [
      { vmid: 101, name: "vm-web", node: "pve01", status: "running", cpus: 2, maxmem: 2147483648, uptime: 86400, config: { name: "vm-web", memory: 2048, cores: 2, sockets: 1, onboot: 1 }, snapshots: [] },
      { vmid: 102, name: "vm-db", node: "pve03", status: "running", cpus: 4, maxmem: 4294967296, uptime: 8000, config: { name: "vm-db", memory: 4096, cores: 4, sockets: 1 }, snapshots: [] }
    ];

    const lxcGuests = [
      { vmid: 201, name: "ct-docker", node: "pve01", status: "running", cpus: 1, maxmem: 1073741824, uptime: 43200, config: { hostname: "ct-docker", memory: 1024, cores: 1, swap: 512 }, snapshots: [] },
      // On a non-entry node that IS reachable by hop.
      { vmid: 202, name: "ct-remote", node: "pve02", status: "running", cpus: 1, maxmem: 536870912, uptime: 21600, config: { hostname: "ct-remote", memory: 512, cores: 1, swap: 256 }, snapshots: [] },
      // On a node that cannot be reached at all: exercises the failure path.
      { vmid: 203, name: "ct-unreachable", node: "pve03", status: "running", cpus: 1, maxmem: 536870912, uptime: 100, config: { hostname: "ct-unreachable", memory: 512, cores: 1 }, snapshots: [] }
    ];

    const known = new Set(state.nodes.map((entry) => entry.node));
    state.qemu = new Map(qemuGuests.filter((guest) => known.has(guest.node)).map((guest) => [guest.vmid, guest]));
    state.lxc = new Map(lxcGuests.filter((guest) => known.has(guest.node)).map((guest) => [guest.vmid, guest]));

    state.storage = [
      { storage: "local", type: "dir", content: "vztmpl,iso,backup", active: 1, enabled: 1, total: 107374182400, used: 21474836480, avail: 85899345920 },
      { storage: "local-lvm", type: "lvmthin", content: "rootdir,images", active: 1, enabled: 1, total: 214748364800, used: 42949672960, avail: 171798691840 }
    ];

    state.tasks = new Map();
    state.taskSeq = 0;
    state.nextVmid = 100;
  };

  /**
   * Mutations in Proxmox are asynchronous: they return a UPID immediately and
   * the caller polls the task endpoint. Modelling this is what lets the e2e
   * suite exercise the real create -> poll -> verify loop.
   */
  const startTask = (node, type, id, user = "svc_mcp@pve") => {
    state.taskSeq += 1;
    const started = nowSec();
    const upid = `UPID:${node}:${hex(state.taskSeq, 8)}:${hex(state.taskSeq * 7, 8)}:${hex(started, 8)}:${type}:${id}:${user}:`;

    state.tasks.set(upid, {
      upid,
      node,
      type,
      id: String(id),
      user,
      starttime: started,
      startedAtMs: Date.now(),
      log: [`starting ${type} for ${id}`, "task ok"]
    });

    return upid;
  };

  const taskStatus = (upid) => {
    const task = state.tasks.get(upid);
    if (!task) {
      return undefined;
    }

    const finished = Date.now() - task.startedAtMs >= state.taskDurationMs;
    return finished
      ? { upid, node: task.node, type: task.type, id: task.id, user: task.user, starttime: task.starttime, status: "stopped", exitstatus: "OK" }
      : { upid, node: task.node, type: task.type, id: task.id, user: task.user, starttime: task.starttime, status: "running" };
  };

  const taskLog = (upid) => {
    const task = state.tasks.get(upid);
    if (!task) {
      return undefined;
    }
    return task.log.map((line, index) => ({ n: index + 1, t: line }));
  };

  const listTasks = (node, limit) => {
    const all = [...state.tasks.values()]
      .filter((task) => task.node === node)
      .map((task) => taskStatus(task.upid))
      .reverse();
    return typeof limit === "number" ? all.slice(0, limit) : all;
  };

  const collectionFor = (kind) => (kind === "qemu" ? state.qemu : state.lxc);

  const listGuests = (kind, node) =>
    [...collectionFor(kind).values()]
      .filter((guest) => guest.node === node)
      .map(({ config: _config, snapshots: _snapshots, ...rest }) => rest);

  const getGuest = (kind, vmid) => collectionFor(kind).get(Number(vmid));

  const allocateVmid = () => {
    const used = new Set([...state.qemu.keys(), ...state.lxc.keys()]);
    let candidate = state.nextVmid;
    while (used.has(candidate)) {
      candidate += 1;
    }
    state.nextVmid = candidate + 1;
    return candidate;
  };

  const createGuest = (kind, node, vmid, body) => {
    const id = Number(vmid);
    const name = kind === "qemu" ? (body.name ?? `vm-${id}`) : (body.hostname ?? `ct-${id}`);

    collectionFor(kind).set(id, {
      vmid: id,
      name,
      node,
      status: "stopped",
      cpus: Number(body.cores ?? 1),
      maxmem: Number(body.memory ?? 512) * 1024 * 1024,
      uptime: 0,
      config: { ...body, ...(kind === "qemu" ? { name } : { hostname: name }) },
      snapshots: []
    });

    return startTask(node, kind === "qemu" ? "qmcreate" : "vzcreate", id);
  };

  const deleteGuest = (kind, node, vmid) => {
    const id = Number(vmid);
    collectionFor(kind).delete(id);
    return startTask(node, kind === "qemu" ? "qmdestroy" : "vzdestroy", id);
  };

  const setGuestStatus = (kind, node, vmid, op) => {
    const guest = getGuest(kind, vmid);
    if (!guest) {
      return undefined;
    }

    const running = ["start", "resume", "reboot", "reset"].includes(op);
    guest.status = op === "suspend" ? "paused" : running ? "running" : "stopped";
    guest.uptime = guest.status === "running" ? 1 : 0;

    return startTask(node, `${kind === "qemu" ? "qm" : "vz"}${op}`, Number(vmid));
  };

  const cluster = {
    /**
     * Mirrors the real endpoint: a standalone node returns only its own entry
     * and no `cluster` record, which is how callers tell the two apart.
     */
    status: () => {
      const nodeEntries = state.nodes.map((node, index) => ({
        type: "node",
        id: `node/${node.node}`,
        name: node.node,
        ip: state.nodeAddresses[node.node] ?? node.node,
        online: 1,
        local: index === 0 ? 1 : 0,
        nodeid: index + 1,
        level: ""
      }));

      if (state.mode === "standalone") {
        return nodeEntries;
      }

      return [
        {
          type: "cluster",
          id: "cluster",
          name: state.clusterName,
          version: 3,
          nodes: state.nodes.length,
          quorate: 1
        },
        ...nodeEntries
      ];
    },
    resources: () => [
      ...state.nodes.map((node) => ({ id: `node/${node.node}`, type: "node", node: node.node, status: node.status, maxcpu: node.maxcpu, maxmem: node.maxmem })),
      ...[...state.qemu.values()].map((vm) => ({ id: `qemu/${vm.vmid}`, type: "qemu", vmid: vm.vmid, name: vm.name, node: vm.node, status: vm.status })),
      ...[...state.lxc.values()].map((ct) => ({ id: `lxc/${ct.vmid}`, type: "lxc", vmid: ct.vmid, name: ct.name, node: ct.node, status: ct.status }))
    ]
  };

  reset();

  return {
    raw: state,
    reset,
    startTask,
    taskStatus,
    taskLog,
    listTasks,
    listGuests,
    getGuest,
    allocateVmid,
    createGuest,
    deleteGuest,
    setGuestStatus,
    cluster,
    nodeByName: (name) => state.nodes.find((node) => node.node === name),
    setTaskDuration: (ms) => {
      state.taskDurationMs = ms;
    }
  };
};
