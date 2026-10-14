import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, In, IsNull, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { EnvironmentVariables } from '../core/config/env.validation';
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
   *
   * Mutex por familia (hallazgo de revisión de seguridad post-implementación): un `UPDATE`
   * masivo por `familyId` solo bloquea sobre las filas que YA EXISTÍAN cuando tomó su foto
   * (snapshot) — bajo READ COMMITTED, una fila nueva insertada por otra transacción concurrente
   * (el hijo de una rotación legítima en curso) es invisible para ese `UPDATE`, así haya esperado
   * un lock sobre una fila vieja de la misma familia. Sin este mutex, un reuso detectado podía
   * "revocar la familia" en auditoría mientras un token hijo recién emitido por una rotación
   * legítima paralela sobrevivía, vivo, hasta 30 días. `pg_advisory_xact_lock` serializa TODA
   * rotación/barrido de reuso de la misma familia dentro de la transacción: se libera solo al
   * confirmar o revertir, así que cuando una transacción lo obtiene, cualquier otra que ya haya
   * tocado esta familia ya quedó commiteada (sus filas nuevas son visibles) o todavía no empezó
   * (y al reintentar verá el estado ya revocado y no rotará).
   */
  async rotate(raw: string): Promise<{ userId: string; refreshToken: string }> {
    const outcome = await this.ds.transaction(async (m) => {
      const tokenHash = this.hash(raw);

      // Lectura sin lock: solo para ubicar la familia (es inmutable desde que la fila nace).
      // Si el token no existe no hay familia que proteger: INVALID de una.
      const existing = await m.findOne(RefreshToken, {
        where: { tokenHash },
        select: ['familyId'],
      });
      if (!existing) return null;

      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        existing.familyId,
      ]);

      const token = await m.findOne(RefreshToken, {
        where: { tokenHash },
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

  /**
   * Logout: revoca la familia del token, solo si pertenece al usuario.
   *
   * Mismo mutex que `rotate()` (ver el comentario ahí): sin `pg_advisory_xact_lock`, este `UPDATE`
   * masivo por `familyId` corre la misma carrera bajo `READ COMMITTED` — puede no ver la fila hija
   * que una rotación legítima concurrente está insertando, dejándola viva hasta 30 días pese al
   * logout. Se envuelve en una transacción propia para que el lock se libere al confirmar.
   */
  async revokeFamily(userId: string, raw: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const token = await m.findOne(RefreshToken, {
        where: { tokenHash: this.hash(raw), userId },
        select: ['familyId'],
      });
      if (!token) return;

      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        token.familyId,
      ]);

      await m.update(
        RefreshToken,
        { familyId: token.familyId, revokedAt: IsNull() },
        { revokedAt: new Date(), revokedReason: RefreshRevokeReason.LOGOUT },
      );
    });
  }
}
