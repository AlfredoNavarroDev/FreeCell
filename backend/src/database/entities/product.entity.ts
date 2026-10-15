import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { Plan } from './plan.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 140, unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  whatIncluded!: string | null;

  @Column({ type: 'text', nullable: true })
  compatibility!: string | null;

  @Column({ type: 'text', nullable: true })
  activationGuide!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  faq!: { question: string; answer: string }[] | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'uuid', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: Category | null;

  /** La licencia se aplica sobre la cuenta del cliente en la herramienta (D14). */
  @Column({ type: 'boolean', default: false })
  requiresToolUsername!: boolean;

  @OneToMany(() => Plan, (plan) => plan.product)
  plans?: Plan[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
