import axios from 'axios';
import type {
  Task,
  CreateTaskDto,
  PaginatedResponse,
  PaginationQuery,
} from '@task-domain';
import { environment } from '../config/environment';

const http = axios.create({
  baseURL: environment.taskApiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for debugging
http.interceptors.request.use(
  (config) => {
    console.log('API Request:', {
      method: config.method,
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`,
      data: config.data,
      headers: config.headers,
    });
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  },
);

// Add response interceptor for debugging
http.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      status: response.status,
      statusText: response.statusText,
      data: response.data,
    });
    return response;
  },
  (error) => {
    console.error('Response interceptor error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      config: {
        method: error.config?.method,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
      },
    });
    return Promise.reject(error);
  },
);

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

  async addTask(task: CreateTaskDto): Promise<Task> {
    try {
      const response = await http.post<Task>('/create', task);
      return response.data;
    } catch (error) {
      console.error('Error adding task:', error);
      throw error;
    }
  },
};
