import { Component, computed, input, output, inject } from '@angular/core';
import { Task } from '@task-domain';
import { DatePipe, NgClass } from '@angular/common';
import { TaskService } from '../../../shared/services/task.service';
import { take } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-task-item',
  imports: [NgClass, ButtonModule, CardModule, TooltipModule, DatePipe],
  template: `
    <p-card
      data-test-id="task-card"
      [ngClass]="{
        reminder: task().reminder,
        'hover:shadow-xl': true,
        'transition-all': true,
        'duration-300': true,
        'cursor-pointer': true,
      }"
      [pTooltip]="'Tip: Double-click to toggle reminder'"
      tooltipPosition="top"
      (dblclick)="toggleReminder(taskSignal())"
      class="h-full"
    >
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <h3
            class="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-2 break-words"
          >
            {{ task().text }}
          </h3>
          <p
            class="text-sm text-gray-600 dark:text-slate-300 flex items-center gap-2"
          >
            <i class="pi pi-calendar text-blue-600 dark:text-blue-400"></i>
            {{ task().day | date: 'medium' }}
          </p>
          @if (task().reminder) {
            <div class="mt-2 flex items-center gap-2">
              <i class="pi pi-bell text-amber-500"></i>
              <span
                class="text-xs text-amber-600 dark:text-amber-400 font-medium"
                >Reminder Set</span
              >
            </div>
          }
        </div>
        <p-button
          data-test-id="delete-task"
          (click)="requestDelete(taskSignal())"
          icon="pi pi-times"
          [rounded]="true"
          [text]="true"
          severity="danger"
          [pTooltip]="'Delete task'"
          tooltipPosition="left"
          class="flex-shrink-0"
        />
      </div>
    </p-card>
  `,
})
export class TaskItemComponent {
  task = input.required<Task>();
  taskChanged = output<void>();
  taskSignal = computed(() => this.task());
  private readonly confirm = inject(ConfirmService);

  constructor(private readonly taskService: TaskService) {}

  requestDelete(task: Task): void {
    this.confirm
      .confirm({
        title: 'Confirm deletion',
        message: `Delete task "${task.text}"? This action cannot be undone.`,
        acceptLabel: 'Delete',
        rejectLabel: 'Cancel',
        severity: 'danger',
      })
      .then((ok) => {
        if (!ok) return;
        this.taskService
          .deleteTask(task)
          .pipe(take(1))
          .subscribe(() => {
            this.taskChanged.emit();
          });
      });
  }

  toggleReminder(task: Task): void {
    task.reminder = !task.reminder;
    const updatedTask = { ...task, reminder: task.reminder };
    this.taskService.updateTaskReminder(updatedTask).pipe(take(1)).subscribe();
  }
}
