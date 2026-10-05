import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { OrderStatus } from '../enums';
import { OrderItem } from './order-item.entity';
import { Payment } from './payment.entity';
import { User } from './user.entity';

@Entity('orders')
@Index(['status', 'expiresAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  status!: OrderStatus;

  @Column({ type: 'int' })
  totalCents!: number;

  /** Usuario en la herramienta, solo si el producto se activa sobre la cuenta del cliente. */
  @Column({ type: 'varchar', nullable: true })
  toolUsername!: string | null;

  /** Hasta cuándo se mantiene la reserva de las licencias. */
  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items?: OrderItem[];

  @OneToMany(() => Payment, (payment) => payment.order)
  payments?: Payment[];
}
