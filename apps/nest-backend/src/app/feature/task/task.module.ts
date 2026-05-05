import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskEntity as Task } from '@task-domain';
import { TaskController } from './task.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Task])],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TypeOrmModule.forFeature([Task]), TaskService],
})
export class TaskModule {}
