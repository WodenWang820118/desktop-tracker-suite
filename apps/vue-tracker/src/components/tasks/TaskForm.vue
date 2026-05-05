<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { v4 as uuidv4 } from 'uuid';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import DatePicker from 'primevue/datepicker';
import Checkbox from 'primevue/checkbox';
import { taskService } from '../../services/task.service';
import type { CreateTaskDto } from '@task-domain';

const router = useRouter();

const taskText = ref('');
const taskDate = ref<Date>(new Date());
const taskReminder = ref(false);

const cancelAddTask = () => {
  router.push('/');
};

const onSubmit = async () => {
  if (!taskText.value || !taskDate.value) {
    alert('Please fill all fields');
    return;
  }

  const newTask: CreateTaskDto = {
    id: uuidv4(),
    text: taskText.value,
    day: taskDate.value instanceof Date ? taskDate.value.toISOString() : taskDate.value,
    reminder: taskReminder.value,
  };

  console.log('Submitting task:', newTask);
  console.log('API URL:', import.meta.env.VITE_TASK_API_URL || 'http://localhost:3000/tasks');

  try {
    const result = await taskService.addTask(newTask);
    console.log('Task added successfully:', result);
    router.push('/');
  } catch (error: any) {
    console.error('Failed to add task - Full error:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    console.error('Error config:', error.config);
    
    let errorMessage = 'Failed to add task. ';
    if (error.response) {
      errorMessage += `Server responded with status ${error.response.status}: ${JSON.stringify(error.response.data)}`;
    } else if (error.request) {
      errorMessage += `No response received from server. Please check if the backend is running on ${import.meta.env.VITE_TASK_API_URL || 'http://localhost:3000/tasks'}`;
    } else {
      errorMessage += `Error: ${error.message}`;
    }
    
    alert(errorMessage);
  }
};
</script>

<template>
  <div class="px-6 py-8">
    <h2 class="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-6">Add New Task</h2>
    <form
      @submit.prevent="onSubmit"
      data-test-id="add-task-form"
      class="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md"
    >
      <div class="form-field">
        <label for="text" data-testid="label-task" class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Task Description
        </label>
        <InputText
          id="text"
          v-model="taskText"
          type="text"
          placeholder="Enter task description"
          data-test-id="input-task"
          class="w-full"
        />
      </div>

      <div class="form-field">
        <label for="date" data-test-id="label-date" class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Due Date
        </label>
        <DatePicker
          id="date"
          v-model="taskDate"
          :showIcon="true"
          appendTo="body"
          class="w-full"
          showTime
          hourFormat="12"
        />
      </div>

      <div class="form-field flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
        <Checkbox
          id="reminder"
          v-model="taskReminder"
          :binary="true"
          data-test-id="input-reminder"
          class="w-5 h-5"
        />
        <label
          for="reminder"
          data-test-id="label-reminder"
          class="text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer"
        >
          Set Reminder
        </label>
      </div>

      <div class="flex gap-4 pt-4">
        <Button
          class="flex-1"
          data-test-id="input-cancel-task"
          label="Cancel"
          id="cancelButton"
          @click="cancelAddTask"
          severity="secondary"
          outlined
          type="button"
        />
        <Button
          class="flex-1"
          data-test-id="input-save-task"
          label="Save Task"
          id="submitButton"
          type="submit"
          severity="success"
          icon="pi pi-check"
        />
      </div>
    </form>
  </div>
</template>
