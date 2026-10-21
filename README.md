# Desktop Tracker Suite Monorepo

## Overview

Desktop Tracker Suite is an Nx monorepo that contains multiple frontend and backend implementations of the same task-tracking domain, plus a production desktop shell built with Tauri.

The shipped desktop product uses:

- `ng-tracker` for the frontend
- `nest-backend` for the local API/runtime
- `tauri-shell` for the desktop shell

The workspace also keeps alternative browser and backend implementations for comparison and experimentation.

## Workspace Apps

### Frontends

- `apps/ng-tracker`: Angular + PrimeNG
- `apps/vue-tracker`: Vue + PrimeVue
- `apps/react-tracker`: React + PrimeReact

### Backends

- `apps/nest-backend`: NestJS + TypeORM + SQLite
- `apps/express-backend`: Express + TypeORM + SQLite
- `apps/spring-backend`: Spring Boot + JPA

### Desktop

- `apps/tauri-shell`: Tauri desktop shell that packages the Angular frontend and Nest backend

## Prerequisites

- Node.js >=24.15.0
- Bun 1.4.3-canary.20261019.1 (the workspace is pinned via `packageManager`; this canary includes `bun lint`, `bun fmt`, and `bun check`)
- Rust toolchain for Tauri desktop builds
- JDK 25+ and Maven if you work on the Spring backend

## Install

```bash
bun install
```

## Development

### Browser Frontends

```bash
bun run dev-ng
bun run dev-vue
bun run dev-react
```

### Backends

```bash
bun run dev-nest
bun run dev-express
bun run dev-spring
```

### Desktop Shell

```bash
bun run desktop:dev
```

The desktop shell expects the Angular frontend on port `4200` and the Nest backend on port `3000` during development.

## Build

### Frontends

```bash
bun run build-ng
bun run build-prod-ng
bun run build-vue
bun run build-prod-vue
bun run build-react
bun run build-prod-react
```

### Backends

```bash
bun run build-nest
bun run build-prod-nest
bun run build-express
bun run build-prod-express
bun run build-spring
```

### Desktop Packaging

```bash
bun run desktop:materialize-runtime
bun run desktop:build
bun run desktop:package
```

Useful desktop verification commands:

```bash
bun run desktop:test:tooling
bun run desktop:smoke-runtime
```

## Testing

```bash
bun run test-back:cov
```

## Troubleshooting

Bun does not run dependency lifecycle scripts unless the package is listed in
`trustedDependencies` in `package.json`. The workspace trusts `@nestjs/core`,
`@swc/core`, `esbuild`, `nx`, and `sqlite3`.

## Lint, format, and typecheck

```bash
bun run lint
bun run format:check
bun run check
```

`bun lint` uses Bun's built-in rules and does not load an ESLint config. `bun fmt` formats from `bunfig.toml` with single quotes. `bun check` type-checks each TypeScript project. The root `tsconfig.json` does not include the apps, so the `check` script passes `--no-script` and a project path. Nx `typecheck` targets use the same command.

## Project Configuration

- Monorepo: Nx
- Package manager: Bun 1.4.3-canary.20261019.1
- Desktop shell: Tauri
- Web build tools: Angular CLI, Vite, Rspack
- Backend build tools: Nx Node tooling, Maven

## License

MIT
