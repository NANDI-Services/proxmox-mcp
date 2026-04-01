# COOKBOOK

Example prompts you can copy and paste into your MCP client to explore what `nandi-proxmox-mcp` can do in real Proxmox environments.

> [!IMPORTANT]
> Some actions depend on your configured access tier (`read-only`, `read-execute`, `full`), enabled modules (`core` or `advanced`), and tool filters.
>
> Destructive or high-impact operations require explicit confirmation with `confirm=true`.

---

## 1) Cluster inventory and visibility

### Get a quick cluster overview
```text
Give me a concise overview of my Proxmox cluster: nodes, online/offline status, total CPU and RAM, storage pools, and the number of QEMU VMs and LXC containers.
List all nodes with resource pressure
List all Proxmox nodes with current CPU load, memory usage, disk usage, and uptime. Highlight anything that looks unhealthy or close to capacity.
Inventory all workloads
Create a table of all VMs and containers across the cluster including node, status, tags, CPU, memory, disk, IPs if available, and whether each workload looks production-like or disposable.
Find powered off or stale workloads
Show me all stopped VMs and containers, grouped by node, and identify which ones look like old or abandoned workloads.
2) Monitoring and anomaly detection
Detect hot spots in the cluster
Analyze current cluster usage and tell me which nodes, VMs, or containers are under the most pressure. Focus on CPU, memory, disk, and anything that may cause noisy-neighbor problems.
Look for workloads with unusual behavior
Review VM and container metrics and identify workloads with abnormal spikes, sustained high usage, or patterns that suggest a runaway process, memory leak, or bad deployment.
Build a lightweight health summary
Generate a health summary for the cluster with a traffic-light style result: healthy, warning, or critical. Include the top reasons for each warning or critical finding.
3) VM and container lifecycle operations
Start a workload safely
Start VM 201 and verify that it transitions to a healthy running state. Summarize what changed.
Restart a degraded container
Check container 105. If it is unhealthy or partially degraded, restart it and confirm whether it comes back cleanly.
Stop multiple non-critical workloads
Identify non-critical stopped or low-priority workloads that can be safely shut down now. Do not execute yet; show me the candidates first.
Execute a confirmed shutdown
Stop VM 220 with confirm=true and then verify that the shutdown completed successfully.
4) Snapshots, backup, and recovery workflows
Review backup coverage
Show me which VMs and containers have recent backups, which ones do not, and which critical workloads appear underprotected.
Validate snapshot sprawl
List all snapshots for my VMs and containers, grouped by workload. Highlight old, excessive, or suspicious snapshot chains that may need cleanup.
Backup readiness check
Assess whether the cluster is ready for backup operations right now. Include storage availability, recent task errors, and anything that could make backups fail.
Confirm a rollback action
Rollback VM 230 to snapshot "pre-release-2026-03-31" with confirm=true and summarize the outcome, including any risks I should validate after rollback.
5) Storage operations
Find storage pressure before it becomes a problem
Analyze all configured storage backends and tell me which ones are closest to capacity, which workloads depend on them, and where I should act first.
Identify oversized workloads
List the top 10 VMs or containers by disk usage and show where they are stored. Flag anything that looks oversized for its role.
Review storage usage by node
Create a per-node storage report showing local and shared storage usage, free space, and the biggest consumers.
6) Networking and firewall checks
Review network configuration at a high level
Summarize the cluster networking setup: bridges, VLAN-related details if visible, IP allocation patterns, and anything that looks misaligned or inconsistent.
Detect suspicious firewall drift
Review firewall-related configuration across nodes and workloads. Highlight differences, risky rules, or anything that looks like policy drift.
Pre-change validation
Before changing anything, inspect the current network and firewall state for VM 205 and tell me what could break if I migrate or restart it.
7) Access and security posture
Audit access-related configuration
Summarize access-related configuration in Proxmox and point out anything that looks too permissive, inconsistent, or worth reviewing from a least-privilege perspective.
Surface risky operational settings
Inspect the cluster for operational risks such as overly broad access, unclear ownership, suspicious configuration sprawl, or dangerous manual drift.
Safe review before destructive action
Tell me what guardrails apply if I want to delete an old VM, migrate a workload, or rollback a snapshot. I want the exact risks and checks first, not the action.
8) SSH diagnostics and host-side troubleshooting
Host diagnostic sweep
Run a diagnostic sweep on the Proxmox hosts and summarize SSH connectivity, disk pressure, failed services, and anything that needs attention.
Investigate one unhealthy node
Inspect node pve-01 and tell me why it may be degraded. Focus on host health, service failures, storage pressure, and recent task issues.
Check container-level issues from the host side
Investigate container 110 from the host side and tell me whether the issue looks like networking, storage, service failure, permissions, or an application problem.
9) CI/CD and self-hosted platform workflows
Find workloads related to a delivery pipeline
Identify the VMs and containers that look related to CI/CD, runners, registries, build agents, or preview environments. Summarize how they are distributed across the cluster.
Validate a self-hosted app platform
Review the workloads that support our internal development platform and tell me whether the environment looks stable enough to behave like a lightweight Vercel/Firebase/Cloudflare-style setup.
Pre-deploy infra validation
Before a deployment, verify that the target VM or container has enough CPU, memory, disk, and healthy host conditions. Summarize any infra risks that could affect rollout.
Post-deploy sanity check
After a deployment, inspect the target workload and surrounding node health to confirm whether the infrastructure side of the release looks healthy.
10) Optimization and cleanup
Find easy savings
Identify workloads that look idle, oversized, stopped for too long, or wasteful. Rank the top cleanup or optimization opportunities by likely impact.
Consolidation candidates
Review my cluster and propose candidates for consolidation, shutdown, or migration to improve resource efficiency without touching critical workloads.
Node balancing opportunities
Analyze whether the cluster looks imbalanced. Suggest which workloads may be good migration candidates to reduce pressure on the busiest nodes.
11) Incident response prompts
Triage a production issue
A production service hosted in Proxmox is slow. Start with cluster-wide triage, then narrow down likely affected nodes, VMs, or containers, and summarize the most probable infra-side causes.
Investigate a failed task
Review recent Proxmox task history and show failed or suspicious operations from the last 24 hours. Group them by node and explain likely causes.
Suspected resource exhaustion
Determine whether any current outage symptoms could be explained by CPU saturation, memory exhaustion, disk pressure, or storage contention.
12) Change execution with explicit confirmation
Confirm a reboot
Reboot container 115 with confirm=true, then verify that it returns to a healthy running state and summarize the impact.
Confirm a migration
Migrate VM 240 to another suitable node with confirm=true. Before execution, explain the target choice and any migration risks. After execution, verify the result.
Confirm a delete operation
Delete the old test VM 299 with confirm=true, but first summarize why it looks safe to remove and what evidence supports that conclusion.
13) Prompting tips

Use better prompts, get better outcomes:

State the scope: “all nodes”, “only VM 201”, “last 24 hours”, “production-tagged workloads only”.
Ask for action or analysis explicitly: “show”, “compare”, “rank”, “verify”, “restart”, “migrate”.
For risky actions, ask for a dry-run style explanation first.
For destructive changes, include confirm=true only when you are ready.
Ask for output shape when useful: “give me a table”, “summarize in bullets”, “rank top 5”, “group by node”.
14) Example progression

A good real-world flow often looks like this:

Inspect the cluster.
Identify the risky or unhealthy workload.
Ask for impact analysis.
Execute the change with confirm=true.
Verify post-change health.

Example:

Show me the current health of all nodes and highlight the busiest workloads.
Focus on VM 221 and explain whether it looks safe to restart.
Restart VM 221 with confirm=true and verify that it comes back healthy.
