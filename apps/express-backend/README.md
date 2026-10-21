# Express Backend

A plain Express.js backend application implementing the same functionality as the NestJS backend.

## Features

- **Express.js** - Fast, unopinionated web framework
- **TypeORM** - Database ORM for SQLite
- **CORS** - Cross-origin resource sharing enabled
- **Logging Middleware** - Request/response logging
- **Task Management** - Full CRUD operations with pagination and search
- **Health Check** - Simple health endpoint

## Project Structure

```
express-backend/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── database/          # Database configuration
│   │   │   ├── health/            # Health check endpoint
│   │   │   └── middleware/        # Logging middleware
│   │   └── feature/
│   │       └── task/              # Task feature (routes, service, entity, DTOs)
│   └── main.ts                    # Application entry point
├── project.json
├── tsconfig.json
└── rspack.config.cjs
```

## API Endpoints

### Health Check

- `GET /health` - Health check endpoint

### Tasks

- `GET /tasks` - Get all tasks (with pagination and search)
  - Query params: `page`, `limit`, `search`
- `GET /tasks/:id` - Get task by ID
- `POST /tasks/create` - Create a new task
- `PUT /tasks/:id` - Update a task
- `DELETE /tasks/:id` - Delete a task

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev-express

# Build
bun run build-express
```

## Environment Variables

- `NODE_ENV` - Environment (dev, staging, prod)
- `PORT` - Server port (default: 3000)
- `DATABASE_PATH` - Optional custom database path

## Differences from NestJS Backend

This Express backend implements the same functionality as the NestJS version but with:

- Plain Express.js instead of NestJS decorators
- Express Router instead of NestJS controllers
- Service classes using TypeORM directly
- Custom logging middleware instead of NestJS interceptors
- Simpler, more straightforward structure
