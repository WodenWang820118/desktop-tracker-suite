<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { taskService } from '../../services/task.service';
import TaskItem from './TaskItem.vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import Paginator from 'primevue/paginator';
import type { Task } from '@task-domain';
import type { PageState } from 'primevue/paginator';

const tasks = ref<Task[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// Pagination state
const first = ref(0);
const rows = ref(10);
const totalRecords = ref(0);
const currentPage = computed(() => Math.floor(first.value / rows.value) + 1);

// Search state
const searchQuery = ref('');
let searchTimeout: ReturnType<typeof setTimeout>;

const loadTasks = async () => {
  loading.value = true;
  error.value = null;

  try {
    const params = {
      page: currentPage.value,
      limit: rows.value,
      search: searchQuery.value.trim() || undefined,
    };

    const response = await taskService.getTasks(params);
    tasks.value = response.data;
    totalRecords.value = response.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An error occurred';
  } finally {
    loading.value = false;
  }
};

const onSearchChange = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage.value === 1;
    first.value = 0;
    loadTasks();
  }, 300);
};

const onPageChange = (event: PageState) => {
  first.value = event.first;
  rows.value = event.rows;
  loadTasks();
};

const refreshTasks = () => {
  loadTasks();
};

onMounted(() => {
  loadTasks();
});

watch(searchQuery, onSearchChange);
</script>

<template>
  <div class="px-1 md:px-2 lg:px-3">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between py-4">
      <h2 class="text-xl font-semibold text-gray-800 dark:text-slate-100">Your Tasks</h2>
      <div class="flex items-center gap-2 w-full md:w-auto">
        <span class="relative flex-1 md:flex-none">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="searchQuery" placeholder="Search tasks..." class="w-full" />
          </IconField>
        </span>
        <RouterLink to="/add-task">
          <Button label="Add Task" icon="pi pi-plus" severity="success" />
        </RouterLink>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
    </div>

    <div
      v-if="error"
      class="bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg mb-4"
      role="alert"
    >
      <strong class="font-bold">Error:</strong>
      <span class="block sm:inline ml-2">{{ error }}</span>
    </div>

    <div v-if="!loading && !error && tasks.length === 0" class="text-center py-12">
      <p class="text-gray-500 dark:text-slate-400 text-lg">
        {{ searchQuery ? 'No tasks found. Try a different search.' : 'No tasks found. Add one to get started!' }}
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
      <TaskItem v-for="task in tasks" :key="task.id" :task="task" @task-changed="refreshTasks" />
    </div>

    <div v-if="!loading && tasks.length > 0" class="mt-6">
      <Paginator
        :first="first"
        :rows="rows"
        :totalRecords="totalRecords"
        :rowsPerPageOptions="[5, 10, 20, 50]"
        @page="onPageChange"
      />
    </div>
  </div>
</template>
