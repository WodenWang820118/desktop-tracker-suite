<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Button from 'primevue/button';
import { useTheme } from '../../composables/useTheme';

const { theme, toggleTheme } = useTheme();

const themeIcon = computed(() =>
  theme.value === 'dark' ? 'pi pi-sun' : 'pi pi-moon',
);
const themeLabel = computed(() => (theme.value === 'dark' ? 'Light' : 'Dark'));
</script>

<template>
  <header
    class="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/90 backdrop-blur border-b border-gray-200 dark:border-slate-700"
  >
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
      <RouterLink
        to="/"
        class="flex items-center gap-2 font-semibold text-gray-800 dark:text-slate-100"
      >
        <i class="pi pi-check-circle text-blue-600"></i>
        <span>Task Tracker</span>
      </RouterLink>

      <nav class="flex items-center gap-2 ml-2 text-sm">
        <RouterLink
          to="/"
          class="px-3 py-2 rounded-md text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          active-class="bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100"
        >
          Home
        </RouterLink>
        <RouterLink
          to="/about"
          class="px-3 py-2 rounded-md text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          active-class="bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100"
        >
          About
        </RouterLink>
      </nav>

      <div class="flex-1"></div>

      <Button
        :label="themeLabel"
        :icon="themeIcon"
        @click="toggleTheme"
        severity="secondary"
        outlined
        class="ml-2"
      />
    </div>
  </header>
</template>
