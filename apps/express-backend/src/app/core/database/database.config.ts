import { join } from 'node:path';
import { cwd } from 'node:process';
import { DataSourceOptions } from 'typeorm';
import { TaskEntity as Task } from '@task-domain';

const DATABASE_NAME = 'database.sqlite3';

function getDatabasePath(): string {
  const defaultDatabasePath = join(cwd(), DATABASE_NAME);
  switch (process.env.NODE_ENV) {
    case 'dev':
    case 'staging':
      return defaultDatabasePath;
    case 'prod':
    default:
      if (process.env.DATABASE_PATH) {
        return process.env.DATABASE_PATH;
      }
      return defaultDatabasePath;
  }
}

function getDatabaseConfig(): DataSourceOptions {
  return {
    type: 'sqlite',
    database: getDatabasePath(),
    synchronize: true, // Set to false in production
    logging: process.env.NODE_ENV === 'dev',
    entities: [Task],
  };
}

export const dataBaseConfig: DataSourceOptions = getDatabaseConfig();
