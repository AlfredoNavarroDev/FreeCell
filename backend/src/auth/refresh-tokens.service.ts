import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EnvironmentVariables } from '../core/config/env.validation';
import { RefreshToken } from '../database/entities';
import { RefreshRevokeReason } from '../database/enums';
import { decideRefresh } from './refresh-policy';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_SESSION = 'Sesión inválida, vuelve a iniciar sesión';

@Injectable()
export class RefreshTokensService {
  private readonly pepper: string;

  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.pepper = config.get('JWT_REFRESH_PEPPER', { infer: true });
  }

  private hash(raw: string): string {
    return createHmac('sha256', this.pepper).update(raw).digest('hex');
  }

  /** Crea un token nuevo. Sin `familyId` abre una familia (login o registro). */
  async issue(
    manager: EntityManager,
    userId: string,
    familyId: string = randomUUID(),
  ): Promise<{ id: string; raw: string }> {
    const raw = randomBytes(64).toString('base64url');
    const row = await manager.save(
      RefreshToken,
      manager.create(RefreshToken, {
        userId,
        familyId,
        tokenHash: this.hash(raw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      }),
    );
    return { id: row.id, raw };
  }

  /**
   * Rota un refresh token (D56). El FOR UPDATE serializa refresh simultáneos del mismo token:
   * el primero rota y el segundo entra por la ventana de gracia.
   */
  async rotate(raw: string): Promise<{ userId: string; refreshToken: string }> {
    const outcome = await this.ds.transaction(async (m) => {
      const token = await m.findOne(RefreshToken, {
        where: { tokenHash: this.hash(raw) },
        lock: { mode: 'pessimistic_write' },
      });
      const familyRevoked = token
        ? await m.exists(RefreshToken, {
            where: {
              familyId: token.familyId,
              revokedReason: In([
                RefreshRevokeReason.LOGOUT,
                RefreshRevokeReason.REUSE_DETECTED,
              ]),
            },
          })
        : false;
      const decision = decideRefresh(token, familyRevoked, new Date());

      if (decision === 'INVALID' || !token) return null;

      if (decision === 'REUSE') {
        // Posible robo: cae toda la familia. Se confirma la revocación y luego se responde 401.
        await m.update(
          RefreshToken,
          { familyId: token.familyId, revokedAt: IsNull() },
          {
            revokedAt: new Date(),
            revokedReason: RefreshRevokeReason.REUSE_DETECTED,
          },
        );
        await this.audit.log(m, {
          actorId: token.userId,
          action: 'auth.refresh_reuse_detected',
          entity: 'refresh_family',
          entityId: token.familyId,
          meta: { familyId: token.familyId },
        });
        return null;
      }

      const next = await this.issue(m, token.userId, token.familyId);
      if (decision === 'ROTATE') {
        await m.update(
          RefreshToken,
          { id: token.id },
          {
            revokedAt: new Date(),
            revokedReason: RefreshRevokeReason.ROTATED,
            replacedById: next.id,
          },
        );
      }
      return { userId: token.userId, refreshToken: next.raw };
    });

    if (!outcome) {
      throw new UnauthorizedException(INVALID_SESSION);
    }
    return outcome;
  }

  /** Logout: revoca la familia del token, solo si pertenece al usuario. */
  async revokeFamily(userId: string, raw: string): Promise<void> {
    const repo = this.ds.getRepository(RefreshToken);
    const token = await repo.findOne({
      where: { tokenHash: this.hash(raw), userId },
    });
    if (!token) return;
    await repo.update(
      { familyId: token.familyId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: RefreshRevokeReason.LOGOUT },
    );
  }
}
