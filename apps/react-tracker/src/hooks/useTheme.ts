import { useEffect, useState } from 'react';
import { themes } from '../themes';

function resolveTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('theme');
  const prefersDark = globalThis.matchMedia(
    '(prefers-color-scheme: dark)',
  ).matches;
  return (saved ? saved === 'dark' : prefersDark) ? 'dark' : 'light';
}

export const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(resolveTheme);

  const switchPrimeReactTheme = (isDark: boolean) => {
    const themeUrl = isDark ? themes.dark : themes.light;

    // Find and update the theme link
    let themeLink = document.getElementById('app-theme') as HTMLLinkElement;

    if (!themeLink) {
      // Create if it doesn't exist
      themeLink = document.createElement('link');
      themeLink.id = 'app-theme';
      themeLink.rel = 'stylesheet';
      document.head.appendChild(themeLink);
    }

    themeLink.href = themeUrl;
  };

  const applyTheme = (next: 'light' | 'dark') => {
    const useDark = next === 'dark';
    document.documentElement.classList.toggle('dark', useDark);
    switchPrimeReactTheme(useDark);
  };

  const initTheme = () => {
    const next = resolveTheme();
    applyTheme(next);
    setTheme(next);
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      switchPrimeReactTheme(true);
    } else {
      document.documentElement.classList.remove('dark');
      switchPrimeReactTheme(false);
    }

    setTheme(newTheme);
  };

  return { theme, toggleTheme, initTheme };
};
