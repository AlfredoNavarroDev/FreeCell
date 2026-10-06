import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Registro de quién hizo qué: cargar, vender, anular o ver licencias, aprobar pagos, etc. */
@Entity('audit_logs')
@Index(['entity', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column()
  action!: string;

  @Column()
  entity!: string;

  @Column()
  entityId!: string;

  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
