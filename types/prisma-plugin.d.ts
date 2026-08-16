// @prisma/nextjs-monorepo-workaround-plugin ships no TypeScript types
declare module '@prisma/nextjs-monorepo-workaround-plugin' {
  export class PrismaPlugin {
    constructor(options?: Record<string, unknown>)
    apply(compiler: unknown): void
  }
}
