import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { CURRENCY_COLUMN, currencyCheck, type Currency } from '../currency';
import { Plan } from './plan.entity';

/** Precio de un plan en una moneda. Un plan puede tener PEN, USD o ambas (D61). */
@Entity('plan_prices')
@Unique('UQ_plan_prices_plan_currency', ['planId', 'currency'])
@Check('CHK_plan_prices_currency', currencyCheck('currency'))
@Check('CHK_plan_prices_positive', `"priceCents" > 0`)
export class PlanPrice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, (plan) => plan.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column(CURRENCY_COLUMN)
  currency!: Currency;

  @Column({ type: 'int' })
  priceCents!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
