import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CURRENCY_COLUMN, currencyCheck, type Currency } from '../currency';
import { Plan } from './plan.entity';

/** Compra a un proveedor. El costo se guarda como se pagó, con la tasa real (D62). */
@Entity('license_batches')
@Check('CHK_license_batches_currency', currencyCheck('costCurrency'))
@Check('CHK_license_batches_cost', `"unitCostCents" >= 0`)
@Check(
  'CHK_license_batches_fx',
  `("costCurrency" = 'USD' AND "fxRatePen" IS NOT NULL AND "fxRatePen" > 0) OR ("costCurrency" = 'PEN' AND "fxRatePen" IS NULL)`,
)
export class LicenseBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column({ type: 'varchar', length: 120, nullable: true })
  supplier!: string | null;

  @Column({ type: 'int' })
  unitCostCents!: number;

  @Column({ ...CURRENCY_COLUMN, default: 'USD' })
  costCurrency!: Currency;

  /** Soles pagados por cada dólar/USDT de este lote. Postgres numeric llega como string. */
  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  fxRatePen!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  purchasedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
