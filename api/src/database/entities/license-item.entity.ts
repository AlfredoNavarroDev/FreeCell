import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LicenseStatus } from '../enums';
import { LicenseBatch } from './license-batch.entity';
import { OrderItem } from './order-item.entity';
import { Plan } from './plan.entity';

@Entity('license_items')
@Index(['planId', 'status'])
export class LicenseItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column({ type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => LicenseBatch)
  @JoinColumn({ name: 'batchId' })
  batch?: LicenseBatch;

  /** AES-256-GCM (iv.tag.cifrado en base64). La clave nunca se guarda en claro. */
  @Column({ type: 'text' })
  secretEncrypted!: string;

  /** SHA-256 de la clave en claro, solo para detectar duplicados al cargar stock. */
  @Column({ unique: true })
  secretHash!: string;

  @Column({ type: 'enum', enum: LicenseStatus, default: LicenseStatus.AVAILABLE })
  status!: LicenseStatus;

  @Column({ type: 'timestamptz', nullable: true })
  reservedUntil!: Date | null;

  @Column({ type: 'uuid', nullable: true, unique: true })
  orderItemId!: string | null;

  @OneToOne(() => OrderItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem?: OrderItem | null;

  @Column({ type: 'timestamptz', nullable: true })
  soldAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
