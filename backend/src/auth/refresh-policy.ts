import { RefreshRevokeReason } from '../database/enums';

export type RefreshDecision = 'ROTATE' | 'GRACE' | 'REUSE' | 'INVALID';

/** Ventana en la que un token recién rotado puede volver a usarse (varias pestañas, D56). */
export const REFRESH_GRACE_MS = 30_000;

export interface RefreshTokenState {
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: RefreshRevokeReason | null;
}

/**
 * Decide qué hacer con un refresh token presentado.
 * `familyRevoked`: la familia ya tiene tokens revocados por LOGOUT o REUSE_DETECTED.
 */
export function decideRefresh(
  token: RefreshTokenState | null,
  familyRevoked: boolean,
  now: Date,
): RefreshDecision {
  if (!token) return 'INVALID';
  if (token.revokedAt === null) {
    return token.expiresAt <= now ? 'INVALID' : 'ROTATE';
  }
  const withinGrace =
    now.getTime() - token.revokedAt.getTime() < REFRESH_GRACE_MS;
  if (
    token.revokedReason === RefreshRevokeReason.ROTATED &&
    withinGrace &&
    !familyRevoked &&
    token.expiresAt > now
  ) {
    return 'GRACE';
  }
  return 'REUSE';
}
