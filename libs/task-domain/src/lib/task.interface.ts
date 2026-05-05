// ---------------------------------------------------------------------------
// Pure data shapes – no runtime framework dependencies.
// Suitable for both frontend (Angular, React, Vue) and backend consumption.
// ---------------------------------------------------------------------------

/** Core task data model */
export interface Task {
  id: string;
  text: string;
  day: string;
  reminder: boolean;
}

/** Payload for creating a new task */
export interface CreateTaskDto {
  id: string;
  text: string;
  day: string;
  reminder: boolean;
}

/** Standard paginated API response envelope */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Query parameters for paginated task listing */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
}
