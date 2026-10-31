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

// Text and vision AI behind an interface, so the provider can change (NFR-009, TDD 4.1).
// rankOutfits is added with outfit generation (feature 10).
export interface TextAiProvider {
  tagClothing(image: { data: Buffer; mimeType: string }): Promise<ClothingTags>;
}

export const TEXT_AI = Symbol('TEXT_AI');
