import NextAuth from "next-auth"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import GithubProvider from "next-auth/providers/github"
import EmailProvider from "next-auth/providers/email";
import prisma from "@/lib/prisma";

export const authOptions = {
  // Configure one or more authentication providers
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
    EmailProvider({
    server: process.env.EMAIL_SERVER,
    from: process.env.EMAIL_FROM
  }),
    // ...add more providers here
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