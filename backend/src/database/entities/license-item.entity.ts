import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LicenseStatus } from '../enums';
import { LicenseBatch } from './license-batch.entity';
import { OrderItem } from './order-item.entity';
import { Plan } from './plan.entity';

/** Una licencia vendible. La clave va cifrada y nunca se selecciona por defecto. */
@Entity('license_items')
@Index(['planId', 'status'])
@Index('UQ_license_items_active_order_item', ['orderItemId'], {
  unique: true,
  where: `"status" IN ('RESERVED', 'SOLD')`,
})
@Check(
  'CHK_license_items_state',
  `("status" = 'AVAILABLE' AND "orderItemId" IS NULL AND "reservedUntil" IS NULL) OR ("status" IN ('RESERVED', 'SOLD') AND "orderItemId" IS NOT NULL) OR "status" = 'VOID'`,
)
export class LicenseItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column({ type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => LicenseBatch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'batchId' })
  batch?: LicenseBatch;

  /** AES-256-GCM: base64(iv):base64(tag):base64(ct). */
  @Column({ type: 'text', select: false })
  secretEncrypted!: string;

  /** HMAC-SHA256 de la clave en claro (D58), para detectar duplicados. */
  @Column({ type: 'char', length: 64, unique: true, select: false })
  secretHash!: string;

  @Column({
    type: 'enum',
    enum: LicenseStatus,
    default: LicenseStatus.AVAILABLE,
  })
  status!: LicenseStatus;

  @Column({ type: 'timestamptz', nullable: true })
  reservedUntil!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  orderItemId!: string | null;

  @ManyToOne(() => OrderItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem?: OrderItem | null;

  @Column({ type: 'timestamptz', nullable: true })
  soldAt!: Date | null;

  /** Licencia original a la que reemplaza tras un reclamo (D28). */
  @Column({ type: 'uuid', nullable: true })
  replacesId!: string | null;

  @ManyToOne(() => LicenseItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'replacesId' })
  replaces?: LicenseItem | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
