import { logout } from "./api-client";

interface SignOutToken {
  accessToken?: string;
  refreshToken?: string;
}

/** Revoca la sesión en el backend cuando NextAuth cierra sesión localmente (D56: libera la familia del refresh token). */
export async function handleSignOut(token: SignOutToken | undefined): Promise<void> {
  if (!token?.accessToken || !token?.refreshToken) {
    return;
  }
  await logout(token.accessToken, token.refreshToken).catch(() => {});
}
