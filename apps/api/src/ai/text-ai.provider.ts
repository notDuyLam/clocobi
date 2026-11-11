import type { Item, StyleProfile } from '../generated/prisma/client.js';
import type { ItemCategory } from '../generated/prisma/enums.js';

// Attributes proposed for one item photo. Values outside the lists are already null (API 4.4).
export interface ClothingTags {
  category: ItemCategory | null;
  subcategory: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  pattern: string | null;
  fabric: string | null;
  fit: string | null;
  seasons: string[];
  formality: string | null;
  aiNote: string | null;
}

export type ItemForAi = Pick<
  Item,
  | 'id'
  | 'category'
  | 'subcategory'
  | 'primaryColor'
  | 'secondaryColor'
  | 'pattern'
  | 'fabric'
  | 'fit'
  | 'seasons'
  | 'formality'
  | 'aiNote'
>;

// A rule-built core combination with its allowed optional items (TDD 4.2).
export interface Candidate {
  id: string;
  requiredItemIds: string[];
  outerwearOptionIds: string[];
  accessoryOptionIds: string[];
}

// Shapes from TDD 4.1. The profile has every field, optional ones included.
export interface RankInput {
  occasion: { name: string; description: string };
  profile: Omit<StyleProfile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
  items: ItemForAi[];
  candidates: Candidate[];
  // Per-request color preference (soft): groups or colors from GET /meta; empty = no preference.
  colors: { liked: string[]; avoid: string[] };
  count: number;
  maxAccessories: number;
}

// Not yet checked against the candidates: the caller repairs it (AD10).
export interface RankedOutfit {
  candidateId: string;
  outerwearId: string | null;
  accessoryIds: string[];
  stylingTips: string;
}

// Text and vision AI behind an interface, so the provider can change (NFR-009, TDD 4.1).
export interface TextAiProvider {
  tagClothing(image: { data: Buffer; mimeType: string }): Promise<ClothingTags>;
  rankOutfits(input: RankInput): Promise<RankedOutfit[]>;
}

export const TEXT_AI = Symbol('TEXT_AI');
