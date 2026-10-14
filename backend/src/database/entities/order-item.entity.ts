import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Plan } from './plan.entity';

/** Una unidad comprada. Precio congelado al crear el pedido; hereda la moneda del pedido. */
@Entity('order_items')
@Check('CHK_order_items_price', `"unitPriceCents" > 0`)
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column({ type: 'int' })
  unitPriceCents!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
