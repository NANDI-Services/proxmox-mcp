import type { RuntimeConfig } from "../config/validate.js";
import { ProxmoxClient } from "../proxmox/client.js";
import type { ToolResult } from "../guardian/result.js";
import { listContainers, listNodes, listVMs } from "../tools/inventory.js";
import { getContainerStatus, getNodeStatus, getVMStatus } from "../tools/status.js";
import { startContainer, startVM, stopContainer, stopVM } from "../tools/control.js";
import { dockerLogsInContainer, dockerPsInContainer, execInContainer, runRemoteDiagnostic } from "../tools/operations.js";
import { sshBatchDiagnostics } from "../tools/diagnostics.js";
import { schemas } from "./schemas.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const registerTools = (server: McpServer, config: RuntimeConfig): void => {
  const proxmoxClient = new ProxmoxClient(config);
  const ssh = {
    host: config.sshHost,
    port: config.sshPort,
    user: config.sshUser,
    keyPath: config.sshKeyPath,
    timeoutMs: 20_000
  };

  const asMcp = <T>(result: ToolResult<T>) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }
    ]
  });

  server.tool("listNodes", "List Proxmox nodes.", schemas.emptyShape, async () => asMcp(await listNodes(proxmoxClient)));
  server.tool("listVMs", "List VMs (node optional).", schemas.byNodeOptionalShape, async ({ node }) => asMcp(await listVMs(proxmoxClient, node)));
  server.tool(
    "listContainers",
    "List LXC containers (node optional).",
    schemas.byNodeOptionalShape,
    async ({ node }) => asMcp(await listContainers(proxmoxClient, node))
  );

  server.tool("getNodeStatus", "Get node status.", schemas.byNodeShape, async ({ node }) => asMcp(await getNodeStatus(proxmoxClient, node)));
  server.tool("getVMStatus", "Get VM status.", schemas.byVmShape, async ({ node, vmid }) => asMcp(await getVMStatus(proxmoxClient, node, vmid)));
  server.tool(
    "getContainerStatus",
    "Get container status.",
    schemas.byContainerShape,
    async ({ node, vmid }) => asMcp(await getContainerStatus(proxmoxClient, node, vmid))
  );

  server.tool("startVM", "Start a VM.", schemas.byVmShape, async ({ node, vmid }) => asMcp(await startVM(proxmoxClient, node, vmid)));
  server.tool("stopVM", "Stop a VM.", schemas.byVmShape, async ({ node, vmid }) => asMcp(await stopVM(proxmoxClient, node, vmid)));
  server.tool(
    "startContainer",
    "Start an LXC container.",
    schemas.byContainerShape,
    async ({ node, vmid }) => asMcp(await startContainer(proxmoxClient, node, vmid))
  );
  server.tool(
    "stopContainer",
    "Stop an LXC container.",
    schemas.byContainerShape,
    async ({ node, vmid }) => asMcp(await stopContainer(proxmoxClient, node, vmid))
  );

  server.tool("execInContainer", "Run command in container via pct exec.", schemas.execInContainerShape, async ({ ctid, command }) => {
    return asMcp(await execInContainer(ssh, ctid, command));
  });
  server.tool("dockerPsInContainer", "Run docker ps in CT.", schemas.dockerPsShape, async ({ ctid }) => asMcp(await dockerPsInContainer(ssh, ctid)));
  server.tool("dockerLogsInContainer", "Fetch docker logs in CT.", schemas.dockerLogsShape, async ({ ctid, containerName, tail }) => {
    return asMcp(await dockerLogsInContainer(ssh, ctid, containerName, tail));
  });
  server.tool("runRemoteDiagnostic", "Run safe diagnostic command in CT.", schemas.remoteDiagnosticShape, async ({ ctid, command }) => {
    return asMcp(await runRemoteDiagnostic(ssh, ctid, command));
  });

  server.tool("sshBatchDiagnostics", "Diagnose SSH batch failures.", schemas.emptyShape, async () => asMcp(await sshBatchDiagnostics(ssh)));
};
