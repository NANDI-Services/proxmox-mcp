import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../logging/logger.js";

/**
 * Starter recipes.
 *
 * A client that connects to this server sees north of a hundred tools and no
 * indication of where to begin, which is a real barrier for someone whose first
 * question is "what do I even ask it?". MCP prompts are the protocol's answer:
 * clients surface them as ready-made commands, so the first useful action is a
 * pick from a list rather than a blank line.
 *
 * Each one declares the tools it needs. Registration is skipped when those
 * tools are not registered -- offering "delete every stale backup" to a
 * read-only install would be an invitation to an error message.
 */

export type PromptRecipe = {
  name: string;
  title: string;
  description: string;
  /** Every tool this recipe needs. All must be registered for it to appear. */
  requires: string[];
  body: string;
};

/**
 * Note on shape: Proxmox lists guests and tasks *per node*, not cluster-wide
 * (`/nodes/{node}/qemu`, `/nodes/{node}/lxc`, `/nodes/{node}/tasks`). So every
 * recipe that spans the installation has to start by listing nodes and then
 * iterate. Saying so in the prompt is not hand-holding: without it the model
 * looks for a cluster-wide inventory call that does not exist.
 */
export const promptCatalog: PromptRecipe[] = [
  {
    name: "cluster-health",
    title: "Check cluster health",
    description: "Nodes, quorum and resource pressure, summarized.",
    requires: ["pve_list_nodes", "pve_get_node_status"],
    body: [
      "Give me a health check of my Proxmox installation.",
      "",
      "1. List the nodes and say which are online.",
      "2. For each online node, get its status and report CPU load, memory use and root filesystem use.",
      "3. Get the cluster status and state whether it is quorate. A standalone node has no quorum",
      "   to report, which is normal rather than a fault.",
      "",
      "Finish with a short verdict: what needs attention, and what can wait.",
      "Report only what the tools return. If something cannot be read, say so instead of estimating."
    ].join("\n")
  },
  {
    name: "guest-inventory",
    title: "Inventory VMs and containers",
    description: "Every guest, where it runs, and whether it is running.",
    requires: ["pve_list_nodes", "pve_list_qemu_vms", "pve_list_lxc_containers"],
    body: [
      "Show me an inventory of every VM and container.",
      "",
      "Guests are listed per node, so list the nodes first, then list the QEMU VMs and the LXC",
      "containers on each one.",
      "",
      "Present a single table: ID, name, type (VM or CT), node, status, configured memory.",
      "Sort by node, then by ID.",
      "",
      "Below it, call out anything worth a second look: stopped guests, guests with no name, or a",
      "node carrying noticeably more than the others.",
      "If a node cannot be queried, list it as unread rather than leaving it out of the table."
    ].join("\n")
  },
  {
    name: "backup-audit",
    title: "Find guests without backups",
    description: "Cross-checks guests against backup jobs to find what is unprotected.",
    requires: ["pve_list_nodes", "pve_list_qemu_vms", "pve_list_lxc_containers", "pve_list_backup_jobs"],
    body: [
      "Audit my backup coverage.",
      "",
      "1. Build the full guest list: list nodes, then the VMs and containers on each.",
      "2. List the configured backup jobs and what each one selects.",
      "3. Name the guests that no job covers.",
      "",
      "Be explicit about uncertainty. A job set to 'all' on one node does not cover another node's",
      "guests, and a job's schedule says nothing about whether it last succeeded. If you cannot",
      "tell whether a guest is covered, list it as unknown -- never as covered.",
      "",
      "This tells you what is scheduled, not what was actually written. Treat it as a starting point."
    ].join("\n")
  },
  {
    name: "troubleshoot-guest",
    title: "Troubleshoot one guest",
    description: "Walks status and recent tasks for a single VM or container.",
    requires: ["pve_list_nodes", "pve_list_qemu_vms", "pve_list_lxc_containers", "pve_list_tasks"],
    body: [
      "Something is wrong with one of my guests. Ask me for its ID if I have not given it, then:",
      "",
      "1. Find which node it lives on by listing the guests on each node.",
      "2. Report its current status and resource allocation.",
      "3. List recent tasks on that node and quote any failed ones involving this guest.",
      "",
      "Then give me the most likely cause and the single next thing to check.",
      "Do not change anything: this is a diagnosis, not a repair. If a fix needs running, describe",
      "it and wait for me to ask."
    ].join("\n")
  }
];

export const applicableRecipes = (registeredTools: ReadonlySet<string>): PromptRecipe[] =>
  promptCatalog.filter((recipe) => recipe.requires.every((tool) => registeredTools.has(tool)));

export const registerPrompts = (server: McpServer, registeredTools: ReadonlySet<string>): number => {
  const recipes = applicableRecipes(registeredTools);

  for (const recipe of recipes) {
    server.registerPrompt(
      recipe.name,
      {
        title: recipe.title,
        description: recipe.description,
        argsSchema: {}
      },
      () => ({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: recipe.body }
          }
        ]
      })
    );
  }

  logger.info("Prompt recipes registered", { registered: recipes.length, available: promptCatalog.length });
  return recipes.length;
};
