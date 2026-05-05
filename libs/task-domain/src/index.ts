// ---------------------------------------------------------------------------
// Task Domain – shared types, interfaces, and entity for the task tracker
// ---------------------------------------------------------------------------

// Pure data interfaces (no framework dependencies)
export type {
  Task,
  CreateTaskDto,
  PaginatedResponse,
  PaginationQuery,
} from './lib/task.interface';

// TypeORM entity (used by nest-backend and express-backend)
export { Task as TaskEntity } from './lib/task.entity';
