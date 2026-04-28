# Stack Conventions

Use this file for stack-specific coding conventions after reading `AGENTS.md`.
It is the canonical conventions source for Angular, React, Vue, NestJS, Express, Java, and Tauri work in this repository.
When in doubt, prefer the patterns already used in the workspace over generic framework advice.

## Angular

- Prioritize Angular dependency injection as a first-class framework feature. Prefer injected services, tokens, and providers over ad hoc module-level singletons or manually wired globals.
- Prefer standalone components, route configuration in `app.routes.ts`, and app-wide providers in `app.config.ts`.
- Prefer `inject()` over constructor injection in Angular classes.
- Prefer signals, `computed()`, and focused component state over broad mutable class state.
- Keep HTTP calls inside dedicated services; keep components responsible for presentation, user intent, and view state.
- Keep contracts and DTO-like types in dedicated files instead of inline object types when the shape is reused.
- Prefer small helper functions at file scope for parsing or projection logic instead of burying branching logic in templates.
- Test with Angular `TestBed`, `provideHttpClientTesting()`, `provideRouter()`, and direct assertions against HTTP requests or signal-driven state.

## React

- Prefer functional components, typed props, and explicit hooks over class components or implicit mutable module state.
- Keep routing, shell layout, and app-level composition in top-level app components such as `src/app/app.tsx`; push reusable UI into focused components.
- Keep data access in services or hooks, not inline inside view JSX.
- Use effects for real side effects only; avoid deriving display state inside `useEffect` when plain expressions or helper functions are enough.
- Reuse existing theme, router, and service conventions before introducing new state or styling patterns.
- Add targeted tests around user-visible behavior and state transitions rather than snapshot-heavy tests.

## Vue

- Prefer the Composition API and composables for reusable behavior.
- Keep views focused on orchestration and presentation; move API and persistence logic into services or composables.
- Use router-driven page composition and keep component props/events explicit instead of relying on hidden shared mutable state.
- Keep PrimeVue and theme setup aligned with the existing app bootstrap rather than reconfiguring UI libraries ad hoc.
- Favor small computed projections and helper functions over template-heavy branching.

## NestJS

- Prioritize NestJS dependency injection as a first-class framework feature. Prefer providers and injected collaborators over manual object construction inside controllers or services.
- Preserve the existing split between `core/` for reusable infrastructure and `feature/` for business flows.
- Keep controllers thin: parse request details, delegate to services, and return explicit response shapes.
- Use constructor injection for Nest providers, with `@Inject(...)` only where the workspace already uses it for explicit wiring.
- Keep security- and transport-specific logic close to the boundary when it depends on request primitives such as headers, raw bodies, or webhook signatures.
- Prefer explicit DTO and contract types over `any`; use `type` imports when only type information is needed.
- Test Nest logic with focused unit tests and simple stubs instead of overbuilding harnesses.

## Express

- Match the existing `core/` and `feature/` split under `apps/express-backend/src/app`.
- Keep route handlers thin: validate request details, delegate to services, and keep persistence or transport mechanics out of the handler body.
- Keep database, configuration, middleware, and cross-cutting concerns in `core/` instead of scattering them across route files.
- Prefer explicit DTO-like types and focused helpers over `any` or broad untyped request mutation.
- Test route behavior and service behavior separately when possible so failures stay easy to localize.

## Java

- Match the Spring Boot style already used under `apps/spring-backend`: constructor injection, no field injection, and small focused `@Service` or `@Component` classes.
- Keep package names under `com.wodendev.springbackend` and group classes by domain capability.
- Prefer clear domain names over abbreviated utility names.
- Use modern JDK features already present in the codebase, including `var`, `Path`, `Instant`, and immutable local flow where it improves readability.
- Keep methods compact and push repeated parsing or mapping into private helpers.
- Use scoped loggers for operational events; do not log secrets, request bodies, or sensitive file contents.
- Prefer typed exceptions or safe fallbacks at IO and integration boundaries instead of leaking low-level implementation details across layers.

## Tauri

- Keep Tauri runtime responsibilities inside `apps/tauri-shell/src-tauri` and avoid pushing shell or process-lifecycle logic into the frontend app.
- Preserve the split between Rust runtime orchestration, packaged backend materialization, and frontend query-string bootstrapping.
- Use Tauri resource and app-data APIs for packaged paths instead of hard-coded relative traversal.
- Keep filesystem, process execution, updater, and environment access in small reviewable helpers because they are security-sensitive boundaries.
- Treat packaged backend startup, shutdown, and data-path migration as explicit lifecycle code with focused smoke coverage.
