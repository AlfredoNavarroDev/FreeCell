import { sanitizeMeta } from './sanitize-meta';

describe('sanitizeMeta', () => {
  it('elimina llaves sensibles en cualquier nivel', () => {
    expect(
      sanitizeMeta({
        email: 'a@b.pe',
        password: 'x',
        refreshToken: 'y',
        nested: { secretValue: 'z', ok: 1, apiKey: 'k' },
        items: [{ planId: 'p', licenseSecret: 's' }],
      }),
    ).toEqual({ email: 'a@b.pe', nested: { ok: 1 }, items: [{ planId: 'p' }] });
  });

  it('deja intactos los valores primitivos y las fechas', () => {
    const date = new Date('2026-10-06T00:00:00Z');
    expect(
      sanitizeMeta({ at: date, n: 1, s: 'x', b: true, nil: null }),
    ).toEqual({
      at: date,
      n: 1,
      s: 'x',
      b: true,
      nil: null,
    });
  });
});
