import { Routes } from '@angular/router';

export const ADD_TASK_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./views/add-task-view.component').then(
        (m) => m.AddTaskViewComponent,
      ),
  },
];
