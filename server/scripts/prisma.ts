import { spawnSync } from 'node:child_process';
import { env } from '../src/config/env.js';

/**
 * Runs the Prisma CLI with the environment MuseMatch actually uses.
 *
 * The Prisma CLI only looks for a `.env` beside the schema, but this project
 * keeps one `.env` at the repo root for both workspaces. Rather than duplicate
 * DATABASE_URL into a second file that will eventually drift, every `db:*`
 * script goes through here.
 */
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: tsx scripts/prisma.ts <prisma args...>');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
});

process.exit(result.status ?? 1);
