export interface DatabaseError {
  timestamp: string;
  status: number;
  error: string;
  path: string;
  method: string;
  exception: string;
  message: string;
  errorCode?: string;
  operation?: string;
  databasePath?: string;
  rootCause?: string;
  rootMessage?: string;
  trace?: string;
}

export function formatDatabaseError(error: any): string {
  console.log('formatDatabaseError received:', error);

  if (!error || typeof error !== 'object') {
    return 'An unknown error occurred';
  }

  // Handle HttpErrorResponse structure
  let dbError: DatabaseError | null = null;

  // Check if error.error exists and has our custom error structure
  if (error.error && typeof error.error === 'object') {
    dbError = error.error as DatabaseError;
    console.log('Extracted dbError:', dbError);
  }

  if (!dbError || !dbError.errorCode) {
    // Fallback for non-database errors
    console.log('No errorCode found, using fallback');
    if (error.status === 0) {
      return 'Cannot connect to server. Please check if the backend is running.';
    }
    if (error.statusText) {
      return `Server error: ${error.statusText}`;
    }
    return error.message || 'An error occurred';
  }

  // Build user-friendly error message based on errorCode
  const errorCode = dbError.errorCode;
  const operation = dbError.operation;
  const databasePath = dbError.databasePath;

  console.log('Processing errorCode:', errorCode);

  switch (errorCode) {
    case 'DB_FILE_NOT_FOUND':
      return `Database file not found at: ${databasePath || 'unknown path'}`;

    case 'DB_PERMISSION_DENIED':
      return `Cannot access database file (permission denied): ${databasePath || 'unknown path'}`;

    case 'DB_LOCKED':
      return `Database is locked. Please try again in a moment.`;

    case 'DB_CONNECTION_FAILED':
      return `Failed to connect to database: ${dbError.rootMessage || dbError.message}`;

    case 'DB_SCHEMA_INVALID':
      return `Database schema is invalid or corrupted: ${databasePath || 'unknown path'}`;

    case 'DB_MIGRATION_FAILED':
      return `Failed to update database structure: ${databasePath || 'unknown path'}`;

    case 'TASK_CREATE_FAILED':
      return `Failed to create task: ${dbError.rootMessage || dbError.message}`;

    case 'TASK_UPDATE_FAILED':
      return `Failed to update task: ${dbError.rootMessage || dbError.message}`;

    case 'TASK_DELETE_FAILED':
      return `Failed to delete task: ${dbError.rootMessage || dbError.message}`;

    case 'TASK_QUERY_FAILED':
      return `Failed to retrieve tasks: ${dbError.rootMessage || dbError.message}`;

    default:
      // Fallback to generic message with root cause if available
      if (dbError.rootMessage) {
        return `${dbError.error}: ${dbError.rootMessage}`;
      }
      return dbError.message || 'An error occurred';
  }
}
