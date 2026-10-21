export const AboutView = () => {
  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-800 dark:text-slate-100 mb-6">
        About Task Tracker
      </h2>

      <div className="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md">
        <section>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-3">
            Overview
          </h3>
          <p className="text-gray-600 dark:text-slate-300 leading-relaxed">
            Task Tracker is a modern task management application built with
            React, TypeScript, and PrimeReact. It helps you organize your tasks,
            set reminders, and stay productive throughout your day.
          </p>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-3">
            Features
          </h3>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-slate-300">
            <li>Create, read, update, and delete tasks</li>
            <li>Set reminders for important tasks</li>
            <li>Search and filter your tasks</li>
            <li>Pagination for large task lists</li>
            <li>Dark mode support</li>
            <li>Responsive design for all devices</li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-3">
            Technology Stack
          </h3>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-slate-300">
            <li>React 19 with TypeScript</li>
            <li>React Router for navigation</li>
            <li>PrimeReact for UI components</li>
            <li>Tailwind CSS for styling</li>
            <li>Axios for API requests</li>
            <li>Vite for build tooling</li>
            <li>Nx for monorepo management</li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-3">
            Getting Started
          </h3>
          <p className="text-gray-600 dark:text-slate-300 leading-relaxed">
            To start using Task Tracker, simply add a new task by clicking the
            "Add Task" button on the home page. You can set a due date, add a
            description, and enable reminders for your tasks. Double-click on
            any task to toggle its reminder status.
          </p>
        </section>

        <section className="pt-4 border-t border-gray-200 dark:border-slate-700">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Version 1.0.0 | &copy; {new Date().getFullYear()} Task Tracker
          </p>
        </section>
      </div>
    </div>
  );
};
