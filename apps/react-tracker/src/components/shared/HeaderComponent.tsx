import { Link } from 'react-router-dom';
import { Button } from 'primereact/button';
import { useTheme } from '../../hooks/useTheme';

export const HeaderComponent = () => {
  const { theme, toggleTheme } = useTheme();

  const themeIcon = theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon';
  const themeLabel = theme === 'dark' ? 'Light' : 'Dark';

  return (
    <header className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/90 backdrop-blur border-b border-gray-200 dark:border-slate-700">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold text-gray-800 dark:text-slate-100"
        >
          <i className="pi pi-check-circle text-blue-600"></i>
          <span>Task Tracker</span>
        </Link>

        <nav className="flex items-center gap-2 ml-2 text-sm">
          <Link
            to="/"
            className="px-3 py-2 rounded-md text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          >
            Home
          </Link>
          <Link
            to="/about"
            className="px-3 py-2 rounded-md text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          >
            About
          </Link>
        </nav>

        <div className="flex-1"></div>

        <Button
          label={themeLabel}
          icon={themeIcon}
          onClick={toggleTheme}
          severity="secondary"
          outlined
          className="ml-2"
        />
      </div>
    </header>
  );
};
