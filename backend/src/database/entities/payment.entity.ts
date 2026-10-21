import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentStatus } from '../enums';
import { Order } from './order.entity';
import { PaymentMethod } from './payment-method.entity';
import { User } from './user.entity';

/** Comprobante y su revisión. La lógica llega en Sprint 2. */
@Entity('payments')
@Index(['status'])
@Unique('UQ_payments_method_operation', ['paymentMethodId', 'operationNumber'])
@Index('UQ_payments_one_pending_per_order', ['orderId'], {
  unique: true,
  where: `"status" = 'PENDING'`,
})
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  @Column({ type: 'uuid' })
  paymentMethodId!: string;

  @ManyToOne(() => PaymentMethod, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod?: PaymentMethod;

  /** Normalizado: sin espacios y en minúsculas (D64). */
  @Column({ type: 'varchar', length: 120 })
  operationNumber!: string;

  /** Llave del archivo en R2 (privado). */
  @Column({ type: 'varchar', length: 255 })
  proofKey!: string;

  @Column({ type: 'char', length: 64, unique: true })
  proofHash!: string;

  /** RF-COM-13/D43/D72: declaración de titularidad/autorización, reconfirmada en cada intento. */
  @Column({ type: 'timestamptz' })
  legalDeclarationAcceptedAt!: Date;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
