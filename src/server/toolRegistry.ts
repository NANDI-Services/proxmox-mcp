import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProxmoxClient } from "../proxmox/client.js";
import { NodeRouter } from "../ssh/nodeRouter.js";
import type { RuntimeConfig } from "../config/validate.js";
import { toolCatalog } from "../tools/catalog.js";
import { loadPolicySettings, PolicyEngine } from "./policy.js";
import type { ToolDescriptor } from "./toolMetadata.js";
import { logger } from "../logging/logger.js";

const asMcp = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(value, null, 2)
    }
  ]
});

const toolAnnotations = (descriptor: ToolDescriptor) => ({
  title: descriptor.title ?? descriptor.name,
  readOnlyHint: descriptor.accessTier === "read-only",
  destructiveHint: descriptor.destructive,
  idempotentHint: descriptor.idempotent,
  openWorldHint: false
});

type RegistryOptions = {
  transport: "stdio" | "http";
};

export const registerTools = (server: McpServer, config: RuntimeConfig, options: RegistryOptions): Set<string> => {
  const proxmoxClient = new ProxmoxClient(config);
  const ssh = {
    host: config.sshHost,
    port: config.sshPort,
    user: config.sshUser,
    keyPath: config.sshKeyPath,
    timeoutMs: 20_000
  };

  // One router per server instance so the discovered per-node route stays
  // cached for the process lifetime instead of being probed on every call.
  const router = new NodeRouter(proxmoxClient, config);

  const policy = new PolicyEngine(loadPolicySettings());
  let registered = 0;
  // Which canonical tools survived policy filtering. Prompt recipes are gated
  // on this so a read-only install is never offered a recipe it cannot run.
  const registeredNames = new Set<string>();

  for (const descriptor of toolCatalog) {
    if (!policy.shouldRegister(descriptor, options.transport)) {
      continue;
    }

    server.registerTool(
      descriptor.name,
      {
        description: descriptor.description,
        inputSchema: descriptor.inputShape,
        annotations: toolAnnotations(descriptor),
        _meta: {
          category: descriptor.category,
          accessTier: descriptor.accessTier,
          destructive: descriptor.destructive,
          confirmRequired: descriptor.confirmRequired,
          idempotent: descriptor.idempotent,
          transport: descriptor.transport,
          module: descriptor.module,
          deprecated: descriptor.deprecated === true
        }
      },
      async (args) => {
        if (descriptor.argGuard) {
          const validation = descriptor.argGuard(args as Record<string, unknown>);
          if (!validation.ok) {
            return asMcp({
              ok: false,
              error: {
                code: "TOOL_INPUT_REJECTED",
                message: validation.message ?? "Input rejected by tool guard.",
                hint: validation.hint
              },
              meta: {
                tool: descriptor.name
              }
            });
          }
        }

        const guard = policy.guardConfirmation(descriptor, args as Record<string, unknown>);
        if (!guard.ok) {
          return asMcp({
            ok: false,
            error: {
              code: "CONFIRMATION_REQUIRED",
              message: guard.message,
              hint: "Re-run with confirm=true to execute this operation.",
              impact: guard.impact
            },
            meta: {
              tool: descriptor.name
            }
          });
        }

        return asMcp(await descriptor.execute(args as Record<string, unknown>, { client: proxmoxClient, ssh, router, transport: options.transport }));
      }
    );
    registered += 1;
    registeredNames.add(descriptor.name);

    for (const alias of descriptor.aliases ?? []) {
      server.registerTool(
        alias,
        {
          description: `${descriptor.description} (alias for ${descriptor.name})`,
          inputSchema: descriptor.inputShape,
          annotations: toolAnnotations(descriptor),
          _meta: {
            aliasFor: descriptor.name,
            deprecated: true
          }
        },
        async (args) => {
          if (descriptor.argGuard) {
            const validation = descriptor.argGuard(args as Record<string, unknown>);
            if (!validation.ok) {
              return asMcp({
                ok: false,
                error: {
                  code: "TOOL_INPUT_REJECTED",
                  message: validation.message ?? "Input rejected by tool guard.",
                  hint: validation.hint
                },
                meta: {
                  tool: alias,
                  aliasFor: descriptor.name
                }
              });
            }
          }

          const guard = policy.guardConfirmation(descriptor, args as Record<string, unknown>);
          if (!guard.ok) {
            return asMcp({
              ok: false,
              error: {
                code: "CONFIRMATION_REQUIRED",
                message: guard.message,
                hint: "Re-run with confirm=true to execute this operation.",
                impact: guard.impact
              },
              meta: {
                tool: alias,
                aliasFor: descriptor.name
              }
            });
          }

          return asMcp(await descriptor.execute(args as Record<string, unknown>, { client: proxmoxClient, ssh, router, transport: options.transport }));
        }
      );
      registered += 1;
    }
  }

  logger.info("Tool registry initialized", { registered, transport: options.transport });
  return registeredNames;
};
