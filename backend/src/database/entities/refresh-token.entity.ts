import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RefreshRevokeReason } from '../enums';
import { User } from './user.entity';

/** Refresh token opaco. Solo se guarda su HMAC, nunca el valor (D56). */
@Entity('refresh_tokens')
@Index(['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash!: string;

  /** Todos los tokens nacidos del mismo login comparten familia. */
  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'enum', enum: RefreshRevokeReason, nullable: true })
  revokedReason!: RefreshRevokeReason | null;

  @Column({ type: 'uuid', nullable: true })
  replacedById!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
