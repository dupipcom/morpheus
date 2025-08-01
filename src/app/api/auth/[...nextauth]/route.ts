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
  events: { 
    async signIn(message) {
      if(message.isNewUser) {
        console.log({ message })
        await prisma.user.update({
          data: {
              entries: {},
              settings: {},
              analysis: {}
          },
          where: { name: message.user.name }
        })
      }
    },
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      return '/app/day'
    },
    async session({ session, user }) {
      return {...session, user: {...session.user, ...user }}
    }
  },
  adapter: PrismaAdapter(prisma)
}
const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }