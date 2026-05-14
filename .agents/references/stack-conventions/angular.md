# Angular Stack Conventions

Use this file for Angular work after reading `AGENTS.md`.
When in doubt, prefer the patterns already used in the workspace over generic framework advice.

- Prioritize Angular dependency injection. Prefer injected services, tokens, and providers.
- Prefer standalone components, `inject()`, signals, and `computed()` for state.
- Keep HTTP calls inside dedicated services; keep components responsible for presentation.
- Follow the existing ESLint selector rules for components and directives.
- Test with Angular `TestBed`, `provideHttpClientTesting()`, and direct assertions.