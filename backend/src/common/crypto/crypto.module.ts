import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../core/config/env.validation';
import { CryptoService, LICENSE_ENC_KEY } from './crypto.service';

@Global()
@Module({
  providers: [
    {
      provide: LICENSE_ENC_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): string =>
        config.get('LICENSE_ENC_KEY', { infer: true }),
    },
    CryptoService,
  ],
  exports: [CryptoService],
})
export class CryptoModule {}
