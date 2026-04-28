import { afterNextRender, Component, inject } from '@angular/core';
// Import symbols for components/directives used inside the deferrable view
// without adding them to @Component.imports, so the compiler can lazy-load them.
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './shared/components/header.component';
import { FooterComponent } from './shared/components/footer.component';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog.component';
import { ThemeService } from './shared/services/theme.service';
import { DesktopUpdateService } from './shared/services/desktop-update.service';
import { ToastModule } from 'primeng/toast';
@Component({
  selector: 'app-root',
  // Import components/directives used in the template. Since they're
  // referenced exclusively inside the @defer block, Angular will split
  // their dependencies into a separate chunk automatically.
  imports: [
    RouterOutlet,
    HeaderComponent,
    FooterComponent,
    ConfirmDialogComponent,
    ToastModule,
  ],
  template: `
    @defer {
    <p-toast position="top-right" />
    <div
      class="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 app-shell"
    >
      <app-header></app-header>
      <main class="flex-1 py-6">
        <div class="max-w-5xl mx-auto px-4">
          <router-outlet></router-outlet>
        </div>
      </main>
      <app-footer></app-footer>
    </div>
    <app-confirm-dialog />
    } @loading(minimum 600) {
    <div
      class="flex justify-center items-center min-h-screen opacity-0 animate-fadeIn"
    >
      <span
        role="status"
        aria-live="polite"
        [attr.aria-label]="'Loading'"
        [class]="
          (theme.mode() === 'dark'
            ? 'border-slate-700 border-t-blue-400'
            : 'border-slate-300 border-t-blue-600') +
          ' inline-block h-16 w-16 md:h-20 md:w-20 rounded-full border-8 animate-spin'
        "
      ></span>
      <span class="sr-only">Loading…</span>
    </div>
    }
  `,
})
export class AppComponent {
  readonly theme = inject(ThemeService);
  private readonly desktopUpdate = inject(DesktopUpdateService);

  constructor() {
    afterNextRender(() => {
      void this.desktopUpdate.checkForUpdatesOnStartup();
    });
  }
}
