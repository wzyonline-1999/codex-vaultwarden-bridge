# Security Policy

This project is a local credential bridge. Treat it as sensitive infrastructure.

## Reporting a Vulnerability

Please open a private security advisory or contact the maintainer before publishing details.

## Design Constraints

- The plugin must not print passwords, tokens, private keys, or `BW_SESSION`.
- The repository must never contain real Vaultwarden items, API keys, private keys, or session tokens.
- macOS Keychain may store `BW_SERVER`, `BW_CLIENTID`, `BW_CLIENTSECRET`, and `BW_SESSION`; Vaultwarden master passwords are out of scope.
- Environment variables take precedence over Keychain values so short-lived overrides remain possible.
- Secret-bearing tools should require an explicit item tag by default.
- SSH keys should be short-lived in local temporary files or `ssh-agent`.
- Dangerous SSH commands must require explicit confirmation.

## Non-Goals

- This project does not bypass Bitwarden or Vaultwarden encryption.
- This project does not read Vaultwarden databases directly.
- This project does not replace a dedicated secrets manager for production automation.
