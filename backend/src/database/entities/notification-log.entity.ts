import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Huella de cada mensaje enviado: evita duplicados cuando BullMQ reintenta. */
@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  key!: string;

  @Column({ type: 'varchar', length: 20 })
  channel!: string;

  @Column({ type: 'varchar', length: 254 })
  recipient!: string;

  @Column({ type: 'varchar', length: 60 })
  template!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
