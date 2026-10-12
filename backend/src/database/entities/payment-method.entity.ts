import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { type Currency } from '../currency';
import { PaymentMethodKind } from '../enums';

/** Método de pago administrable (D63). Los datos de cobro van en `instructions` (D65). */
@Entity('payment_methods')
@Check(
  'CHK_payment_methods_currencies',
  `cardinality("currencies") > 0 AND "currencies" <@ ARRAY['PEN', 'USD']::char(3)[]`,
)
@Check(
  'CHK_payment_methods_crypto_usd',
  `"kind" <> 'CRYPTO' OR "currencies" = ARRAY['USD']::char(3)[]`,
)
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'enum', enum: PaymentMethodKind })
  kind!: PaymentMethodKind;

  @Column({ type: 'char', length: 3, array: true })
  currencies!: Currency[];

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  instructions!: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
