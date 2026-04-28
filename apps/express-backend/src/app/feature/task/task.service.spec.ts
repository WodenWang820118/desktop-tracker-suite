import 'reflect-metadata';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Like } from 'typeorm';

const { MockTaskEntity, mockGetRepository, mockTaskRepository } = vi.hoisted(() => {
  class TaskEntityMock {}
  const repository = {
    create: vi.fn(),
    save: vi.fn(),
    findAndCount: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return {
    MockTaskEntity: TaskEntityMock,
    mockGetRepository: vi.fn(() => repository),
    mockTaskRepository: repository,
  };
});

vi.mock('./task.entity', () => ({
  Task: MockTaskEntity,
}));

vi.mock('../../core/database/database', () => ({
  AppDataSource: {
    getRepository: mockGetRepository,
  },
}));

import { Task } from './task.entity';
import { TaskService } from './task.service';

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(() => {
    mockGetRepository.mockReset();
    mockGetRepository.mockImplementation(() => mockTaskRepository);
    mockTaskRepository.create.mockReset();
    mockTaskRepository.save.mockReset();
    mockTaskRepository.findAndCount.mockReset();
    mockTaskRepository.findOne.mockReset();
    mockTaskRepository.update.mockReset();
    mockTaskRepository.delete.mockReset();

    service = new TaskService();
  });

  it('initializes the task repository from the app data source', () => {
    expect(mockGetRepository).toHaveBeenCalledWith(Task);
  });

  it('creates a task through the repository', async () => {
    const createTaskDto = {
      id: '1',
      text: 'Review Vitest wiring',
      day: '2026-04-23',
      reminder: true,
    };
    const savedTask = {
      ...createTaskDto,
      createdAt: new Date('2026-04-23T00:00:00.000Z'),
      updatedAt: new Date('2026-04-23T00:00:00.000Z'),
    };

    mockTaskRepository.create.mockReturnValue(createTaskDto);
    mockTaskRepository.save.mockResolvedValue(savedTask);

    await expect(service.create(createTaskDto)).resolves.toEqual(savedTask);
    expect(mockTaskRepository.create).toHaveBeenCalledWith(createTaskDto);
    expect(mockTaskRepository.save).toHaveBeenCalledWith(createTaskDto);
  });

  it('surfaces repository errors during create', async () => {
    const createTaskDto = {
      id: '1',
      text: 'Review Vitest wiring',
      day: '2026-04-23',
      reminder: true,
    };
    const saveError = new Error('save failed');

    mockTaskRepository.create.mockReturnValue(createTaskDto);
    mockTaskRepository.save.mockRejectedValue(saveError);

    await expect(service.create(createTaskDto)).rejects.toThrow('save failed');
  });

  it('returns paginated tasks with the default paging values', async () => {
    const rows = [
      {
        id: '1',
        text: 'Ship backend tests',
        day: '2026-04-23',
        reminder: false,
      },
    ];

    mockTaskRepository.findAndCount.mockResolvedValue([rows, 1]);

    await expect(service.findAll()).resolves.toEqual({
      data: rows,
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    expect(mockTaskRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        take: 10,
        skip: 0,
        order: {
          createdAt: 'DESC',
        },
      }),
    );
  });

  it('applies search filters and custom paging values', async () => {
    mockTaskRepository.findAndCount.mockResolvedValue([[], 0]);

    await expect(
      service.findAll({
        page: 3,
        limit: 5,
        search: 'ship',
      }),
    ).resolves.toEqual({
      data: [],
      total: 0,
      page: 3,
      limit: 5,
      totalPages: 0,
    });
    expect(mockTaskRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          text: Like('%ship%'),
        },
        take: 5,
        skip: 10,
        order: {
          createdAt: 'DESC',
        },
      }),
    );
  });

  it('surfaces repository errors during findAll', async () => {
    mockTaskRepository.findAndCount.mockRejectedValue(new Error('query failed'));

    await expect(service.findAll()).rejects.toThrow('query failed');
  });

  it('calculates total pages across multiple pages of results', async () => {
    const rows = [
      {
        id: '11',
        text: 'Task 11',
        day: '2026-04-23',
        reminder: false,
      },
    ];

    mockTaskRepository.findAndCount.mockResolvedValue([rows, 11]);

    await expect(
      service.findAll({
        page: 2,
        limit: 10,
      }),
    ).resolves.toEqual({
      data: rows,
      total: 11,
      page: 2,
      limit: 10,
      totalPages: 2,
    });
    expect(mockTaskRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        take: 10,
        skip: 10,
        order: {
          createdAt: 'DESC',
        },
      }),
    );
  });

  it('returns a task by id', async () => {
    const task = {
      id: '1',
      text: 'Ship backend tests',
      day: '2026-04-23',
      reminder: false,
    };

    mockTaskRepository.findOne.mockResolvedValue(task);

    await expect(service.findOne('1')).resolves.toEqual(task);
    expect(mockTaskRepository.findOne).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('returns null when a task id does not exist', async () => {
    mockTaskRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne('missing')).resolves.toBeNull();
    expect(mockTaskRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'missing' },
    });
  });

  it('surfaces repository errors during findOne', async () => {
    mockTaskRepository.findOne.mockRejectedValue(new Error('find failed'));

    await expect(service.findOne('missing')).rejects.toThrow('find failed');
  });

  it('updates a task and reloads it by id', async () => {
    const updateTaskDto = {
      text: 'Updated task',
      day: '2026-04-24',
      reminder: true,
    };
    const updatedTask = {
      id: '1',
      ...updateTaskDto,
    };

    mockTaskRepository.update.mockResolvedValue({ affected: 1 });
    mockTaskRepository.findOne.mockResolvedValue(updatedTask);

    await expect(service.update('1', updateTaskDto)).resolves.toEqual(
      updatedTask,
    );
    expect(mockTaskRepository.update).toHaveBeenCalledWith('1', {
      text: updateTaskDto.text,
      day: updateTaskDto.day,
      reminder: updateTaskDto.reminder,
    });
    expect(mockTaskRepository.findOne).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('returns null when updating a non-existent task', async () => {
    const updateTaskDto = {
      text: 'Updated task',
      day: '2026-04-24',
      reminder: true,
    };

    mockTaskRepository.update.mockResolvedValue({ affected: 0 });
    mockTaskRepository.findOne.mockResolvedValue(null);

    await expect(service.update('missing', updateTaskDto)).resolves.toBeNull();
    expect(mockTaskRepository.update).toHaveBeenCalledWith('missing', {
      text: updateTaskDto.text,
      day: updateTaskDto.day,
      reminder: updateTaskDto.reminder,
    });
    expect(mockTaskRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'missing' },
    });
  });

  it('surfaces repository errors during update', async () => {
    const updateTaskDto = {
      text: 'Updated task',
      day: '2026-04-24',
      reminder: true,
    };

    mockTaskRepository.update.mockRejectedValue(new Error('update failed'));

    await expect(service.update('1', updateTaskDto)).rejects.toThrow(
      'update failed',
    );
  });

  it('surfaces repository errors when reloading an updated task', async () => {
    const updateTaskDto = {
      text: 'Updated task',
      day: '2026-04-24',
      reminder: true,
    };

    mockTaskRepository.update.mockResolvedValue({ affected: 1 });
    mockTaskRepository.findOne.mockRejectedValue(new Error('reload failed'));

    await expect(service.update('1', updateTaskDto)).rejects.toThrow(
      'reload failed',
    );
  });

  it('returns the affected row count when removing by id', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: 1 });

    await expect(service.remove('1')).resolves.toBe(1);
    expect(mockTaskRepository.delete).toHaveBeenCalledWith('1');
  });

  it('returns null when removing by id reports no affected rows', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: null });

    await expect(service.remove('missing')).resolves.toBeNull();
    expect(mockTaskRepository.delete).toHaveBeenCalledWith('missing');
  });

  it('returns 0 when removing by id reports zero affected rows', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: 0 });

    await expect(service.remove('missing')).resolves.toBe(0);
    expect(mockTaskRepository.delete).toHaveBeenCalledWith('missing');
  });

  it('returns undefined when removing by id reports an undefined affected count', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: undefined });

    await expect(service.remove('missing')).resolves.toBeUndefined();
    expect(mockTaskRepository.delete).toHaveBeenCalledWith('missing');
  });

  it('surfaces repository errors during remove by id', async () => {
    mockTaskRepository.delete.mockRejectedValue(new Error('delete failed'));

    await expect(service.remove('missing')).rejects.toThrow('delete failed');
  });

  it('returns the affected row count when removing by name', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: 1 });

    await expect(service.removeByName('Ship backend tests')).resolves.toBe(1);
    expect(mockTaskRepository.delete).toHaveBeenCalledWith({
      text: 'Ship backend tests',
    });
  });

  it('returns undefined when removing by name reports an undefined affected count', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: undefined });

    await expect(service.removeByName('missing')).resolves.toBeUndefined();
    expect(mockTaskRepository.delete).toHaveBeenCalledWith({
      text: 'missing',
    });
  });

  it('returns 0 when removing by name reports zero affected rows', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: 0 });

    await expect(service.removeByName('missing')).resolves.toBe(0);
    expect(mockTaskRepository.delete).toHaveBeenCalledWith({
      text: 'missing',
    });
  });

  it('returns null when removing by name reports no affected rows', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: null });

    await expect(service.removeByName('missing')).resolves.toBeNull();
    expect(mockTaskRepository.delete).toHaveBeenCalledWith({
      text: 'missing',
    });
  });

  it('surfaces repository errors during remove by name', async () => {
    mockTaskRepository.delete.mockRejectedValue(new Error('delete failed'));

    await expect(service.removeByName('missing')).rejects.toThrow(
      'delete failed',
    );
  });
});
