import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { CryptoService } from './crypto.service';

const config = (key: string) => ({ getOrThrow: () => key }) as unknown as ConfigService;
const validKey = randomBytes(32).toString('base64');

describe('CryptoService', () => {
  const crypto = new CryptoService(config(validKey));

  it('cifra y descifra una clave', () => {
    const secret = 'ABCD-1234-EFGH-5678';
    const encrypted = crypto.encrypt(secret);
    expect(encrypted).not.toContain(secret);
    expect(crypto.decrypt(encrypted)).toBe(secret);
  });

  it('produce un cifrado distinto cada vez (IV aleatorio)', () => {
    expect(crypto.encrypt('x')).not.toBe(crypto.encrypt('x'));
  });

  it('detecta datos manipulados', () => {
    const [iv, tag, data] = crypto.encrypt('secreto').split('.');
    const tampered = [iv, tag, Buffer.from('otro').toString('base64')].join('.');
    expect(() => crypto.decrypt(tampered)).toThrow();
    expect(data).toBeDefined();
  });

  it('el hash ignora espacios y es estable', () => {
    expect(crypto.hash(' abc ')).toBe(crypto.hash('abc'));
  });

  it('rechaza una llave de longitud incorrecta', () => {
    expect(() => new CryptoService(config('corta'))).toThrow(/32 bytes/);
  });
});
