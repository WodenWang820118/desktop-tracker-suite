import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { catchError, Observable } from 'rxjs';
import { Task, PaginatedResponse, PaginationQuery } from '@task-domain';
import { environment } from '../../../environments/environment';
import { formatDatabaseError } from '../utils/error-formatter';

function resolveTaskApiUrl(): string {
  // Desktop Tracker Suite passes desktop overrides via query string: index.html?taskApiUrl=http://localhost:5000/tasks
  try {
    const search = (globalThis as any)?.location?.search;
    if (typeof search === 'string' && search) {
      const value = new URLSearchParams(search).get('taskApiUrl');
      if (value) return value;
    }
  } catch {
    // ignore
  }

  return environment.taskApiUrl;
}

const TASK_API_URL = resolveTaskApiUrl();

const httpOptions = {
  headers: new HttpHeaders({
    'Content-Type': 'application/json',
  }),
};

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  constructor(private readonly http: HttpClient) {}

  getTasks(params?: PaginationQuery): Observable<PaginatedResponse<Task>> {
    let httpParams = new HttpParams();

    if (params?.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params?.limit) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }
    if (params?.search) {
      httpParams = httpParams.set('search', params.search);
    }

    return this.http
      .get<PaginatedResponse<Task>>(TASK_API_URL, { params: httpParams })
      .pipe(
        catchError((error) => {
          console.error('Task API Error:', formatDatabaseError(error));
          console.error('Full error details:', error);
          throw error;
        }),
      );
  }

  deleteTask(task: Task): Observable<Task> {
    return this.http.delete<Task>(`${TASK_API_URL}/${task.id}`).pipe(
      catchError((error) => {
        console.error('Delete Task Error:', formatDatabaseError(error));
        console.error('Full error details:', error);
        return [];
      }),
    );
  }

  updateTaskReminder(task: Task): Observable<Task> {
    return this.http
      .put<Task>(`${TASK_API_URL}/${task.id}`, task, httpOptions)
      .pipe(
        catchError((error) => {
          console.error('Update Task Error:', formatDatabaseError(error));
          console.error('Full error details:', error);
          return [];
        }),
      );
  }

  addTask(task: Task): Observable<Task> {
    return this.http
      .post<Task>(`${TASK_API_URL}/create`, task, httpOptions)
      .pipe(
        catchError((error) => {
          console.error('Add Task Error:', formatDatabaseError(error));
          console.error('Full error details:', error);
          return [];
        }),
      );
  }
}
