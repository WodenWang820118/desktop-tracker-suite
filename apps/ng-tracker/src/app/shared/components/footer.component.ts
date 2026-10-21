import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  template: `
    <footer
      class="mt-8 pt-4 pb-6 text-center border-t border-gray-200 dark:border-slate-700 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-slate-900 dark:to-slate-900"
    >
      <div class="flex flex-col items-center gap-2">
        <p class="text-sm text-gray-600 dark:text-slate-400">
          &copy; 2025 Task Tracker. All rights reserved.
        </p>
        @if (!hasRoute('/about')) {
          <a
            data-test-id="about-link"
            [routerLink]="['/', 'about']"
            class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline transition-colors duration-200 text-sm font-medium"
          >
            About
          </a>
        }
      </div>
    </footer>
  `,
})
export class FooterComponent {
  constructor(private readonly router: Router) {}

  hasRoute(route: string) {
    return this.router.url === route;
  }
}
