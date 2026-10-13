import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../database/entities';
import { Role } from '../../database/enums';

/** Perfil público: nunca incluye passwordHash ni googleId. */
export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: Date, nullable: true }) emailVerifiedAt!: Date | null;

  static from(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }
}

export class TokenPairDto {
  @ApiProperty({ description: 'JWT de 15 minutos' }) accessToken!: string;
  @ApiProperty({ description: 'Token opaco de 30 días, rotativo' })
  refreshToken!: string;
}

export class AuthResponseDto extends TokenPairDto {
  @ApiProperty({ type: UserDto }) user!: UserDto;
}
