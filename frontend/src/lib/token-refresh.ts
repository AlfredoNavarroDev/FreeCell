import { refreshTokens } from "./api-client";
import { decodeJwtExpiry } from "./jwt-exp";

export const DEFAULT_REFRESH_BUFFER_MS = 60_000;

export function needsRefresh(
  accessTokenExpiresAt: number | undefined,
  now: number,
  bufferMs: number = DEFAULT_REFRESH_BUFFER_MS,
): boolean {
  if (!accessTokenExpiresAt) {
    return false;
  }
  return now > accessTokenExpiresAt - bufferMs;
}

export interface RefreshableToken {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  error?: string;
}

export async function applyRefreshIfNeeded<T extends RefreshableToken>(
  token: T,
  now: number = Date.now(),
): Promise<T> {
  if (!token.refreshToken || !needsRefresh(token.accessTokenExpiresAt, now)) {
    return token;
  }
  const refreshed = await refreshTokens(token.refreshToken);
  if (!refreshed) {
    return { ...token, error: "RefreshError" } as T;
  }
  return {
    ...token,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    accessTokenExpiresAt: decodeJwtExpiry(refreshed.accessToken),
    error: undefined,
  } as T;
}
