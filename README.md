# Tracker Suite Monorepo

## Overview

Tracker Suite is an Nx monorepo that contains multiple frontend and backend implementations of the same task-tracking domain, plus a production desktop shell built with Tauri.

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

- Node.js 24+
- pnpm
- Rust toolchain for Tauri desktop builds
- JDK 25+ and Maven if you work on the Spring backend

## Install

```bash
pnpm install
```

## Development

### Browser Frontends

```bash
pnpm run dev-ng
pnpm run dev-vue
pnpm run dev-react
```

### Backends

```bash
pnpm run dev-nest
pnpm run dev-express
pnpm run dev-spring
```

### Desktop Shell

```bash
pnpm run desktop:dev
```

The desktop shell expects the Angular frontend on port `4200` and the Nest backend on port `3000` during development.

## Build

### Frontends

```bash
pnpm run build-ng
pnpm run build-prod-ng
pnpm run build-vue
pnpm run build-prod-vue
pnpm run build-react
pnpm run build-prod-react
```

### Backends

```bash
pnpm run build-nest
pnpm run build-prod-nest
pnpm run build-express
pnpm run build-prod-express
pnpm run build-spring
```

### Desktop Packaging

```bash
pnpm run desktop:materialize-runtime
pnpm run desktop:build
pnpm run desktop:package
```

Useful desktop verification commands:

```bash
pnpm run desktop:test:tooling
pnpm run desktop:smoke-runtime
```

## Testing

```bash
pnpm run test-back:cov
```

## Troubleshooting

If native SQLite dependencies are blocked during install, run:

```bash
pnpm approve-builds
```

## Project Configuration

- Monorepo: Nx
- Package manager: pnpm
- Desktop shell: Tauri
- Web build tools: Angular CLI, Vite, Rspack
- Backend build tools: Nx Node tooling, Maven

## License

MIT
