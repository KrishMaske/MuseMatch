import type { Prisma, User } from '@prisma/client';
import { DEFAULT_EXPLORATION_SCORE, type UserProfile } from '@musematch/shared';
import { prisma } from '../config/prisma.js';
import { createEmptyWeights } from '../utils/weights.js';
import type { AuthenticatedIdentity } from './authService.js';

/**
 * Maps a verified Supabase identity onto the local user record.
 *
 * The first authenticated request from a new Supabase user creates their local
 * row and an empty preference profile, so nothing downstream has to handle a
 * user that exists in Auth but not in the application database.
 */
export const userService = {
  async findOrCreate(identity: AuthenticatedIdentity): Promise<User> {
    const existing = await prisma.user.findUnique({
      where: { supabaseUserId: identity.supabaseUserId },
    });

    if (existing) {
      // Keep the cached email in step with Auth without a write on every hit.
      if (identity.email && identity.email !== existing.email) {
        return prisma.user.update({
          where: { id: existing.id },
          data: { email: identity.email },
        });
      }
      return existing;
    }

    return prisma.user.create({
      data: {
        supabaseUserId: identity.supabaseUserId,
        email: identity.email,
        preferenceProfile: {
          create: {
            explicitPreferences: createEmptyWeights() as unknown as Prisma.InputJsonValue,
            behavioralPreferences: createEmptyWeights() as unknown as Prisma.InputJsonValue,
            explorationScore: DEFAULT_EXPLORATION_SCORE,
          },
        },
      },
    });
  },

  async update(
    userId: string,
    data: { displayName?: string; avatarUrl?: string | null },
  ): Promise<User> {
    return prisma.user.update({ where: { id: userId }, data });
  },

  toProfile(user: User): UserProfile {
    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      email: user.email,
      onboardingCompleted: user.onboardingCompleted,
      createdAt: user.createdAt.toISOString(),
    };
  },
};
