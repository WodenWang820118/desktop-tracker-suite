import axios from 'axios';
import type { Task, PaginatedResponse, PaginationQuery } from '@task-domain';
import { environment } from '../config/environment';

const viteTaskApiUrl = import.meta.env.VITE_TASK_API_URL as string | undefined;

const resolvedBaseUrl =
  viteTaskApiUrl ??
  (globalThis.window !== undefined &&
  globalThis.window.location?.protocol === 'file:'
    ? 'http://localhost:3000/tasks'
    : environment.taskApiUrl);

const http = axios.create({
  baseURL: resolvedBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const taskService = {
  async getTasks(params?: PaginationQuery): Promise<PaginatedResponse<Task>> {
    try {
      const response = await http.get<PaginatedResponse<Task>>('', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }
  },

  async deleteTask(task: Task): Promise<Task> {
    try {
      const response = await http.delete<Task>(`/${task.id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  },

  async updateTaskReminder(task: Task): Promise<Task> {
    try {
      const response = await http.put<Task>(`/${task.id}`, task);
      return response.data;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  },

  async addTask(task: Task): Promise<Task> {
    try {
      const response = await http.post<Task>('/create', task);
      return response.data;
    } catch (error) {
      console.error('Error adding task:', error);
      throw error;
    }
  },
};
