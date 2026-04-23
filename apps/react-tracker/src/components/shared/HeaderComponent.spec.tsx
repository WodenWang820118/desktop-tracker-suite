import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PrimeReactProvider } from 'primereact/api';

import { HeaderComponent } from './HeaderComponent';

const { mockThemeState, mockToggleTheme } = vi.hoisted(() => ({
  mockThemeState: { current: 'dark' as 'light' | 'dark' },
  mockToggleTheme: vi.fn(),
}));

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: mockThemeState.current,
    toggleTheme: mockToggleTheme,
    initTheme: vi.fn(),
  }),
}));

function renderHeader() {
  return render(
    <PrimeReactProvider>
      <MemoryRouter>
        <HeaderComponent />
      </MemoryRouter>
    </PrimeReactProvider>,
  );
}

describe('HeaderComponent', () => {
  beforeEach(() => {
    mockThemeState.current = 'dark';
    mockToggleTheme.mockReset();
  });

  it('renders the current navigation and dark theme action label', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: 'Task Tracker' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about');
    expect(screen.getByRole('button', { name: /light/i }).textContent).toContain(
      'Light',
    );
  });

  it('renders the inverse theme action label when the current theme is light', () => {
    mockThemeState.current = 'light';

    renderHeader();

    expect(screen.getByRole('button', { name: /dark/i }).textContent).toContain(
      'Dark',
    );
  });

  it('calls toggleTheme when the theme button is clicked', () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: /light/i }));

    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });
});
