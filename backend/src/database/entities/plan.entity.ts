import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LicenseKind } from '../enums';
import { Product } from './product.entity';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.plans)
  @JoinColumn({ name: 'productId' })
  product?: Product;

  /** Ej.: "Licencia 30 días" */
  @Column()
  name!: string;

  @Column({ type: 'enum', enum: LicenseKind, default: LicenseKind.NEW })
  kind!: LicenseKind;

  @Column({ type: 'int' })
  durationDays!: number;

  /** Precio en céntimos de sol para evitar errores de decimales. */
  @Column({ type: 'int' })
  priceCents!: number;

  /** Cuando el stock disponible baja de este número, se alerta al admin. */
  @Column({ type: 'int', default: 5 })
  lowStockThreshold!: number;

  @Column({ default: true })
  active!: boolean;
}
