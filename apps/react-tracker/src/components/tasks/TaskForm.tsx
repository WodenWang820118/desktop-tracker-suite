import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { Checkbox } from 'primereact/checkbox';
import { taskService } from '../../services/task.service';
import type { Task } from '@task-domain';

export const TaskForm = () => {
  const navigate = useNavigate();

  const [taskText, setTaskText] = useState('');
  const [taskDate, setTaskDate] = useState<Date>(new Date());
  const [taskReminder, setTaskReminder] = useState(false);

  const cancelAddTask = () => {
    navigate('/');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskText || !taskDate) {
      alert('Please fill all fields');
      return;
    }

    const newTask: Task = {
      id: uuidv4(),
      text: taskText,
      day: taskDate.toISOString(),
      reminder: taskReminder,
    };

    try {
      await taskService.addTask(newTask);
      navigate('/');
    } catch (error) {
      console.error('Failed to add task:', error);
      alert('Failed to add task. Please try again.');
    }
  };

  return (
    <div className="px-6 py-8">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-6">Add New Task</h2>
      <form
        onSubmit={onSubmit}
        data-test-id="add-task-form"
        className="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md"
      >
        <div className="form-field">
          <label
            htmlFor="text"
            data-testid="label-task"
            className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
          >
            Task Description
          </label>
          <input
            id="text"
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            type="text"
            placeholder="Enter task description"
            data-test-id="input-task"
            className="p-inputtext p-component w-full"
          />
        </div>

        <div className="form-field">
          <label
            htmlFor="date"
            data-test-id="label-date"
            className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
          >
            Due Date
          </label>
          <Calendar
            id="date"
            value={taskDate}
            onChange={(e) => setTaskDate(e.value as Date)}
            showIcon
            className="w-full"
            showTime
            hourFormat="12"
          />
        </div>

        <div className="form-field flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
          <Checkbox
            inputId="reminder"
            checked={taskReminder}
            onChange={(e) => setTaskReminder(e.checked ?? false)}
            data-test-id="input-reminder"
            className="w-5 h-5"
          />
          <label
            htmlFor="reminder"
            data-test-id="label-reminder"
            className="text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer"
          >
            Set Reminder
          </label>
        </div>

        <div className="flex gap-4 pt-4">
          <Button
            className="flex-1"
            data-test-id="input-cancel-task"
            label="Cancel"
            id="cancelButton"
            onClick={cancelAddTask}
            severity="secondary"
            outlined
            type="button"
          />
          <Button
            className="flex-1"
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
  );
};
