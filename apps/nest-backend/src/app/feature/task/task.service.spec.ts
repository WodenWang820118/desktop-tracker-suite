import 'reflect-metadata';

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Like } from 'typeorm';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockTaskEntity } = vi.hoisted(() => {
  class TaskEntityMock {}

  return {
    MockTaskEntity: TaskEntityMock,
  };
});

vi.mock('@task-domain', () => ({
  TaskEntity: MockTaskEntity,
}));

import { TaskEntity as Task } from '@task-domain';

describe('TaskService', () => {
  let service: TaskService;
  let mockTaskRepository: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskService],
    })
      .useMocker((token) => {
        if (token === getRepositoryToken(Task)) {
          return {
            create: vi.fn(),
            save: vi.fn(),
            findAndCount: vi.fn(),
            findOne: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          };
        }

        if (typeof token === 'function') {
          return vi.fn();
        }
      })
      .compile();
    service = module.get<TaskService>(TaskService);
    mockTaskRepository = module.get(getRepositoryToken(Task));
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  it('should create a task', async () => {
    const createTaskDto: CreateTaskDto = {
      id: '1',
      text: 'Test task',
      day: '2023-07-31',
      reminder: true,
    };
    const expectedResult = { id: '1', ...createTaskDto };
    mockTaskRepository.create.mockReturnValue(createTaskDto);
    mockTaskRepository.save.mockResolvedValue(expectedResult);
    const result = await service.create(createTaskDto);
    expect(mockTaskRepository.create).toHaveBeenCalledWith(createTaskDto);
    expect(mockTaskRepository.save).toHaveBeenCalledWith(createTaskDto);
    expect(result).toEqual(expectedResult);
  });
  it('should surface repository errors during create', async () => {
    const createTaskDto: CreateTaskDto = {
      id: '1',
      text: 'Test task',
      day: '2023-07-31',
      reminder: true,
    };
    const saveError = new Error('save failed');

    mockTaskRepository.create.mockReturnValue(createTaskDto);
    mockTaskRepository.save.mockRejectedValue(saveError);

    await expect(service.create(createTaskDto)).rejects.toThrow('save failed');
  });
  it('should return a paginated result of tasks', async () => {
    const expectedTasks = [
      { id: '1', text: 'Task 1', day: '2023-07-31', reminder: true },
      { id: '2', text: 'Task 2', day: '2023-08-01', reminder: false },
    ];
    mockTaskRepository.findAndCount.mockResolvedValue([expectedTasks, 2]);
    const result = await service.findAll();
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
    expect(result).toEqual({
      data: expectedTasks,
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });
  it('should apply the search filter and custom pagination', async () => {
    mockTaskRepository.findAndCount.mockResolvedValue([[], 0]);

    const result = await service.findAll({
      page: 3,
      limit: 5,
      search: 'ship',
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
    expect(result).toEqual({
      data: [],
      total: 0,
      page: 3,
      limit: 5,
      totalPages: 0,
    });
  });
  it('should surface repository errors during findAll', async () => {
    mockTaskRepository.findAndCount.mockRejectedValue(
      new Error('query failed'),
    );

    await expect(service.findAll()).rejects.toThrow('query failed');
  });
  it('should calculate total pages across multiple pages of results', async () => {
    const expectedTasks = [
      { id: '11', text: 'Task 11', day: '2023-08-10', reminder: false },
    ];
    mockTaskRepository.findAndCount.mockResolvedValue([expectedTasks, 11]);

    const result = await service.findAll({
      page: 2,
      limit: 10,
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
    expect(result).toEqual({
      data: expectedTasks,
      total: 11,
      page: 2,
      limit: 10,
      totalPages: 2,
    });
  });
  it('should return a task by id', async () => {
    const id = '1';
    const expectedResult = {
      id,
      text: 'Task 1',
      day: '2023-07-31',
      reminder: true,
    };
    mockTaskRepository.findOne.mockResolvedValue(expectedResult);
    const result = await service.findOne(id);
    expect(mockTaskRepository.findOne).toHaveBeenCalledWith({ where: { id } });
    expect(result).toEqual(expectedResult);
  });
  it('should return null when a task id does not exist', async () => {
    mockTaskRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne('missing')).resolves.toBeNull();
    expect(mockTaskRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'missing' },
    });
  });
  it('should surface repository errors during findOne', async () => {
    mockTaskRepository.findOne.mockRejectedValue(new Error('find failed'));

    await expect(service.findOne('missing')).rejects.toThrow('find failed');
  });
  it('should update a task', async () => {
    const id = '1';
    const updateTaskDto: UpdateTaskDto = {
      text: 'Updated task',
      day: '2023-08-01',
      reminder: false,
    };
    const updatedTask = { id, ...updateTaskDto };
    mockTaskRepository.update.mockResolvedValue({ affected: 1 });
    mockTaskRepository.findOne.mockResolvedValue(updatedTask);
    const result = await service.update(id, updateTaskDto);
    expect(mockTaskRepository.update).toHaveBeenCalledWith(id, {
      text: updateTaskDto.text,
      day: updateTaskDto.day,
      reminder: updateTaskDto.reminder,
    });
    expect(mockTaskRepository.findOne).toHaveBeenCalledWith({ where: { id } });
    expect(result).toEqual(updatedTask);
  });
  it('should return null when updating a non-existent task', async () => {
    const updateTaskDto: UpdateTaskDto = {
      text: 'Updated task',
      day: '2023-08-01',
      reminder: false,
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
  it('should surface repository errors during update', async () => {
    const updateTaskDto: UpdateTaskDto = {
      text: 'Updated task',
      day: '2023-08-01',
      reminder: false,
    };

    mockTaskRepository.update.mockRejectedValue(new Error('update failed'));

    await expect(service.update('1', updateTaskDto)).rejects.toThrow(
      'update failed',
    );
  });
  it('should surface repository errors when reloading an updated task', async () => {
    const updateTaskDto: UpdateTaskDto = {
      text: 'Updated task',
      day: '2023-08-01',
      reminder: false,
    };

    mockTaskRepository.update.mockResolvedValue({ affected: 1 });
    mockTaskRepository.findOne.mockRejectedValue(new Error('reload failed'));

    await expect(service.update('1', updateTaskDto)).rejects.toThrow(
      'reload failed',
    );
  });
  it('should remove a task by id', async () => {
    const id = '1';
    const expectedResult = { affected: 1 };
    mockTaskRepository.delete.mockResolvedValue(expectedResult);
    const result = await service.remove(id);
    expect(mockTaskRepository.delete).toHaveBeenCalledWith(id);
    expect(result).toEqual(1);
  });
  it('should return null when remove by id reports no affected rows', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: null });

    await expect(service.remove('missing')).resolves.toBeNull();
    expect(mockTaskRepository.delete).toHaveBeenCalledWith('missing');
  });
  it('should return 0 when remove by id reports zero affected rows', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: 0 });

    await expect(service.remove('missing')).resolves.toBe(0);
    expect(mockTaskRepository.delete).toHaveBeenCalledWith('missing');
  });
  it('should return undefined when remove by id reports an undefined affected count', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: undefined });

    await expect(service.remove('missing')).resolves.toBeUndefined();
    expect(mockTaskRepository.delete).toHaveBeenCalledWith('missing');
  });
  it('should surface repository errors during remove by id', async () => {
    mockTaskRepository.delete.mockRejectedValue(new Error('delete failed'));

    await expect(service.remove('missing')).rejects.toThrow('delete failed');
  });
  it('should remove a task by name', async () => {
    const name = 'Test task';
    const expectedResult = { affected: 1 };
    mockTaskRepository.delete.mockResolvedValue(expectedResult);
    const result = await service.removeByName(name);
    expect(mockTaskRepository.delete).toHaveBeenCalledWith({ text: name });
    expect(result).toEqual(1);
  });
  it('should return undefined when remove by name reports an undefined affected count', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: undefined });

    await expect(service.removeByName('missing')).resolves.toBeUndefined();
    expect(mockTaskRepository.delete).toHaveBeenCalledWith({ text: 'missing' });
  });
  it('should return 0 when remove by name reports zero affected rows', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: 0 });

    await expect(service.removeByName('missing')).resolves.toBe(0);
    expect(mockTaskRepository.delete).toHaveBeenCalledWith({ text: 'missing' });
  });
  it('should return null when remove by name reports a null affected count', async () => {
    mockTaskRepository.delete.mockResolvedValue({ affected: null });

    await expect(service.removeByName('missing')).resolves.toBeNull();
    expect(mockTaskRepository.delete).toHaveBeenCalledWith({ text: 'missing' });
  });
  it('should surface repository errors during remove by name', async () => {
    mockTaskRepository.delete.mockRejectedValue(new Error('delete failed'));

    await expect(service.removeByName('missing')).rejects.toThrow(
      'delete failed',
    );
  });
});
