import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Plan } from './plan.entity';

/** Un lote es una compra de licencias a un proveedor; guarda el costo para calcular márgenes. */
@Entity('license_batches')
export class LicenseBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column({ type: 'varchar', nullable: true })
  supplier!: string | null;

  @Column({ type: 'int' })
  unitCostCents!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  purchasedAt!: Date;
}
