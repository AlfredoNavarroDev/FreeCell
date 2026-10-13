import { Role } from '../../database/enums';

/** Lo que el JwtStrategy deja en request.user. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}
