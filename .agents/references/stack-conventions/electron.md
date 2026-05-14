# Electron Stack Conventions

Use this file for Electron and Tauri desktop work after reading `AGENTS.md`.
When in doubt, prefer the patterns already used in the workspace.

- Keep main process logic in dedicated modules; prefer IPC for renderer-main communication.
- Prefer contextBridge for exposing safe APIs to the renderer process.
- Keep security-sensitive operations (filesystem, shell, network) in the main process.
- Test Electron behavior with focused integration specs where IPC boundaries matter.