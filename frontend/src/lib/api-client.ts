export interface BackendUser {
  id: string;
  email: string;
  name: string | null;
  role: "CUSTOMER" | "ADMIN";
  phone: string | null;
  emailVerifiedAt: string | null;
}

export interface BackendTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface BackendAuthResult extends BackendTokenPair {
  id: string;
  user: BackendUser;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface BackendAuthPayload {
  accessToken: string;
  refreshToken: string;
  user: BackendUser;
}

async function postJson<T>(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  return { ok: true, data };
}

export async function login(email: string, password: string): Promise<BackendAuthResult | null> {
  const result = await postJson<BackendAuthPayload>("/auth/login", { email, password });
  if (!result.ok) {
    return null;
  }
  return { id: result.data.user.id, ...result.data };
}

export async function loginWithGoogle(idToken: string): Promise<BackendAuthResult | null> {
  const result = await postJson<BackendAuthPayload>("/auth/google", { idToken });
  if (!result.ok) {
    return null;
  }
  return { id: result.data.user.id, ...result.data };
}
