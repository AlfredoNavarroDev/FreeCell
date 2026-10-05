import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Cifra las claves de licencia con AES-256-GCM antes de guardarlas.
 * La llave vive en la variable de entorno LICENSE_ENC_KEY, nunca en la base de datos.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const key = Buffer.from(config.getOrThrow<string>('LICENSE_ENC_KEY'), 'base64');
    if (key.length !== 32) {
      throw new Error('LICENSE_ENC_KEY debe ser de 32 bytes en base64 (openssl rand -base64 32)');
    }
    this.key = key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, data].map((b) => b.toString('base64')).join('.');
  }

  decrypt(payload: string): string {
    const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  /** Huella para detectar duplicados sin guardar la clave en claro. */
  hash(plain: string): string {
    return createHash('sha256').update(plain.trim()).digest('hex');
  }
}
