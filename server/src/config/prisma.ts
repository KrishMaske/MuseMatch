import { PrismaClient } from '@prisma/client';
import { isProduction } from './env.js';

/**
 * A single Prisma client for the process. In dev, `tsx watch` re-evaluates
 * modules on change, so the instance is cached on globalThis to avoid leaking
 * connection pools across reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
