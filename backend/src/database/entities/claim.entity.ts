import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ClaimStatus } from '../enums';
import { LicenseItem } from './license-item.entity';
import { User } from './user.entity';

@Entity('claims')
@Index(['status'])
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  licenseItemId!: string;

  @ManyToOne(() => LicenseItem)
  @JoinColumn({ name: 'licenseItemId' })
  licenseItem?: LicenseItem;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'enum', enum: ClaimStatus, default: ClaimStatus.OPEN })
  status!: ClaimStatus;

  @Column({ type: 'uuid', nullable: true })
  replacementLicenseId!: string | null;

  @ManyToOne(() => LicenseItem, { nullable: true })
  @JoinColumn({ name: 'replacementLicenseId' })
  replacementLicense?: LicenseItem | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedById!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
