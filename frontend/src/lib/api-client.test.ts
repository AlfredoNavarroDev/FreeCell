import { afterEach, describe, expect, it, vi } from "vitest";
import { loginWithGoogle } from "./api-client";

describe("loginWithGoogle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve el resultado del backend cuando el id_token es válido", async () => {
    const backendUser = {
      id: "user-1",
      email: "cliente@freecell.test",
      name: "Cliente",
      role: "CUSTOMER" as const,
      phone: null,
      emailVerifiedAt: "2026-10-21T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ accessToken: "access-token", refreshToken: "refresh-token", user: backendUser }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginWithGoogle("id-token-valido");

    expect(result).toEqual({
      id: "user-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: backendUser,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/google"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idToken: "id-token-valido" }),
      }),
    );
  });

  it("devuelve null cuando el backend rechaza el id_token (401)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginWithGoogle("id-token-invalido");

    expect(result).toBeNull();
  });
});
