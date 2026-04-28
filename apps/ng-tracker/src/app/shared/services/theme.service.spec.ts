import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const originalMatchMedia = globalThis.matchMedia;

  function stubMatchMedia(matches: boolean) {
    const listeners: Array<(event: MediaQueryListEvent) => void> = [];
    const mediaQueryList = {
      matches,
      addEventListener: vi.fn(
        (_event: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.push(listener);
        }
      ),
    };

    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue(mediaQueryList),
    });

    return {
      emitChange(nextMatches: boolean) {
        mediaQueryList.matches = nextMatches;
        for (const listener of listeners) {
          listener({ matches: nextMatches } as MediaQueryListEvent);
        }
      },
    };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('initializes from a saved dark preference and applies the dark class', () => {
    localStorage.setItem('theme-mode', 'dark');
    stubMatchMedia(false);
    TestBed.configureTestingModule({
      providers: [ThemeService],
    });

    const service = TestBed.inject(ThemeService);
    const injectedDocument = TestBed.inject(DOCUMENT);
    TestBed.flushEffects();

    expect(service.mode()).toBe('dark');
    expect(
      injectedDocument.documentElement.classList.contains('app-dark')
    ).toBe(true);
  });

  it('initializes from system dark preference when no saved preference exists', () => {
    stubMatchMedia(true);
    TestBed.configureTestingModule({
      providers: [ThemeService],
    });

    const service = TestBed.inject(ThemeService);
    TestBed.flushEffects();

    expect(service.mode()).toBe('dark');
  });

  it('updates mode when system preference changes and no override exists', () => {
    const media = stubMatchMedia(false);

    TestBed.configureTestingModule({
      providers: [ThemeService],
    });

    const service = TestBed.inject(ThemeService);
    TestBed.flushEffects();

    expect(service.mode()).toBe('light');

    media.emitChange(true);
    TestBed.flushEffects();

    expect(service.mode()).toBe('dark');
  });

  it('toggles from light mode, persists the override, and applies the dark class', () => {
    stubMatchMedia(false);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    TestBed.configureTestingModule({
      providers: [ThemeService],
    });

    const service = TestBed.inject(ThemeService);
    const injectedDocument = TestBed.inject(DOCUMENT);

    service.toggle();
    TestBed.flushEffects();

    expect(service.mode()).toBe('dark');
    expect(setItemSpy).toHaveBeenCalledWith('theme-mode', 'dark');
    expect(localStorage.getItem('theme-mode')).toBe('dark');
    expect(
      injectedDocument.documentElement.classList.contains('app-dark')
    ).toBe(true);
  });

  it('toggles from dark mode back to light and removes the dark class', () => {
    localStorage.setItem('theme-mode', 'dark');
    stubMatchMedia(false);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    TestBed.configureTestingModule({
      providers: [ThemeService],
    });

    const service = TestBed.inject(ThemeService);
    const injectedDocument = TestBed.inject(DOCUMENT);

    service.toggle();
    TestBed.flushEffects();

    expect(service.mode()).toBe('light');
    expect(setItemSpy).toHaveBeenCalledWith('theme-mode', 'light');
    expect(localStorage.getItem('theme-mode')).toBe('light');
    expect(
      injectedDocument.documentElement.classList.contains('app-dark')
    ).toBe(false);
  });

  it('ignores system preference changes after the user overrides the theme', () => {
    const media = stubMatchMedia(false);
    TestBed.configureTestingModule({
      providers: [ThemeService],
    });

    const service = TestBed.inject(ThemeService);
    TestBed.flushEffects();

    service.toggle();
    TestBed.flushEffects();
    media.emitChange(false);
    TestBed.flushEffects();

    expect(service.mode()).toBe('dark');
    expect(localStorage.getItem('theme-mode')).toBe('dark');
  });
});
