import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const toBool =
  (fallback: boolean) =>
  ({ value }: { value: unknown }): boolean =>
    value === undefined || value === ''
      ? fallback
      : value === true || value === 'true';

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  /** `all` corre los processors dentro de la API (solo desarrollo). En producción, por defecto `api`. */
  @IsIn(['api', 'worker', 'all'])
  APP_ROLE!: 'api' | 'worker' | 'all';

  @Transform(({ value }) =>
    value === undefined || value === '' ? 3000 : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @Transform(toBool(false))
  @IsBoolean()
  DB_SSL = false;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_PEPPER!: string;

  /** 32 bytes en base64. Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" */
  @IsString()
  LICENSE_ENC_KEY!: string;

  /** Orígenes permitidos separados por comas. */
  @IsString()
  CORS_ORIGIN = 'http://localhost:3001';

  @Transform(toBool(true))
  @IsBoolean()
  THROTTLE_ENABLED = true;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL = 'info';

  @IsOptional()
  @IsEmail()
  ADMIN_EMAIL?: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  ADMIN_PASSWORD?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  if (env.APP_ROLE === undefined) {
    env.APP_ROLE = env.NODE_ENV === 'production' ? 'api' : 'all';
  }

  const errors = validateSync(env, { skipMissingProperties: false });
  const problems = errors.map(
    (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
  );

  if (
    typeof env.LICENSE_ENC_KEY === 'string' &&
    Buffer.from(env.LICENSE_ENC_KEY, 'base64').length !== 32
  ) {
    problems.push('LICENSE_ENC_KEY: debe ser base64 de exactamente 32 bytes');
  }

  if (problems.length > 0) {
    throw new Error(`Configuración inválida:\n${problems.join('\n')}`);
  }
  return env;
}
