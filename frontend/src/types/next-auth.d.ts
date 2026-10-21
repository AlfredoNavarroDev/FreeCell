import type { DefaultSession } from "next-auth";
import type { BackendUser } from "@/lib/api-client";

declare module "next-auth" {
  interface User {
    accessToken?: string;
    refreshToken?: string;
    user?: BackendUser;
  }

  interface Session {
    accessToken: string;
    error?: "RefreshError" | "GoogleAuthError";
    user: BackendUser & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    user?: BackendUser;
    error?: "RefreshError" | "GoogleAuthError";
  }
}

// next-auth/jwt solo re-exporta (`export *`) la interfaz `JWT` declarada en
// @auth/core/jwt — la fusión de declaraciones de TypeScript no atraviesa ese
// re-export, así que hay que aumentar también el módulo de origen para que
// `token.accessToken` etc. no colapsen a `unknown` en los callbacks de NextAuth.
declare module "@auth/core/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    user?: BackendUser;
    error?: "RefreshError" | "GoogleAuthError";
  }
}
