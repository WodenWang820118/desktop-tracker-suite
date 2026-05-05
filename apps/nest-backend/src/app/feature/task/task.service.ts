import { Injectable } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskEntity as Task } from '@task-domain';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import {
  PaginationQueryDto,
  PaginatedResponse,
} from './dto/pagination-query.dto';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    try {
      console.log('Creating task with DTO:', createTaskDto);
      const task = this.taskRepository.create(createTaskDto);
      console.log('Task entity created:', task);
      const savedTask = await this.taskRepository.save(task);
      console.log('Task saved to database:', savedTask);
      return savedTask;
    } catch (error) {
      console.error('Error in task service create method:', error);
      throw error;
    }
  }

  async findAll(query?: PaginationQueryDto): Promise<PaginatedResponse<Task>> {
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const search = query?.search?.trim();

    const skip = (page - 1) * limit;

    // Build where clause for search
    const whereClause: any = {};
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

  async findOne(id: string) {
    return await this.taskRepository.findOne({ where: { id } });
  }

  async update(id: string, updateTaskDto: UpdateTaskDto) {
    await this.taskRepository.update(id, {
      text: updateTaskDto.text,
      day: updateTaskDto.day,
      reminder: updateTaskDto.reminder,
    });
    return await this.findOne(id);
  }

  async remove(id: string) {
    const result = await this.taskRepository.delete(id);
    return result.affected;
  }

  async removeByName(name: string) {
    const result = await this.taskRepository.delete({ text: name });
    return result.affected;
  }
}
