import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClaimStatus } from '../enums';
import { LicenseItem } from './license-item.entity';
import { Order } from './order.entity';
import { User } from './user.entity';

@Entity('claims')
@Index(['status'])
@Index('UQ_claims_one_open_per_order', ['orderId'], {
  unique: true,
  where: `"status" = 'OPEN'`,
})
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  @Column({ type: 'uuid' })
  licenseItemId!: string;

  @ManyToOne(() => LicenseItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'licenseItemId' })
  licenseItem?: LicenseItem;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'enum', enum: ClaimStatus, default: ClaimStatus.OPEN })
  status!: ClaimStatus;

  @Column({ type: 'uuid', nullable: true })
  replacementLicenseId!: string | null;

  @ManyToOne(() => LicenseItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'replacementLicenseId' })
  replacementLicense?: LicenseItem | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
