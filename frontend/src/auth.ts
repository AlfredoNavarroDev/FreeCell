import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { login } from "@/lib/api-client";
import { decodeJwtExpiry } from "@/lib/jwt-exp";

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
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpiresAt = user.accessToken ? decodeJwtExpiry(user.accessToken) : undefined;
        token.user = user.user;
        delete token.error;
        return token;
      }
      return token;
    },
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
});
