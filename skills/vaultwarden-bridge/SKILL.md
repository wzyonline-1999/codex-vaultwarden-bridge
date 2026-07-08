---
name: vaultwarden-bridge
description: Use when the user wants Codex to retrieve credentials from Vaultwarden or Bitwarden CLI, prepare SSH access, add keys to ssh-agent, or run SSH commands without exposing secrets in chat.
---

# Vaultwarden Bridge

Use this plugin when a user asks Codex to use credentials stored in Vaultwarden.

## Safety Rules

- Never print private keys, passwords, API tokens, or `BW_SESSION` values in chat.
- Prefer `search_items` or `get_item_summary` before using a secret-bearing item.
- Only use items that are explicitly tagged with the configured allowed tag, default `codex:ssh`.
- For SSH keys, prefer `ssh_agent_add` with a TTL over long-lived private key files.
- When using `run_ssh`, explain the target alias and command before invoking it.
- If a command is destructive or operationally risky, use `ssh_command_confirmation` first and ask the user for explicit approval before passing the confirmation token.

## Typical Flow

1. Call `get_bridge_status` to confirm `bw`, `ssh`, and `ssh-add` availability.
2. If needed, call `configure_bw_server` for the Vaultwarden URL.
3. Ask the user to unlock Bitwarden CLI locally if `bw status` reports `locked`.
4. Use `search_items` to find the server item.
5. Use `ssh_agent_add` for repeated access, or `run_ssh` for a one-off command.

