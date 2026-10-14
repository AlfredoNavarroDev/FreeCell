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
    // Huérfano: esta fila concreta nunca se marcó revocada, pero su familia ya fue matada por
    // LOGOUT o REUSE_DETECTED (p. ej. el hijo de una rotación legítima que ganó la carrera de
    // commit contra un `revokeFamily`/barrido de reuso concurrente). No es un vencimiento normal:
    // la sesión ya está muerta, así que es INVALID, no ROTATE. `familyRevoked` solo se vuelve
    // true tras LOGOUT/REUSE_DETECTED — nunca durante una rotación legítima (ROTATED) — por lo
    // que esta rama no interfiere con la ventana de GRACE de abajo.
    if (familyRevoked) return 'INVALID';
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
