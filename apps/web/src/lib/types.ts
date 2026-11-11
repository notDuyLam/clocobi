// Response shapes from the API Design Document (sections 3 and 4).
export type Category =
  | 'TOP'
  | 'BOTTOM'
  | 'OUTERWEAR'
  | 'ONE_PIECE'
  | 'SHOES'
  | 'ACCESSORY';
export type ItemStatus = 'DRAFT' | 'COMPLETE';

export interface ItemAttrs {
  category: Category | null;
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

export interface Item extends ItemAttrs {
  id: string;
  status: ItemStatus;
  size: string | null;
  brand: string | null;
  notes: string | null;
  liked: boolean;
  originalUrl: string;
  cleanUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemSummary {
  id: string;
  category: Category;
  subcategory: string | null;
  primaryColor: string | null;
  originalUrl: string;
  cleanUrl: string | null;
}

export interface OutfitItem {
  id: string;
  slot: Category;
  optional: boolean;
  item: ItemSummary | null;
}

export interface Outfit {
  id: string;
  occasionId: string;
  occasionName: string;
  stylingTips: string;
  liked: boolean;
  imageUrl: string | null;
  isIncomplete: boolean;
  createdAt: string;
  updatedAt: string;
  items: OutfitItem[];
}

export interface Occasion {
  id: string;
  name: string;
  description: string;
  outfitCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  clothingCategory: string;
  heightCm: number;
  weightKg: number;
  climate: string;
  build: string | null;
  skinUndertone: string | null;
  preferredStyles: string[];
  fitPreference: string | null;
  freeNotes: string | null;
}

export interface Meta {
  categories: Category[];
  seasons: string[];
  formality: string[];
  fit: string[];
  pattern: string[];
  colors: string[];
  colorGroups: string[];
  clothingCategory: string[];
  build: string[];
  skinUndertone: string[];
  fitPreference: string[];
}

export interface Notice {
  code: 'NO_NEW_COMBINATIONS' | 'FEWER_THAN_REQUESTED' | 'AI_RETURNED_FEWER';
  message: string;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  TOP: 'Tops',
  BOTTOM: 'Bottoms',
  OUTERWEAR: 'Outerwear',
  ONE_PIECE: 'One-piece',
  SHOES: 'Shoes',
  ACCESSORY: 'Accessories',
};
export const SLOT_LABEL: Record<Category, string> = {
  TOP: 'Top',
  BOTTOM: 'Bottom',
  OUTERWEAR: 'Outerwear',
  ONE_PIECE: 'One-piece',
  SHOES: 'Shoes',
  ACCESSORY: 'Accessory',
};

export const itemName = (i: {
  primaryColor: string | null;
  subcategory: string | null;
  category: Category | null;
}) =>
  [i.primaryColor, i.subcategory ?? (i.category && SLOT_LABEL[i.category].toLowerCase())]
    .filter(Boolean)
    .join(' ') || 'Untitled item';
