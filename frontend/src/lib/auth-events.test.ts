import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./api-client";
import { handleSignOut } from "./auth-events";

describe("handleSignOut", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("llama a /auth/logout cuando el token tiene accessToken y refreshToken", async () => {
    const logoutSpy = vi.spyOn(apiClient, "logout").mockResolvedValue(undefined);

    await handleSignOut({ accessToken: "a", refreshToken: "r" });

    expect(logoutSpy).toHaveBeenCalledWith("a", "r");
  });

  it("no llama a /auth/logout si falta accessToken o refreshToken", async () => {
    const logoutSpy = vi.spyOn(apiClient, "logout").mockResolvedValue(undefined);

    await handleSignOut(undefined);
    await handleSignOut({ accessToken: "a" });
    await handleSignOut({ refreshToken: "r" });

    expect(logoutSpy).not.toHaveBeenCalled();
  });
});
