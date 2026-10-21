import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { EnvironmentVariables } from '../core/config/env.validation';
import { User } from '../database/entities';
import { Role } from '../database/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import {
  AuthResponseDto,
  TokenPairDto,
  UserDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RefreshTokensService } from './refresh-tokens.service';

const BCRYPT_COST = 12;
const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos';
const EMAIL_VERIFICATION_TTL_HOURS = 24;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Se compara contra este hash cuando el correo no existe, para igualar el tiempo de respuesta. */
  private readonly dummyHash = hash('free-cell-dummy-password', BCRYPT_COST);

  constructor(
    private readonly ds: DataSource,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** El rol siempre es CUSTOMER: ADMIN solo por seed (RF-AUT-04). */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = UsersService.normalizeEmail(dto.email);
    const passwordHash = await hash(dto.password, BCRYPT_COST);
    const { response, user, verificationToken } = await this.ds.transaction(
      async (m) => {
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
        const verificationToken = await this.issueEmailVerification(m, user);
        const response = await this.buildAuthResponse(m, user);
        return { response, user, verificationToken };
      },
    );
    await this.sendVerificationEmail(user, verificationToken);
    return response;
  }

  /** RF-AUT-07: confirma el correo con el token de un solo uso (hash, nunca en claro). */
  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    await this.ds.transaction(async (m) => {
      const user = await m
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.emailVerificationTokenHash')
        .where('user.emailVerificationTokenHash = :tokenHash', { tokenHash })
        .getOne();
      if (
        !user ||
        !user.emailVerificationExpiresAt ||
        user.emailVerificationExpiresAt.getTime() < Date.now()
      ) {
        throw new BadRequestException(
          'El enlace de verificación es inválido o venció',
        );
      }
      await m.update(
        User,
        { id: user.id },
        {
          emailVerifiedAt: new Date(),
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        },
      );
      await this.audit.log(m, {
        actorId: user.id,
        action: 'user.email_verified',
        entity: 'user',
        entityId: user.id,
      });
    });
  }

  /** Reemite el token si el correo todavía no está verificado. */
  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Debes iniciar sesión');
    }
    if (user.emailVerifiedAt) {
      throw new ConflictException('Tu correo ya está verificado');
    }
    const token = await this.ds.transaction((m) =>
      this.issueEmailVerification(m, user),
    );
    await this.sendVerificationEmail(user, token);
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

  private async issueEmailVerification(
    manager: EntityManager,
    user: User,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await manager.update(
      User,
      { id: user.id },
      {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: new Date(
          Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 3_600_000,
        ),
      },
    );
    return token;
  }

  /** Si falla el envío, el registro/reenvío no se cae: el cliente puede pedir otro con resend-verification. */
  private async sendVerificationEmail(
    user: User,
    token: string,
  ): Promise<void> {
    try {
      const frontendUrl = this.config.get('CORS_ORIGIN', { infer: true });
      await this.notifications.enqueue({
        key: `email-verification-${user.id}-${token.slice(0, 8)}`,
        template: 'email-verification',
        recipient: user.email,
        data: { verifyUrl: `${frontendUrl}/verify-email?token=${token}` },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        { err, userId: user.id },
        'No se pudo encolar el correo de verificación',
      );
    }
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
