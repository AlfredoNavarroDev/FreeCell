import { CryptoService } from './crypto.service';

const KEY = Buffer.alloc(32, 9).toString('base64');

describe('CryptoService', () => {
  const crypto = new CryptoService(KEY);

  it('cifra y descifra (ida y vuelta)', () => {
    const payload = crypto.encrypt('ABCD-1234-EFGH');
    expect(payload).not.toContain('ABCD-1234-EFGH');
    expect(crypto.decrypt(payload)).toBe('ABCD-1234-EFGH');
  });

  it('usa un IV distinto en cada cifrado', () => {
    expect(crypto.encrypt('misma-clave')).not.toBe(
      crypto.encrypt('misma-clave'),
    );
  });

  it('falla si el contenido fue alterado', () => {
    const [iv, tag, ct] = crypto.encrypt('ABCD-1234').split(':');
    const tampered = Buffer.from(ct, 'base64');
    tampered[0] = tampered[0] ^ 0xff;
    expect(() =>
      crypto.decrypt(`${iv}:${tag}:${tampered.toString('base64')}`),
    ).toThrow();
  });

  it('falla con un formato inválido', () => {
    expect(() => crypto.decrypt('no-es-un-payload')).toThrow(
      'Formato de clave cifrada inválido',
    );
  });

  it('hash es determinista, de 64 caracteres hex, y depende de la llave', () => {
    const otra = new CryptoService(Buffer.alloc(32, 1).toString('base64'));
    expect(crypto.hash('ABCD')).toBe(crypto.hash('ABCD'));
    expect(crypto.hash('ABCD')).toMatch(/^[0-9a-f]{64}$/);
    expect(crypto.hash('ABCD')).not.toBe(otra.hash('ABCD'));
  });

  it('rechaza una llave que no mide 32 bytes', () => {
    expect(
      () => new CryptoService(Buffer.alloc(16).toString('base64')),
    ).toThrow(/32 bytes/);
  });
});
