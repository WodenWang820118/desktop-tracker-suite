import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, effect, signal } from '@angular/core';

type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private static readonly STORAGE_KEY = 'theme-mode';
  private static readonly DARK_CLASS = 'app-dark';

  // state
  readonly mode = signal<ThemeMode>(this.readInitialMode());
  private readonly userOverridden = signal<boolean>(false);

  constructor(@Inject(DOCUMENT) private readonly document: Document) {
    // Initialize override flag based on whether a saved value exists
    this.userOverridden.set(this.hasSavedPreference());

    // React to changes and apply class
    effect(() => {
      const m = this.mode();
      this.applyMode(m);
      this.persistMode(m);
    });

    // If user hasn't chosen explicitly, keep following system preference live
    const mql = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (mql) {
      const handler = (ev: MediaQueryListEvent) => {
        if (!this.userOverridden()) {
          const next: ThemeMode = ev.matches ? 'dark' : 'light';
          this.mode.set(next);
        }
      };
      // Listen for changes (modern API)
      mql.addEventListener?.('change', handler as EventListener);
    }
  }

  toggle(): void {
    this.userOverridden.set(true);
    this.mode.set(this.mode() === 'dark' ? 'light' : 'dark');
  }

  private applyMode(mode: ThemeMode): void {
    const root = this.document.documentElement;
    if (mode === 'dark') {
      root.classList.add(ThemeService.DARK_CLASS);
    } else {
      root.classList.remove(ThemeService.DARK_CLASS);
    }
  }

  private persistMode(mode: ThemeMode): void {
    try {
      // Only persist when user explicitly overrides the system
      if (this.userOverridden()) {
        localStorage.setItem(ThemeService.STORAGE_KEY, mode);
      }
    } catch {
      // ignore
    }
  }

  private readInitialMode(): ThemeMode {
    try {
      const saved = localStorage.getItem(
        ThemeService.STORAGE_KEY,
      ) as ThemeMode | null;
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    // Fallback to system preference
    const prefersDark = globalThis.matchMedia?.(
      '(prefers-color-scheme: dark)',
    ).matches;
    return prefersDark ? 'dark' : 'light';
  }

  private hasSavedPreference(): boolean {
    try {
      const saved = localStorage.getItem(ThemeService.STORAGE_KEY);
      return saved === 'dark' || saved === 'light';
    } catch {
      return false;
    }
  }
}
