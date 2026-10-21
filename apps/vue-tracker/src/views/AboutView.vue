<script setup lang="ts">
// About View
</script>

<template>
  <div class="px-6 py-8">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-3xl font-bold text-gray-800 dark:text-slate-100 mb-6">
        About Task Tracker
      </h1>

      <div
        class="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md space-y-4"
      >
        <p class="text-gray-700 dark:text-slate-300">
          Task Tracker is a modern, feature-rich task management application
          built with Vue 3, PrimeVue, and integrated into an Nx monorepo
          workspace.
        </p>

        <div class="border-t border-gray-200 dark:border-slate-700 pt-4">
          <h2
            class="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-3"
          >
            Features
          </h2>
          <ul
            class="list-disc list-inside space-y-2 text-gray-700 dark:text-slate-300"
          >
            <li>Create, read, update, and delete tasks</li>
            <li>Set reminders for important tasks</li>
            <li>Search and filter tasks</li>
            <li>Pagination support for large task lists</li>
            <li>Dark mode support</li>
            <li>Responsive design</li>
          </ul>
        </div>

        <div class="border-t border-gray-200 dark:border-slate-700 pt-4">
          <h2
            class="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-3"
          >
            Technology Stack
          </h2>
          <ul
            class="list-disc list-inside space-y-2 text-gray-700 dark:text-slate-300"
          >
            <li>Vue 3 with Composition API</li>
            <li>TypeScript</li>
            <li>PrimeVue UI Components</li>
            <li>Vite for fast development</li>
            <li>Nx for monorepo management</li>
            <li>Axios for HTTP requests</li>
          </ul>
        </div>

        <div class="border-t border-gray-200 dark:border-slate-700 pt-4">
          <p class="text-sm text-gray-600 dark:text-slate-400">
            Version 1.0.0 | Built with ❤️ using Vue 3
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@media (min-width: 768px) {
  .about {
    max-width: 768px;
    margin-left: auto;
    margin-right: auto;
    padding: 0 1rem;
  }
}
</style>
