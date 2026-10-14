import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca una ruta como accesible sin sesión (el JwtAuthGuard es global). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
