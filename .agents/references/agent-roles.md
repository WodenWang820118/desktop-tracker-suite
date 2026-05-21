# Agent Roles

Roles are platform-agnostic capabilities. Each role maps to one or more
concrete agents per platform. Use this file when picking the right concrete
agent so that `AGENTS.md` and the workflow files do not need per-platform
delegation tables.

## Roles

### `code-explorer` (read-only)

Read-only codebase mapping: identify affected files, symbols, Nx project
boundaries, cross-cutting coupling. Does not modify files. Use before
multi-file changes when scope is unclear.

| Platform           | Concrete agent                                                   |
| ------------------ | ---------------------------------------------------------------- |
| Copilot (this)     | `Explore` sub-agent                                              |
| Codex CLI          | `codebase-mapper` (`.codex/agents/codebase-mapper.toml`)         |
| Antigravity/Gemini | `agy` preferred; grep + read tooling (no dedicated mapper agent) |

### `code-investigator` (read-only)

Focused mid-task code investigation. Use when the Main Thread needs deeper
understanding of a specific code path, call chain, dependency, or impact area
during planning, implementation, debugging, or review.

This differs from `code-explorer` / `codebase-mapper`:

- `codebase-mapper`: broad initial map before implementation.
- `code-investigator`: focused deep dive during the task.

| Platform           | Concrete agent                                                             |
| ------------------ | -------------------------------------------------------------------------- |
| Copilot            | `Explore` sub-agent, with focused investigation prompt                     |
| Codex CLI          | `code-investigator` (`.codex/agents/code-investigator.toml`)               |
| Antigravity/Gemini | `agy` preferred; grep + read tooling with read-only instruction (advisory) |

### `plan-reviewer`

Default plan review. See `.agents/workflows/review-lifecycle.md`.

| Platform           | Concrete agent / wrapper                    |
| ------------------ | ------------------------------------------- |
| Copilot            | Copilot Claude Sonnet 4.6                   |
| Antigravity/Gemini | `gemini-2.5-pro` (`pnpm review:plan:risky`) |
| Codex CLI          | Codex reviewer subagent (fallback only)     |

### `implementation-reviewer`

Default implementation review.

| Platform           | Concrete agent / wrapper                                     |
| ------------------ | ------------------------------------------------------------ |
| Antigravity/Gemini | `gemini-3-flash-preview` (`pnpm review:implementation`)      |
| Copilot            | Copilot Claude (`pnpm review:copilot`, sensitive escalation) |
| Codex CLI          | Codex reviewer subagent (fallback only)                      |

### `domain-implementer` — multi-stack

No dedicated domain implementer sub-agents are defined for this multi-stack
repo (Angular, React, Vue, NestJS, Express, Spring Boot, Tauri). All
implementation is handled directly by the main agent under the unknown-domain
exception for `small` tasks. Tier 3 phase decomposition applies for
`large` and `huge` tasks.

## Adding a new platform

When adding a new tool / platform:

1. Add a row under each role this platform supports.
2. Do **not** add per-platform delegation tables to `AGENTS.md` or workflow
   files. Reference roles instead.
