import { afterEach, describe, expect, it, vi } from "vitest";
import type { JWT } from "next-auth/jwt";

const loginWithGoogleMock = vi.fn();

vi.mock("@/lib/api-client", () => ({
  loginWithGoogle: loginWithGoogleMock,
}));

/** JWT con `exp` válido para que decodeJwtExpiry() no lance. */
function makeAccessToken(expSeconds = 1_800_000_000): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ exp: expSeconds, sub: "user-1" })).toString("base64url");
  return `${header}.${body}.`;
}

describe("jwtCallback", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("toma el camino de Google (no el de credentials) para un sign-in de Google, aunque `user` sea truthy", async () => {
    // Regresión: next-auth siempre entrega un `user` truthy en jwt() en un sign-in exitoso,
    // también con proveedores OAuth (perfil mapeado del proveedor, sin adapter de DB). Si el
    // callback ramificara con `if (user)` a solas, este caso entraría por el camino de
    // credentials y nunca llamaría a loginWithGoogle — este test lo habría detectado.
    const { jwtCallback } = await import("./auth-callbacks");

    const backendUser = {
      id: "user-1",
      email: "cliente@freecell.test",
      name: "Cliente",
      role: "CUSTOMER" as const,
      phone: null,
      emailVerifiedAt: "2026-10-21T00:00:00.000Z",
    };
    const accessToken = makeAccessToken();
    loginWithGoogleMock.mockResolvedValue({
      id: "user-1",
      accessToken,
      refreshToken: "google-refresh-token",
      user: backendUser,
    });

    // Perfil de OAuth mapeado por next-auth: truthy, pero sin accessToken/refreshToken propios.
    const oauthProfileUser = {
      id: "google-sub-123",
      name: "Cliente",
      email: "cliente@freecell.test",
      image: "https://example.com/avatar.png",
    };

    const token = await jwtCallback({
      token: {} as JWT,
      user: oauthProfileUser,
      account: { provider: "google", type: "oidc", id_token: "fake-google-id-token" } as never,
    });

    expect(loginWithGoogleMock).toHaveBeenCalledWith("fake-google-id-token");

    // El token debe reflejar el resultado del backend para Google, no el `user` de OAuth.
    expect(token.accessToken).toBe(accessToken);
    expect(token.refreshToken).toBe("google-refresh-token");
    expect(token.user).toEqual(backendUser);
  });

  it("toma el camino de credentials cuando account.provider es 'credentials'", async () => {
    const { jwtCallback } = await import("./auth-callbacks");

    const backendUser = {
      id: "user-2",
      email: "cliente2@freecell.test",
      name: "Cliente 2",
      role: "CUSTOMER" as const,
      phone: null,
      emailVerifiedAt: null,
    };

    const accessToken = makeAccessToken();
    const credentialsUser = {
      id: "user-2",
      accessToken,
      refreshToken: "credentials-refresh-token",
      user: backendUser,
    };

    const token = await jwtCallback({
      token: {} as JWT,
      user: credentialsUser,
      account: { provider: "credentials", type: "credentials" } as never,
    });

    expect(loginWithGoogleMock).not.toHaveBeenCalled();
    expect(token.accessToken).toBe(accessToken);
    expect(token.refreshToken).toBe("credentials-refresh-token");
    expect(token.user).toEqual(backendUser);
  });

  it("devuelve el token con error cuando el backend rechaza el id_token de Google", async () => {
    const { jwtCallback } = await import("./auth-callbacks");

    loginWithGoogleMock.mockResolvedValue(null);

    const token = await jwtCallback({
      token: {} as JWT,
      user: { id: "google-sub-123", name: "Cliente", email: "cliente@freecell.test" },
      account: { provider: "google", type: "oidc", id_token: "fake-google-id-token" } as never,
    });

    expect(token.error).toBe("GoogleAuthError");
  });

  it("no toca el token cuando no hay account reconocida (sin credentials ni Google)", async () => {
    const { jwtCallback } = await import("./auth-callbacks");

    const token = await jwtCallback({ token: { foo: "bar" } as unknown as JWT, user: undefined, account: null });

    expect(loginWithGoogleMock).not.toHaveBeenCalled();
    expect(token).toEqual({ foo: "bar" });
  });
});
