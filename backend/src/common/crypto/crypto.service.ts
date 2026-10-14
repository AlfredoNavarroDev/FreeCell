import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

export const LICENSE_ENC_KEY = Symbol('LICENSE_ENC_KEY');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Cifrado de claves de licencia (regla 4). AES-256-GCM detecta alteraciones;
 * el hash es HMAC con una llave derivada (D58) para que un dump de la DB no permita confirmar claves.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly hmacKey: Buffer;

  constructor(@Inject(LICENSE_ENC_KEY) base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) {
      throw new Error('LICENSE_ENC_KEY debe medir 32 bytes');
    }
    this.hmacKey = Buffer.from(
      hkdfSync('sha256', this.key, Buffer.alloc(0), 'secret-hash', 32),
    );
  }

  /** Devuelve `base64(iv):base64(tag):base64(ct)`. */
  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext]
      .map((part) => part.toString('base64'))
      .join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de clave cifrada inválido');
    }
    const [iv, tag, ciphertext] = parts.map((part) =>
      Buffer.from(part, 'base64'),
    );
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  /** HMAC-SHA256 en hex (64 caracteres). Sirve para detectar claves duplicadas al cargar lotes. */
  hash(plain: string): string {
    return createHmac('sha256', this.hmacKey)
      .update(plain, 'utf8')
      .digest('hex');
  }
}
