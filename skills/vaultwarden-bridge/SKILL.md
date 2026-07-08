---
name: vaultwarden-bridge
description: Use when the user wants Codex to retrieve credentials from Vaultwarden or Bitwarden CLI, prepare SSH access, add keys to ssh-agent, or run SSH commands without exposing secrets in chat.
---

# Vaultwarden Bridge

Use this plugin when a user asks Codex to use credentials stored in Vaultwarden.

## Safety Rules

- Never print private keys, passwords, API tokens, or `BW_SESSION` values in chat.
- Never ask for or store the Vaultwarden master password.
- Prefer macOS Keychain tools for Bitwarden CLI API credentials instead of `.mcp.json` secrets.
- Prefer `search_items` or `get_item_summary` before using a secret-bearing item.
- Only use items that are explicitly tagged with the configured allowed tag, default `codex:ssh`.
- For SSH keys, prefer `ssh_agent_add` with a TTL over long-lived private key files.
- When using `run_ssh`, explain the target alias and command before invoking it.
- If a command is destructive or operationally risky, use `ssh_command_confirmation` first and ask the user for explicit approval before passing the confirmation token.

## Typical Flow

1. Call `get_bridge_status` to confirm `bw`, `ssh`, and `ssh-add` availability.
2. If needed on macOS, call `get_keychain_status` and use `save_bw_api_key_to_keychain` for `BW_CLIENTID`, `BW_CLIENTSECRET`, and optional `BW_SERVER`.
3. If needed, call `login_with_keychain` or `configure_bw_server` for the Vaultwarden URL.
4. Ask the user to unlock Bitwarden CLI locally if `bw status` reports `locked`; `BW_SESSION` may be saved with `save_bw_session_to_keychain`.
5. Use `search_items` to find the server item.
6. Use `ssh_agent_add` for repeated access, or `run_ssh` for a one-off command.
