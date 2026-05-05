<script setup lang="ts">
import { computed } from 'vue';
import Card from 'primevue/card';
import Button from 'primevue/button';
import { taskService } from '../../services/task.service';
import { useConfirmService } from '../../composables/useConfirm';
import type { Task } from '@task-domain';

const props = defineProps<{
  task: Task;
}>();

const emit = defineEmits<{
  taskChanged: [];
}>();

const { showConfirm } = useConfirmService();

const reminderClass = computed(() => ({
  reminder: props.task.reminder,
  'hover:shadow-xl': true,
  'transition-all': true,
  'duration-300': true,
  'cursor-pointer': true,
}));

const deleteTask = async () => {
  const confirmed = await showConfirm({
    title: 'Confirm deletion',
    message: `Delete task "${props.task.text}"? This action cannot be undone.`,
    acceptLabel: 'Delete',
    rejectLabel: 'Cancel',
    severity: 'danger',
  });

  if (!confirmed) return;

  try {
    await taskService.deleteTask(props.task);
    emit('taskChanged');
  } catch (error) {
    console.error('Failed to delete task:', error);
  }
};

const toggleReminder = async () => {
  const updatedTask = { ...props.task, reminder: !props.task.reminder };
  try {
    await taskService.updateTaskReminder(updatedTask);
    emit('taskChanged');
  } catch (error) {
    console.error('Failed to update reminder:', error);
  }
};

const formatDate = (date: string) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
</script>

<template>
  <Card :class="reminderClass" @dblclick="toggleReminder" v-tooltip.top="'Tip: Double-click to toggle reminder'">
    <template #content>
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-2 wrap-break-word">
            {{ task.text }}
          </h3>
          <p class="text-sm text-gray-600 dark:text-slate-300 flex items-center gap-2">
            <i class="pi pi-calendar text-blue-600 dark:text-blue-400"></i>
            {{ formatDate(task.day) }}
          </p>
          <div v-if="task.reminder" class="mt-2 flex items-center gap-2">
            <i class="pi pi-bell text-amber-500"></i>
            <span class="text-xs text-amber-600 dark:text-amber-400 font-medium">Reminder Set</span>
          </div>
        </div>
        <Button
          icon="pi pi-times"
          rounded
          text
          severity="danger"
          @click="deleteTask"
          v-tooltip.left="'Delete task'"
          class="shrink-0"
        />
      </div>
    </template>
  </Card>
</template>

<style scoped>
.reminder {
  border-left: 4px solid #f59e0b;
}
</style>
