export const proxmoxEndpoints = {
  listNodes: () => "/api2/json/nodes",
  nodeStatus: (node: string) => `/api2/json/nodes/${node}/status`,
  listVms: (node: string) => `/api2/json/nodes/${node}/qemu`,
  vmStatus: (node: string, vmid: number) => `/api2/json/nodes/${node}/qemu/${vmid}/status/current`,
  startVm: (node: string, vmid: number) => `/api2/json/nodes/${node}/qemu/${vmid}/status/start`,
  stopVm: (node: string, vmid: number) => `/api2/json/nodes/${node}/qemu/${vmid}/status/stop`,
  listContainers: (node: string) => `/api2/json/nodes/${node}/lxc`,
  containerStatus: (node: string, vmid: number) => `/api2/json/nodes/${node}/lxc/${vmid}/status/current`,
  startContainer: (node: string, vmid: number) => `/api2/json/nodes/${node}/lxc/${vmid}/status/start`,
  stopContainer: (node: string, vmid: number) => `/api2/json/nodes/${node}/lxc/${vmid}/status/stop`
};
