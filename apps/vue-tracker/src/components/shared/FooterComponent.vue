<script setup lang="ts">
// Footer component with minimal styling
</script>

<template>
  <footer
    class="mt-auto py-6 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900"
  >
    <div class="max-w-5xl mx-auto px-4 text-center">
      <p class="text-gray-600 dark:text-slate-400 text-sm">
        &copy; {{ new Date().getFullYear() }} Task Tracker. Built with Vue 3 and
        PrimeVue.
      </p>
    </div>
  </footer>
</template>
