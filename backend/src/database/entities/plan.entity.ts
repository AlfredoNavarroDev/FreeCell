import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlanKind } from '../enums';
import { PlanPrice } from './plan-price.entity';
import { Product } from './product.entity';

/** Variante comprable. Los precios viven en plan_prices (D61). */
@Entity('plans')
@Check('CHK_plans_duration', `"durationDays" > 0`)
@Check('CHK_plans_low_stock', `"lowStockThreshold" >= 0`)
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.plans, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'enum', enum: PlanKind, default: PlanKind.NEW })
  kind!: PlanKind;

  @Column({ type: 'int' })
  durationDays!: number;

  @Column({ type: 'int', default: 5 })
  lowStockThreshold!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @OneToMany(() => PlanPrice, (price) => price.plan)
  prices?: PlanPrice[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
