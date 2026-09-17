# Security

Paravel stores local workspace data (SQLite, launch logs) on the operator's machine. The optional MCP server reads that database; it does not create it, migrate it, or follow piece payloads to files or URLs.

## Trust model

The desktop app is local. The WebView loads bundled UI under a CSP; it has no `shell:allow-execute`. Spawn is Rust `Command` with a known `.exe` and argv. Opening a `file` piece uses `ShellExecuteW` only after `canonicalize`, an allowed-root check, and a denylist of executables, shortcuts, and scripts. The user home directory is always an allowed root.

**MCP stdio has no authentication.** Anyone who can run `paravel-mcp --db … --espacio …` can read that space's note and pack. The trust boundary is the machine and the MCP client config. Do not point a client at a database you would not open yourself.

**MCP HTTP** is experimental: loopback bind, OAuth 2.1 + PKCE, and an operator phrase. A tunnel URL is not a secret; the tunnel provider can see traffic. Do not expose HTTP without the operator file.

## Report a vulnerability

Please use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository.

Do not open a public issue for secrets, auth bypasses, or data-exfiltration bugs.

Include:

- Paravel version or git commit
- OS and how you ran the app or `paravel-mcp`
- A minimal reproduction without real user data

## Operator secrets

HTTP mode requires `--operator-secret-file` pointing to a file **outside this repository**. Never commit that file, paste the phrase into commands, or log it.

The crate already gitignores `*.operator-secret`. Keep the same rule for any local copies.

## After a leak

Rotate the operator phrase, disable the MCP client entry, and treat any exposed tokens or tunnel URLs as compromised.
