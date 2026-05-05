import { Repository, Like } from 'typeorm';
import { TaskEntity as Task } from '@task-domain';
import {
  CreateTaskDto,
  UpdateTaskDto,
  PaginationQueryDto,
  PaginatedResponse,
} from './task.dto';
import { AppDataSource } from '../../core/database/database';

export class TaskService {
  private readonly taskRepository: Repository<Task>;

  constructor() {
    this.taskRepository = AppDataSource.getRepository(Task);
  }

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const task = this.taskRepository.create(createTaskDto);
    return await this.taskRepository.save(task);
  }

  async findAll(query?: PaginationQueryDto): Promise<PaginatedResponse<Task>> {
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const search = query?.search?.trim();

    const skip = (page - 1) * limit;

    // Build where clause for search
    const whereClause: Record<string, any> = {};
    if (search) {
      whereClause.text = Like(`%${search}%`);
    }

    // Get total count and paginated data
    const [rows, count] = await this.taskRepository.findAndCount({
      where: whereClause,
      take: limit,
      skip,
      order: {
        createdAt: 'DESC',
      },
    });

    const totalPages = Math.ceil(count / limit);

    return {
      data: rows,
      total: count,
      page,
      limit,
      totalPages,
    };
  }

  async findOne(id: string): Promise<Task | null> {
    return await this.taskRepository.findOne({ where: { id } });
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task | null> {
    await this.taskRepository.update(id, {
      text: updateTaskDto.text,
      day: updateTaskDto.day,
      reminder: updateTaskDto.reminder,
    });
    return await this.findOne(id);
  }

  async remove(id: string): Promise<number | null | undefined> {
    const result = await this.taskRepository.delete(id);
    return result.affected;
  }

  async removeByName(name: string): Promise<number | null | undefined> {
    const result = await this.taskRepository.delete({ text: name });
    return result.affected;
  }
}
