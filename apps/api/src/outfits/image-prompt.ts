import type { Item } from '../generated/prisma/client.js';
import type { ItemCategory } from '../generated/prisma/enums.js';

export type PromptItem = Pick<
  Item,
  | 'category'
  | 'subcategory'
  | 'primaryColor'
  | 'secondaryColor'
  | 'pattern'
  | 'fabric'
  | 'originalPublicId'
  | 'cleanPublicId'
> & { slot: ItemCategory };

// TDD 4.3 reference order: top or one-piece, bottom, shoes, outerwear, then accessories.
const REF_ORDER: ItemCategory[] = [
  'TOP',
  'ONE_PIECE',
  'BOTTOM',
  'SHOES',
  'OUTERWEAR',
  'ACCESSORY',
];
export const MAX_REFERENCES = 4;

export const byReferenceOrder = <T extends { slot: ItemCategory }>(
  items: T[],
) =>
  [...items].sort(
    (a, b) => REF_ORDER.indexOf(a.slot) - REF_ORDER.indexOf(b.slot),
  );

const PERSON: Record<string, string> = {
  Menswear: 'a man',
  Womenswear: 'a woman',
  Unisex: 'a person',
};

// "navy and white striped linen shirt (top)". No body traits (TDD 4.3, content filter).
const describe = (i: PromptItem) =>
  [
    i.secondaryColor
      ? `${i.primaryColor} and ${i.secondaryColor}`
      : i.primaryColor,
    i.pattern && i.pattern !== 'solid' ? i.pattern : null,
    i.fabric,
    i.subcategory ?? i.slot.toLowerCase().replace('_', '-'),
  ]
    .filter(Boolean)
    .join(' ') + ` (${i.slot.toLowerCase().replace('_', '-')})`;

// Items must already be in reference order; the first ones match input images 0 to 3.
export function outfitPrompt(
  items: PromptItem[],
  clothingCategory: string | undefined,
) {
  const person = PERSON[clothingCategory ?? ''] ?? 'a person';
  const refs = Math.min(items.length, MAX_REFERENCES);
  return `A full-body studio fashion photo of ${person} wearing this outfit: ${items.map(describe).join('; ')}. The first ${refs} reference images show ${refs === 1 ? 'the first garment' : `the first ${refs} garments`} in this order. Plain light background, soft even lighting, natural standing pose, the whole outfit visible.`;
}
