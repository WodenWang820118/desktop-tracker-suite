# NestJS Stack Conventions

Use this file for NestJS work after reading `AGENTS.md`.
When in doubt, prefer the patterns already used in the workspace.

- Prioritize NestJS dependency injection. Prefer providers over manual object construction.
- Keep controllers thin: parse request details, delegate to services.
- Use constructor injection; prefer explicit DTO types over `any`.
- Put reusable logic in services, not controllers.
- Test with focused Vitest unit tests and simple stubs.