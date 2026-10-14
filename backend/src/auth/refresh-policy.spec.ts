import { RefreshRevokeReason } from '../database/enums';
import { decideRefresh, REFRESH_GRACE_MS } from './refresh-policy';

const now = new Date('2026-10-06T12:00:00Z');
const future = new Date(now.getTime() + 86_400_000);
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('decideRefresh', () => {
  it('INVALID si el token no existe', () => {
    expect(decideRefresh(null, false, now)).toBe('INVALID');
  });

  it('ROTATE si está vigente y no revocado', () => {
    expect(
      decideRefresh(
        { expiresAt: future, revokedAt: null, revokedReason: null },
        false,
        now,
      ),
    ).toBe('ROTATE');
  });

  it('INVALID si venció sin haber sido revocado', () => {
    expect(
      decideRefresh(
        { expiresAt: ago(1), revokedAt: null, revokedReason: null },
        false,
        now,
      ),
    ).toBe('INVALID');
  });

  it('INVALID (huérfano) si no está revocado pero la familia ya fue matada', () => {
    expect(
      decideRefresh(
        { expiresAt: future, revokedAt: null, revokedReason: null },
        true,
        now,
      ),
    ).toBe('INVALID');
  });

  it('GRACE si se rotó hace menos de 30 s y la familia sigue activa', () => {
    const token = {
      expiresAt: future,
      revokedAt: ago(REFRESH_GRACE_MS - 1_000),
      revokedReason: RefreshRevokeReason.ROTATED,
    };
    expect(decideRefresh(token, false, now)).toBe('GRACE');
  });

  it('REUSE si se rotó hace más de 30 s', () => {
    const token = {
      expiresAt: future,
      revokedAt: ago(REFRESH_GRACE_MS + 1_000),
      revokedReason: RefreshRevokeReason.ROTATED,
    };
    expect(decideRefresh(token, false, now)).toBe('REUSE');
  });

  it('REUSE dentro de la ventana si la familia ya fue revocada', () => {
    const token = {
      expiresAt: future,
      revokedAt: ago(1_000),
      revokedReason: RefreshRevokeReason.ROTATED,
    };
    expect(decideRefresh(token, true, now)).toBe('REUSE');
  });

  it('REUSE si fue revocado por logout o por reuso', () => {
    for (const reason of [
      RefreshRevokeReason.LOGOUT,
      RefreshRevokeReason.REUSE_DETECTED,
    ]) {
      expect(
        decideRefresh(
          { expiresAt: future, revokedAt: ago(1_000), revokedReason: reason },
          false,
          now,
        ),
      ).toBe('REUSE');
    }
  });
});
