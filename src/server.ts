import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { BitwardenCli } from "./bitwarden.js";
import { binaryStatus } from "./cli.js";
import { getBwInstallHint } from "./install.js";
import {
  buildEffectiveBwEnv,
  deleteKeychainSecret,
  getKeychainStatus,
  KEYCHAIN_SECRET_NAMES,
  saveKeychainSecrets
} from "./keychain.js";
import { redactObject } from "./redact.js";
import { addTargetToSshAgent, commandConfirmation, runSshCommand } from "./ssh.js";
import {
  extractSshTarget,
  isAllowedItem,
  summarizeItem,
  type BridgePolicy
} from "./vault.js";

export function buildServer(env: NodeJS.ProcessEnv = process.env): McpServer {
  const server = new McpServer({
    name: "codex-vaultwarden-bridge",
    version: "0.1.0"
  });
  const policy = loadPolicy(env);

  registerReadTool(server, "get_bridge_status", "Show bw, ssh, and ssh-agent status.", {}, async () => {
    const effectiveEnv = await buildEffectiveBwEnv(env, { ignoreKeychainErrors: true });
    const bw = new BitwardenCli(effectiveEnv);
    const [bwStatus, sshStatus, sshAddStatus] = await Promise.all([
      bw.status(),
      binaryStatus("ssh"),
      binaryStatus("ssh-add")
    ]);
    return {
      bitwarden: bwStatus,
      ssh: sshStatus,
      sshAdd: sshAddStatus,
      policy,
      keychain: await getKeychainStatus(env),
      environment: environmentStatus(env)
    };
  });

  registerReadTool(
    server,
    "get_bw_install_hint",
    "Return OS-aware Bitwarden CLI installation guidance. This tool never installs software.",
    {},
    async () => getBwInstallHint()
  );

  server.registerTool(
    "configure_bw_server",
    {
      title: "Configure Bitwarden server",
      description: "Run bw config server <url>. This stores the Vaultwarden server URL in bw CLI config.",
      inputSchema: {
        server_url: z.string().url().describe("Vaultwarden server URL, for example https://vault.example.com.")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (args) => wrap(() => new BitwardenCli(env).configureServer(args.server_url))
  );

  server.registerTool(
    "login_with_api_key",
    {
      title: "Login with Bitwarden API key",
      description:
        "Run bw login --apikey using BW_CLIENTID and BW_CLIENTSECRET from the plugin environment or macOS Keychain. Does not unlock the vault.",
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () =>
      wrap(async () => {
        const bwEnv = await buildEffectiveBwEnv(env);
        return new BitwardenCli(bwEnv).loginWithApiKey();
      })
  );

  server.registerTool(
    "login_with_keychain",
    {
      title: "Login with Keychain Bitwarden API key",
      description:
        "Load BW_SERVER, BW_CLIENTID, and BW_CLIENTSECRET from macOS Keychain when missing from the environment, configure the server when present, and run bw login --apikey.",
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () =>
      wrap(async () => {
        const bwEnv = await buildEffectiveBwEnv(env);
        const bw = new BitwardenCli(bwEnv);
        const configuredServer = bwEnv.BW_SERVER
          ? await bw.configureServer(bwEnv.BW_SERVER)
          : undefined;
        const login = await bw.loginWithApiKey();
        return { configuredServer, login };
      })
  );

  registerReadTool(
    server,
    "get_keychain_status",
    "Show whether supported Bitwarden values are present in the environment or macOS Keychain. Values are never returned.",
    {},
    async () => getKeychainStatus(env)
  );

  server.registerTool(
    "save_bw_api_key_to_keychain",
    {
      title: "Save Bitwarden API key to macOS Keychain",
      description:
        "Save BW_CLIENTID and BW_CLIENTSECRET, plus optional BW_SERVER, to macOS Keychain. Values are never returned.",
      inputSchema: {
        client_id: z.string().min(1),
        client_secret: z.string().min(1),
        server_url: z.string().url().optional()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (args) =>
      wrap(() =>
        saveKeychainSecrets(
          {
            BW_SERVER: args.server_url,
            BW_CLIENTID: args.client_id,
            BW_CLIENTSECRET: args.client_secret
          },
          env
        )
      )
  );

  server.registerTool(
    "save_bw_session_to_keychain",
    {
      title: "Save Bitwarden session to macOS Keychain",
      description:
        "Save BW_SESSION to macOS Keychain after the user unlocks bw locally. The session value is never returned.",
      inputSchema: {
        session: z.string().min(1)
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (args) => wrap(() => saveKeychainSecrets({ BW_SESSION: args.session }, env))
  );

  server.registerTool(
    "clear_keychain_secret",
    {
      title: "Clear one macOS Keychain value",
      description:
        "Delete one supported Bitwarden value from macOS Keychain. This does not modify Vaultwarden.",
      inputSchema: {
        name: z.enum(KEYCHAIN_SECRET_NAMES)
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (args) => wrap(() => deleteKeychainSecret(args.name, env))
  );

  registerReadTool(
    server,
    "search_items",
    "Search vault items and return safe summaries only. Secret values are never returned.",
    {
      query: z.string().optional(),
      include_unallowed: z.boolean().optional()
    },
    async (args) => {
      const bw = new BitwardenCli(await buildEffectiveBwEnv(env));
      const items = await bw.listItems(args.query);
      return items
        .filter((item) => args.include_unallowed || isAllowedItem(item, policy))
        .map((item) => summarizeItem(item, policy));
    }
  );

  registerReadTool(
    server,
    "get_item_summary",
    "Fetch one vault item and return a redacted summary. Secret values are never returned.",
    {
      item_id: z.string().min(1)
    },
    async (args) => {
      const item = await new BitwardenCli(await buildEffectiveBwEnv(env)).getItem(args.item_id);
      return summarizeItem(item, policy);
    }
  );

  server.registerTool(
    "ssh_agent_add",
    {
      title: "Add vault SSH key to ssh-agent",
      description:
        "Fetch an allowed SSH key item, add it to ssh-agent with a TTL, and delete the temporary key file.",
      inputSchema: {
        item_id: z.string().min(1),
        ttl_seconds: z.number().int().positive().max(86400).optional()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (args) =>
      wrap(async () => {
        const item = await new BitwardenCli(await buildEffectiveBwEnv(env)).getItem(args.item_id);
        const target = extractSshTarget(item, policy);
        return addTargetToSshAgent(target, args.ttl_seconds ?? defaultTtl(env));
      })
  );

  server.registerTool(
    "run_ssh",
    {
      title: "Run SSH command from vault item",
      description:
        "Fetch an allowed SSH key item and run a command. Private keys are written only to a temporary 0600 file unless use_agent is true.",
      inputSchema: {
        item_id: z.string().min(1),
        command: z.string().min(1),
        timeout_ms: z.number().int().positive().max(300000).optional(),
        use_agent: z.boolean().optional(),
        confirm: z.string().optional()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (args) =>
      wrap(async () => {
        const item = await new BitwardenCli(await buildEffectiveBwEnv(env)).getItem(args.item_id);
        const target = extractSshTarget(item, policy);
        return runSshCommand(target, args.command, {
          timeoutMs: args.timeout_ms,
          useAgent: args.use_agent,
          confirm: args.confirm
        });
      })
  );

  registerReadTool(
    server,
    "ssh_command_confirmation",
    "Return the exact confirmation token required for a dangerous SSH command.",
    {
      item_id: z.string().min(1),
      command: z.string().min(1)
    },
    async (args) => {
      const item = await new BitwardenCli(await buildEffectiveBwEnv(env)).getItem(args.item_id);
      const target = extractSshTarget(item, policy);
      return {
        alias: target.alias,
        confirmation: commandConfirmation(target.alias, args.command)
      };
    }
  );

  return server;
}

function loadPolicy(env: NodeJS.ProcessEnv): BridgePolicy {
  return {
    allowedTag: env.VAULTWARDEN_BRIDGE_ALLOWED_TAG || "codex:ssh",
    requireTag: (env.VAULTWARDEN_BRIDGE_REQUIRE_TAG || "true").toLowerCase() !== "false"
  };
}

function defaultTtl(env: NodeJS.ProcessEnv): number {
  const parsed = Number.parseInt(
    env.VAULTWARDEN_BRIDGE_DEFAULT_SSH_TTL_SECONDS || "28800",
    10
  );
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 28800;
}

function environmentStatus(env: NodeJS.ProcessEnv): Array<{ name: string; status: "set" | "not set" }> {
  return [
    "BW_SERVER",
    "BW_SESSION",
    "BW_CLIENTID",
    "BW_CLIENTSECRET",
    "SSH_AUTH_SOCK"
  ].map((name) => ({
    name,
    status: env[name] ? "set" : "not set"
  }));
}

function registerReadTool<TArgs extends Record<string, z.ZodTypeAny>>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: TArgs,
  handler: (args: z.output<z.ZodObject<TArgs>>) => Promise<unknown> | unknown
): void {
  server.registerTool(
    name,
    {
      title: name,
      description,
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    (async (args: unknown) =>
      wrap(() => handler(args as z.output<z.ZodObject<TArgs>>))) as never
  );
}

async function wrap(
  handler: () => Promise<unknown> | unknown
): Promise<CallToolResult> {
  try {
    const data = await handler();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(redactObject(data), null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text:
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error)
        }
      ]
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = buildServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
