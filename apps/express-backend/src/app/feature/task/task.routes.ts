import { Router, Request, Response } from 'express';
import { TaskService } from './task.service';
import { CreateTaskDto, PaginationQueryDto } from './task.dto';

const router = Router();
const taskService = new TaskService();

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

// GET /tasks - Get all tasks with pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const query: PaginationQueryDto = {
      page: req.query.page ? Number.parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? Number.parseInt(req.query.limit as string) : 10,
      search: req.query.search as string,
    };
    const result = await taskService.findAll(query);
    res.json(result);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /tasks/:id - Get a single task by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const task = await taskService.findOne(routeParam(req.params.id));
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /tasks/create - Create a new task
router.post('/create', async (req: Request, res: Response) => {
  try {
    const createTaskDto: CreateTaskDto = req.body;
    const task = await taskService.create(createTaskDto);
    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /tasks/:id - Update a task
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const task = await taskService.update(routeParam(req.params.id), req.body);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /tasks/:id - Delete a task
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const affected = await taskService.remove(routeParam(req.params.id));
    if (!affected || affected === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully', affected });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
