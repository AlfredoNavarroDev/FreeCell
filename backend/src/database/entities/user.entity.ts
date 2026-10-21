import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../enums';

@Entity('users')
@Check(
  'CHK_users_credentials',
  `"passwordHash" IS NOT NULL OR "googleId" IS NOT NULL`,
)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Siempre en minúsculas y sin espacios (lo normaliza el servicio). */
  @Column({ type: 'varchar', length: 254, unique: true })
  email!: string;

  /** Vacío en cuentas solo-Google (D53). */
  @Column({ type: 'varchar', nullable: true, select: false })
  passwordHash!: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    unique: true,
    select: false,
  })
  googleId!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  name!: string | null;

  @Column({ type: 'enum', enum: Role, default: Role.CUSTOMER })
  role!: Role;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  /** Hash SHA-256 (hex) del token de verificación vigente; null si ya se verificó o nunca se emitió. */
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  emailVerificationTokenHash!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpiresAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
