import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { login } from "@/lib/api-client";
import { jwtCallback } from "@/auth-callbacks";
import { handleSignOut } from "@/lib/auth-events";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }
        return login(email, password);
      },
    }),
    Google({
      authorization: { params: { prompt: "consent" } },
    }),
  ],
  callbacks: {
    jwt: jwtCallback,
    async session({ session, token }) {
      if (token.user) {
        session.user = token.user as typeof session.user;
      }
      session.accessToken = token.accessToken ?? "";
      if (token.error) {
        session.error = token.error;
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : undefined;
      await handleSignOut(token ?? undefined);
    },
  },
});
