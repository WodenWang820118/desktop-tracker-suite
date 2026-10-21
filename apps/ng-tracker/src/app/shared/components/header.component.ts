import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, ButtonModule],
  template: `
    <header
      class="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/90 backdrop-blur border-b border-gray-200 dark:border-slate-700"
    >
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
        <a
          [routerLink]="['/']"
          class="flex items-center gap-2 font-semibold text-gray-800 dark:text-slate-100"
        >
          <i class="pi pi-check-circle text-blue-600"></i>
          <span>Task Tracker</span>
        </a>

        <nav class="flex items-center gap-2 ml-2 text-sm">
          <a
            [routerLink]="['/']"
            routerLinkActive="bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100"
            [routerLinkActiveOptions]="{ exact: true }"
            class="px-3 py-2 rounded-md text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
            >Home</a
          >
          <a
            [routerLink]="['/about']"
            routerLinkActive="bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100"
            class="px-3 py-2 rounded-md text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
            >About</a
          >
        </nav>

        <div class="flex-1"></div>

        <p-button
          styleClass="ml-2"
          [label]="themeLabel()"
          [icon]="themeIcon()"
          (onClick)="toggleTheme()"
          severity="secondary"
          outlined
        />
      </div>
    </header>
  `,
  styles: [],
})
export class HeaderComponent {
  private readonly theme = inject(ThemeService);
  constructor(private readonly router: Router) {}

  hasRoute(route: string) {
    return this.router.url === route;
  }

  themeLabel = computed(() =>
    this.theme.mode() === 'dark' ? 'Light' : 'Dark',
  );
  themeIcon = computed(() =>
    this.theme.mode() === 'dark' ? 'pi pi-sun' : 'pi pi-moon',
  );
  toggleTheme() {
    this.theme.toggle();
  }
}
