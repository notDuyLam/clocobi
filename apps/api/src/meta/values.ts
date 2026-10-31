import { ItemCategory } from '../generated/prisma/enums.js';

// Single source for the value lists (API section 5): forms, validation and AI prompts use these.
export const CATEGORIES = Object.values(ItemCategory);
export const SEASONS = ['hot', 'mild', 'cold'] as const;
export const FORMALITY = [
  'casual',
  'smart casual',
  'business',
  'formal',
] as const;
export const FIT = ['slim', 'regular', 'loose'] as const;
export const PATTERN = [
  'solid',
  'striped',
  'checked',
  'printed',
  'other',
] as const;
export const COLORS = [
  'black',
  'white',
  'gray',
  'beige',
  'brown',
  'navy',
  'blue',
  'green',
  'olive',
  'red',
  'burgundy',
  'pink',
  'orange',
  'yellow',
  'purple',
  'cream',
] as const;
export const CLOTHING_CATEGORY = ['Menswear', 'Womenswear', 'Unisex'] as const;
export const BUILD = ['Slim', 'Average', 'Broad'] as const;
export const SKIN_UNDERTONE = ['Warm', 'Cool', 'Neutral'] as const;
export const FIT_PREFERENCE = ['Loose', 'Regular', 'Slim'] as const;
