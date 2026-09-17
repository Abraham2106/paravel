# Contributing

Paravel is an early desktop app (Tauri v2 + React + Rust). Product and architecture notes live under `docs/`.

## Setup

See the root [README.md](README.md). You need Node.js, Rust (1.88+), and on Windows the MSVC C++ build tools.

## Checks

From the repository root:

```powershell
npm.cmd --prefix app run build
cargo test --locked --manifest-path app/crates/paravel-context/Cargo.toml
cargo test --locked --manifest-path app/crates/paravel-mcp/Cargo.toml
cargo test --locked --manifest-path app/src-tauri/Cargo.toml
```

UI and native harness scripts under `app/scripts/` are optional and may need Playwright plus a local debug build of the Tauri app.

## Please don't

- Commit `.env`, operator-secret files, SQLite databases, or anything under `reports/`
- Put absolute machine paths, personal files, or real mesa contents in tests or docs
- Expand MCP beyond the documented read-only contract without updating `docs/`

Open a pull request with a short description of *why* the change exists. Keep new tests on synthetic fixtures.
