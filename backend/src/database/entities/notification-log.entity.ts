import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Evita enviar dos veces el mismo mensaje cuando BullMQ reintenta un trabajo. */
@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  key!: string;

  @Column()
  channel!: string;

  @Column()
  recipient!: string;

  @Column()
  template!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
