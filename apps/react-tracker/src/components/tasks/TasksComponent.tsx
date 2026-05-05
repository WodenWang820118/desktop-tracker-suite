import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { taskService } from '../../services/task.service';
import { TaskItem } from './TaskItem';
import { Button } from 'primereact/button';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { Paginator, PaginatorPageChangeEvent } from 'primereact/paginator';
import type { Task } from '@task-domain';

export const TasksComponent = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        page: Math.floor(first / rows) + 1,
        limit: rows,
        search: searchQuery.trim() || undefined,
      };

      const response = await taskService.getTasks(params);
      setTasks(response.data);
      setTotalRecords(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [first, rows, searchQuery]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadTasks();
    }, 300);

    return () => clearTimeout(timeout);
  }, [loadTasks]);

  const onPageChange = (event: PaginatorPageChangeEvent) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const refreshTasks = () => {
    loadTasks();
  };

  return (
    <div className="px-1 md:px-2 lg:px-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between py-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100">Your Tasks</h2>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="relative flex-1 md:flex-none">
            <IconField>
              <InputIcon className="pi pi-search" />
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setFirst(0);
                }}
                placeholder="Search tasks..."
                className="p-inputtext p-component w-full"
              />
            </IconField>
          </span>
          <Link to="/add-task">
            <Button label="Add Task" icon="pi pi-plus" severity="success" />
          </Link>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
        </div>
      )}

      {error && (
        <div
          className="bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg mb-4"
          role="alert"
        >
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-slate-400 text-lg">
            {searchQuery ? 'No tasks found. Try a different search.' : 'No tasks found. Add one to get started!'}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} onTaskChanged={refreshTasks} />
        ))}
      </div>

      {!loading && tasks.length > 0 && (
        <div className="mt-6">
          <Paginator
            first={first}
            rows={rows}
            totalRecords={totalRecords}
            rowsPerPageOptions={[5, 10, 20, 50]}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
};
