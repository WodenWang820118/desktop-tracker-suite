# Verification Targets

Use these details only when browser-visible, desktop-visible, backend smoke, or workspace verification evidence materially reduces risk.

Use `qa-verification` after implementation and before final sign-off when a human-reviewable verification trail would materially reduce risk for browser-visible UI work, desktop-visible Tauri behavior, backend smoke checks, or workspace task behavior.

## Target Routing

- `apps/ng-tracker`: primary browser UI. Prefer `pnpm dev-ng` for local browser verification and `pnpm build-ng` or `pnpm build-prod-ng` when a build is the right evidence.
- `apps/react-tracker`: alternate browser UI. Prefer `pnpm dev-react`, `pnpm build-react`, or `pnpm build-prod-react` when the touched flow is React-specific.
- `apps/vue-tracker`: alternate browser UI. Prefer `pnpm dev-vue`, `pnpm build-vue`, or `pnpm build-prod-vue` when the touched flow is Vue-specific.
- `apps/tauri-shell`: desktop-visible Tauri shell. Prefer `pnpm desktop:dev` for visible shell checks, `pnpm desktop:smoke-runtime` for packaged Nest sidecar smoke, `pnpm desktop:smoke-runtime:express-sidecar` for Express sidecar smoke, and `pnpm smoke-spring-native` when Spring native runtime behavior is the target.
- `apps/nest-backend`: backend smoke or build evidence. Prefer `pnpm dev-nest`, `pnpm build-nest`, or `pnpm test-back:cov` depending on the change.
- `apps/express-backend`: backend smoke or build evidence. Prefer `pnpm dev-express`, `pnpm build-express`, or a targeted Nx test/build when available.
- `apps/spring-backend`: Java backend smoke/build evidence. Prefer `pnpm dev-spring`, `pnpm build-spring`, `pnpm build-spring-native`, or `pnpm smoke-spring-native` depending on runtime target.
- Workspace or packaging changes: prefer the narrowest touched Nx target first. Use desktop materialization/package scripts only when packaging/runtime wiring changed.

Keep verification evidence tied to actual user or operator flows, not just component snapshots. Do not route docs-only, workflow-only, or backend-only changes through browser or desktop verification unless the behavior is visibly exercised there.
