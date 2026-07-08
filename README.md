# Codex Vaultwarden Bridge

A local Codex plugin that lets Codex use credentials stored in Vaultwarden or Bitwarden CLI without printing secrets in chat.

The bridge wraps the `bw` CLI and exposes a small MCP server for safe workflows:

- inspect Bitwarden CLI status
- configure the Vaultwarden server URL
- search vault items by title and return redacted summaries
- add an SSH key from Vaultwarden to `ssh-agent` with a TTL
- run SSH commands from a tagged vault item
- require confirmation for risky SSH commands

## Security Model

Vaultwarden remains the source of truth. This plugin does not store your master password, API key, private keys, or `BW_SESSION` in the repository.

Secret handling defaults:

- vault item summaries never include secret values
- SSH private keys are written only to `0600` temporary files
- `ssh_agent_add` deletes the temporary private key after adding it to `ssh-agent`
- `run_ssh` deletes the temporary private key after the command completes
- output is redacted for private key blocks and common token shapes
- vault items must be tagged with `codex:ssh` by default

## Vault Item Format

Add `codex:ssh` to the item notes or a custom field named `codex`, `tag`, or `tags`.

Recommended custom fields:

| Field | Example |
| --- | --- |
| `host` | `172.93.188.37` |
| `user` | `root` |
| `port` | `22` |
| `ssh_private_key` | OpenSSH private key |
| `ssh_public_key` | OpenSSH public key |

The plugin also understands Bitwarden SSH key items with `sshKey.privateKey`.

## Local Setup

Install dependencies:

```bash
npm install
npm run build
```

Install and configure Bitwarden CLI:

```bash
bw config server https://vault.example.com
bw login --apikey
bw unlock
export BW_SESSION="..."
```

For repeated SSH access, prefer agent TTLs:

```text
ssh_agent_add(item_id: "...", ttl_seconds: 28800)
```

## Codex Plugin

The plugin manifest is in `.codex-plugin/plugin.json`.

The MCP server config is in `.mcp.json`:

```json
{
  "mcpServers": {
    "vaultwarden-bridge": {
      "command": "node",
      "args": ["./mcp/server.mjs"],
      "cwd": "."
    }
  }
}
```

## Tools

| Tool | Purpose |
| --- | --- |
| `get_bridge_status` | Show `bw`, `ssh`, and `ssh-add` status without secrets |
| `configure_bw_server` | Run `bw config server <url>` |
| `login_with_api_key` | Run `bw login --apikey` using environment variables |
| `search_items` | Search vault item titles and return redacted summaries |
| `get_item_summary` | Return a redacted summary for one item |
| `ssh_agent_add` | Add an SSH key item to `ssh-agent` with a TTL |
| `run_ssh` | Run an SSH command using a vault SSH key item |
| `ssh_command_confirmation` | Get the confirmation token for a risky SSH command |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `BW_SERVER` | unset | Informational; use `configure_bw_server` or `bw config server` for CLI config |
| `BW_SESSION` | unset | Bitwarden CLI unlock session |
| `BW_CLIENTID` | unset | Bitwarden API key client id |
| `BW_CLIENTSECRET` | unset | Bitwarden API key client secret |
| `VAULTWARDEN_BRIDGE_ALLOWED_TAG` | `codex:ssh` | Required tag for secret-bearing item use |
| `VAULTWARDEN_BRIDGE_REQUIRE_TAG` | `true` | Set `false` to allow untagged items |
| `VAULTWARDEN_BRIDGE_DEFAULT_SSH_TTL_SECONDS` | `28800` | Default ssh-agent TTL |

## Development

```bash
npm run check
npm test
npm run build
npm run verify
```

## License

MIT

