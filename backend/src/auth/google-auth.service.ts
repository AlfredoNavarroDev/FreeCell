import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { TokenPayload } from 'google-auth-library';
import type { EnvironmentVariables } from '../core/config/env.validation';

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Verificación real contra las claves públicas de Google (RF-AUT-10). No hay forma de probar
 * esto con credenciales ficticias como `storage` (la firma SigV4 es local; esta no): en los e2e
 * se reemplaza por `overrideProvider(GoogleAuthService)` vía el hook `configure` de `createTestApp`.
 */
@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
    this.client = new OAuth2Client(this.clientId);
  }

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token de Google inválido');
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Token de Google inválido');
    }
    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? null,
    };
  }
}
