export const FooterComponent = () => {
  return (
    <footer className="mt-auto py-6 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="max-w-5xl mx-auto px-4 text-center">
        <p className="text-gray-600 dark:text-slate-400 text-sm">
          &copy; {new Date().getFullYear()} Task Tracker. Built with React and
          PrimeReact.
        </p>
      </div>
    </footer>
  );
};
