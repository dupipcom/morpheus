import NextAuth from "next-auth"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import Auth0Provider from "next-auth/providers/auth0";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";

export const authOptions = {
  // Configure one or more authentication providers
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Auth0Provider({
    clientId: process.env.AUTH0_ID,
    clientSecret: process.env.AUTH0_SECRET,
    issuer: process.env.AUTH0_ISSUER
    })
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      return '/app/day'
    },
    session: async (session, user) => {
      return Promise.resolve(session);
    },
  },
  adapter: PrismaAdapter(prisma)
}
const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }