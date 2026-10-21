import { Routes } from '@angular/router';

export const TRACKER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./views/tracker-view.component').then(
        (m) => m.TrackerViewComponent,
      ),
  },
];
