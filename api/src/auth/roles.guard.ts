import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../database/enums';
import { ROLES_KEY } from './roles.decorator';

/** Usar junto a JwtAuthGuard: @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN) */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest<{ user?: { role: Role } }>();
    return !!user && required.includes(user.role);
  }
}
