import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CURRENCY_COLUMN, currencyCheck, type Currency } from '../currency';
import { OrderStatus } from '../enums';
import { OrderItem } from './order-item.entity';
import { User } from './user.entity';

@Entity('orders')
@Index(['status', 'expiresAt'])
@Check('CHK_orders_currency', currencyCheck('currency'))
@Check('CHK_orders_total', `"totalCents" >= 0`)
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Número legible (#1001, #1002…). La secuencia arranca en 1001 (migración DatabaseLogic). */
  @Column({ type: 'int', unique: true })
  @Generated('increment')
  orderNumber!: number;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING_PAYMENT,
  })
  status!: OrderStatus;

  @Column({ type: 'int' })
  totalCents!: number;

  /** La elige el cliente; todas las líneas se cobran en esta moneda (D61). */
  @Column(CURRENCY_COLUMN)
  currency!: Currency;

  @Column({ type: 'varchar', length: 120, nullable: true })
  toolUsername!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 40, nullable: true })
  cancelReason!: string | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items?: OrderItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
