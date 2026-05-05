import { Component } from '@angular/core';
import { Task } from '@task-domain';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TaskService } from '../../../shared/services/task.service';
import { v4 as uuidv4 } from 'uuid';
import { tap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-task-form',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    DatePickerModule,
  ],
  template: `
    <div class="px-6 py-8">
      <h2 class="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-6">
        Add New Task
      </h2>
      <form
        [formGroup]="taskForm"
        (ngSubmit)="onSubmit()"
        data-test-id="add-task-form"
        class="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md"
      >
        <div class="form-field">
          <label
            for="text"
            data-testid="label-task"
            class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
          >
            Task Description
          </label>
          <input
            type="text"
            name="text"
            formControlName="text"
            id="text"
            placeholder="Enter task description"
            data-test-id="input-task"
            pInputText
            class="w-full"
          />
        </div>

        <div class="form-field">
          <label
            for="date"
            data-test-id="label-date"
            class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
          >
            Due Date
          </label>
          <p-datepicker
            formControlName="date"
            [showIcon]="true"
            appendTo="body"
            inputId="date"
            class="w-full"
          />
        </div>

        <div
          class="form-field flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg"
        >
          <input
            data-test-id="input-reminder"
            type="checkbox"
            name="reminder"
            formControlName="reminder"
            id="reminder"
            class="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
          />
          <label
            for="reminder"
            data-test-id="label-reminder"
            class="text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer"
          >
            Set Reminder
          </label>
        </div>

        <div class="flex gap-4 pt-4">
          <p-button
            class="flex-1"
            data-test-id="input-cancel-task"
            label="Cancel"
            id="cancelButton"
            (click)="cancelAddTask()"
            severity="secondary"
            [outlined]="true"
          />
          <p-button
            class="flex-1"
            data-test-id="input-save-task"
            label="Save Task"
            id="submitButton"
            type="submit"
            severity="success"
            icon="pi pi-check"
          />
        </div>
      </form>
    </div>
  `,
})
export class TaskFormComponent {
  taskForm = this.fb.group({
    text: [''],
    date: [new Date()],
    reminder: [false],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly taskService: TaskService,
  ) {}

  cancelAddTask() {
    this.router.navigate(['/']);
  }

  onSubmit() {
    if (!this.taskForm.value.text || !this.taskForm.value.date) {
      alert('Please fill all fields');
      return;
    }

    const newTask: Task = {
      id: uuidv4(),
      text: this.taskForm.value.text,
      day: this.taskForm.value.date?.toISOString() ?? '',
      reminder: this.taskForm.value.reminder || false,
    };

    this.taskService
      .addTask(newTask)
      .pipe(
        tap(() => {
          this.router.navigate(['/']);
        }),
      )
      .subscribe();
  }
}
