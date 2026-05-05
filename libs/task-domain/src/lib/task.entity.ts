// ---------------------------------------------------------------------------
// TypeORM entity – used by nest-backend AND express-backend.
// Both backends previously had identical copies of this class.
// ---------------------------------------------------------------------------

import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tasks')
export class Task {
  @PrimaryColumn()
  id!: string;

  @Column()
  text!: string;

  @Column()
  day!: string;

  @Column()
  reminder!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
