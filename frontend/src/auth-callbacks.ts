import type { Account, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { loginWithGoogle } from "@/lib/api-client";
import { decodeJwtExpiry } from "@/lib/jwt-exp";
import { applyRefreshIfNeeded } from "@/lib/token-refresh";

/**
 * Callback `jwt` de NextAuth, extraído a un módulo propio (sin importar `next-auth` en
 * tiempo de ejecución, solo tipos) para poder probarlo con vitest sin arrastrar el runtime
 * de next-auth/Next.js, que no resuelve bien fuera del bundler de Next.
 *
 * Importante: NextAuth siempre entrega un `user` truthy en un sign-in exitoso, también con
 * proveedores OAuth (el perfil mapeado del proveedor, sin adapter de DB) — por eso NO se puede
 * ramificar con `if (user)` a solas; hay que mirar `account?.provider` para separar el camino
 * de credentials del de Google.
 */
export async function jwtCallback({
  token,
  user,
  account,
}: {
  token: JWT;
  user?: User;
  account?: Account | null;
}): Promise<JWT> {
  if (account?.provider === "credentials" && user) {
    token.accessToken = user.accessToken;
    token.refreshToken = user.refreshToken;
    token.accessTokenExpiresAt = user.accessToken ? decodeJwtExpiry(user.accessToken) : undefined;
    token.user = user.user;
    delete token.error;
    return token;
  }

  if (account?.provider === "google" && account.id_token) {
    const result = await loginWithGoogle(account.id_token);
    if (!result) {
      return { ...token, error: "GoogleAuthError" };
    }
    token.accessToken = result.accessToken;
    token.refreshToken = result.refreshToken;
    token.accessTokenExpiresAt = decodeJwtExpiry(result.accessToken);
    token.user = result.user;
    delete token.error;
    return token;
  }

  return applyRefreshIfNeeded(token);
}
