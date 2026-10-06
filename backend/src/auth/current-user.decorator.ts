import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../database/enums';

export interface AuthUser {
  id: string;
  role: Role;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
