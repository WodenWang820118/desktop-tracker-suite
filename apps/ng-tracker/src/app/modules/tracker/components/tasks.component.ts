import { Component, signal } from '@angular/core';
import { TaskService } from '../../../shared/services/task.service';
import { Task } from '@task-domain';
import { formatDatabaseError } from '../../../shared/utils/error-formatter';
import { MessageService } from 'primeng/api';
import { TaskItemComponent } from './task-item.component';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { debounceTime, Subject } from 'rxjs';

@Component({
  selector: 'app-tasks',
  imports: [
    TaskItemComponent,
    InputTextModule,
    ButtonModule,
    FormsModule,
    RouterLink,
    IconFieldModule,
    InputIconModule,
    PaginatorModule,
  ],
  template: `
    <div class="px-1 md:px-2 lg:px-3">
      <div
        class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between py-4"
      >
        <h2 class="text-xl font-semibold text-gray-800 dark:text-slate-100">
          Your Tasks
        </h2>
        <div class="flex items-center gap-2 w-full md:w-auto">
          <span class="relative flex-1 md:flex-none">
            <p-icon-field>
              <p-inputicon class="pi pi-search" />
              <input
                pInputText
                type="text"
                [(ngModel)]="searchQuery"
                (ngModelChange)="onSearchChange($event)"
                placeholder="Search tasks..."
              />
            </p-icon-field>
          </span>
          <a [routerLink]="['/add-task']">
            <p-button label="Add Task" icon="pi pi-plus" severity="success" />
          </a>
        </div>
      </div>

      @if (loading()) {
        <div class="flex justify-center items-center py-12">
          <div
            class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"
          ></div>
        </div>
      }
      @if (error()) {
        <div
          class="bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg mb-4"
          role="alert"
        >
          <strong class="font-bold">Error:</strong>
          <span class="block sm:inline ml-2">{{ error() }}</span>
        </div>
      }
      @if (!loading() && !error() && tasks().length === 0) {
        <div class="text-center py-12">
          <p class="text-gray-500 dark:text-slate-400 text-lg">
            No tasks found.
            {{
              searchQuery
                ? 'Try a different search.'
                : 'Add one to get started!'
            }}
          </p>
        </div>
      }
      <div class="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
        @for (task of tasks(); track task.id) {
          <app-task-item
            [task]="task"
            (taskChanged)="refreshTasks()"
          ></app-task-item>
        }
      </div>

      @if (!loading() && tasks().length > 0) {
        <div class="mt-6">
          <p-paginator
            [first]="first()"
            [rows]="rows()"
            [totalRecords]="totalRecords()"
            [rowsPerPageOptions]="[5, 10, 20, 50]"
            (onPageChange)="onPageChange($event)"
          ></p-paginator>
        </div>
      }
    </div>
  `,
})
export class TasksComponent {
  // State signals
  tasks = signal<Task[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  // Pagination state
  first = signal(0); // First record index
  rows = signal(10); // Records per page
  totalRecords = signal(0);
  currentPage = signal(1);

  // Search state
  searchQuery = '';
  private readonly searchSubject = new Subject<string>();

  constructor(
    private taskService: TaskService,
    private messageService: MessageService,
  ) {
    // Set up debounced search
    this.searchSubject.pipe(debounceTime(300)).subscribe((query) => {
      this.currentPage.set(1);
      this.first.set(0);
      this.loadTasks();
    });

    // Initial load
    this.loadTasks();
  }

  onSearchChange(query: string): void {
    this.searchSubject.next(query);
  }

  onPageChange(event: PaginatorState): void {
    this.first.set(event.first || 0);
    this.rows.set(event.rows || 10);
    this.currentPage.set(event.page ? event.page + 1 : 1);
    this.loadTasks();
  }

  private loadTasks(): void {
    this.loading.set(true);
    this.error.set(null);

    const params = {
      page: this.currentPage(),
      limit: this.rows(),
      search: this.searchQuery.trim() || undefined,
    };

    this.taskService.getTasks(params).subscribe({
      next: (response) => {
        this.tasks.set(response.data);
        this.totalRecords.set(response.total);
        this.loading.set(false);
      },
      error: (err) => {
        const errorMessage = formatDatabaseError(err);
        this.error.set(errorMessage);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 5000,
        });
        this.loading.set(false);
      },
    });
  }

  refreshTasks(): void {
    this.loadTasks();
  }
}
