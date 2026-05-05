import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Tooltip } from 'primereact/tooltip';
import { taskService } from '../../services/task.service';
import { useConfirm } from '../../hooks/useConfirm';
import type { Task } from '@task-domain';

interface TaskItemProps {
  task: Task;
  onTaskChanged: () => void;
}

export const TaskItem = ({ task, onTaskChanged }: TaskItemProps) => {
  const { confirm } = useConfirm();

  const deleteTask = async () => {
    confirm({
      message: `Delete task "${task.text}"? This action cannot be undone.`,
      header: 'Confirm deletion',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await taskService.deleteTask(task);
          onTaskChanged();
        } catch (error) {
          console.error('Failed to delete task:', error);
        }
      },
    });
  };

  const toggleReminder = async () => {
    const updatedTask = { ...task, reminder: !task.reminder };
    try {
      await taskService.updateTaskReminder(updatedTask);
      onTaskChanged();
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

  const cardClass = `${task.reminder ? 'reminder' : ''} hover:shadow-xl transition-all duration-300 cursor-pointer`;

  return (
    <>
      <Tooltip target=".task-card" position="top" />
      <Card
        className={cardClass + ' task-card'}
        onDoubleClick={toggleReminder}
        data-pr-tooltip="Tip: Double-click to toggle reminder"
      >
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-2 wrap-break-word">
              {task.text}
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-300 flex items-center gap-2">
              <i className="pi pi-calendar text-blue-600 dark:text-blue-400"></i>
              {formatDate(task.day)}
            </p>
            {task.reminder && (
              <div className="mt-2 flex items-center gap-2">
                <i className="pi pi-bell text-amber-500"></i>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Reminder Set</span>
              </div>
            )}
          </div>
          <Tooltip target=".delete-button" position="left" />
          <Button
            icon="pi pi-times"
            rounded
            text
            severity="danger"
            onClick={deleteTask}
            className="shrink-0 delete-button"
            data-pr-tooltip="Delete task"
          />
        </div>
      </Card>
    </>
  );
};
