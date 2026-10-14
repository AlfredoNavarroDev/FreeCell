import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { User } from '../database/entities';
import { Role } from '../database/enums';
import { UsersService } from '../users/users.service';
import {
  AuthResponseDto,
  TokenPairDto,
  UserDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokensService } from './refresh-tokens.service';

const BCRYPT_COST = 12;
const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos';

@Injectable()
export class AuthService {
  /** Se compara contra este hash cuando el correo no existe, para igualar el tiempo de respuesta. */
  private readonly dummyHash = hash('free-cell-dummy-password', BCRYPT_COST);

  constructor(
    private readonly ds: DataSource,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly audit: AuditService,
  ) {}

  /** El rol siempre es CUSTOMER: ADMIN solo por seed (RF-AUT-04). */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = UsersService.normalizeEmail(dto.email);
    const passwordHash = await hash(dto.password, BCRYPT_COST);
    return this.ds.transaction(async (m) => {
      if (await m.exists(User, { where: { email } })) {
        throw new ConflictException('Ya existe una cuenta con ese correo');
      }
      const user = await m.save(
        User,
        m.create(User, {
          email,
          passwordHash,
          name: dto.name?.trim() || null,
          role: Role.CUSTOMER,
        }),
      );
      return this.buildAuthResponse(m, user);
    });
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const passwordOk = await compare(
      dto.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user || !user.passwordHash || !passwordOk) {
      await this.audit.log(this.ds.manager, {
        actorId: user?.id ?? null,
        action: 'auth.login_failed',
        entity: 'user',
        entityId: user?.id ?? 'unknown',
        meta: { email: UsersService.normalizeEmail(dto.email) },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.ds.transaction((m) => this.buildAuthResponse(m, user));
  }

  async refresh(rawRefreshToken: string): Promise<TokenPairDto> {
    const { userId, refreshToken } =
      await this.refreshTokens.rotate(rawRefreshToken);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException(
        'Sesión inválida, vuelve a iniciar sesión',
      );
    }
    return { accessToken: this.signAccess(user), refreshToken };
  }

  logout(userId: string, rawRefreshToken: string): Promise<void> {
    return this.refreshTokens.revokeFamily(userId, rawRefreshToken);
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Debes iniciar sesión');
    }
    return UserDto.from(user);
  }

  private signAccess(user: Pick<User, 'id' | 'role'>): string {
    return this.jwt.sign({ sub: user.id, role: user.role });
  }

  private async buildAuthResponse(
    manager: EntityManager,
    user: User,
  ): Promise<AuthResponseDto> {
    const { raw } = await this.refreshTokens.issue(manager, user.id);
    return {
      accessToken: this.signAccess(user),
      refreshToken: raw,
      user: UserDto.from(user),
    };
  }
}
