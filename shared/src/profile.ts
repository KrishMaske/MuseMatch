import type { Era, Experience, Medium, Style, Theme } from './preferences.js';

export interface UserProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string | null;
}

/** One row of the taste dashboard: a preference key with its blended weight. */
export interface TasteRanking<K extends string> {
  key: K;
  label: string;
  weight: number;
}

export interface ActivitySummary {
  artworksViewed: number;
  artworksSaved: number;
  artworksLiked: number;
  collectionsCreated: number;
  visitsPlanned: number;
}

export interface ArtPersonality {
  title: string;
  summary: string;
  /** The dimension values that produced the title, for display as chips. */
  traits: string[];
}

export interface TasteDashboard {
  mediums: TasteRanking<Medium>[];
  eras: TasteRanking<Era>[];
  themes: TasteRanking<Theme>[];
  styles: TasteRanking<Style>[];
  experiences: TasteRanking<Experience>[];
  explorationScore: number;
  activity: ActivitySummary;
  personality: ArtPersonality;
  onboardingCompleted: boolean;
}
