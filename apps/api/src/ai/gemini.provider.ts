import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { env } from '../common/env.js';
import * as v from '../meta/values.js';
import { generateJson } from './gemini.client.js';
import type {
  ClothingTags,
  RankedOutfit,
  RankInput,
  TextAiProvider,
} from './text-ai.provider.js';

const TAG_TIMEOUT_MS = 30_000;
const RANK_TIMEOUT_MS = 90_000;

const oneOf = (values: readonly string[]) => ({ type: 'string', enum: values });
const TAG_SCHEMA = {
  type: 'object',
  properties: {
    category: oneOf(v.CATEGORIES),
    subcategory: { type: 'string' },
    primaryColor: oneOf(v.COLORS),
    secondaryColor: { ...oneOf(v.COLORS), nullable: true },
    pattern: oneOf(v.PATTERN),
    fabric: { type: 'string' },
    fit: oneOf(v.FIT),
    seasons: { type: 'array', items: oneOf(v.SEASONS) },
    formality: oneOf(v.FORMALITY),
    aiNote: { type: 'string' },
  },
  required: [
    'category',
    'subcategory',
    'primaryColor',
    'secondaryColor',
    'pattern',
    'fabric',
    'fit',
    'seasons',
    'formality',
    'aiNote',
  ],
};

const TAG_PROMPT = `Describe the main clothing item in this photo for a wardrobe app. Ignore the background, hangers, people and any other garments.
subcategory and fabric: short lowercase English (for example "t-shirt", "linen"); guess the most likely fabric.
secondaryColor: null if the item is one color. seasons: every weather the item suits (hot, mild, cold).
aiNote: one sentence, at most 300 characters, useful for choosing outfits (style, weight, what it pairs with). Do not mention the photo.`;

const pick = <T extends string>(values: readonly T[], x: unknown) =>
  values.includes(x as T) ? (x as T) : null;
const text = (x: unknown, max: number, lower = false) => {
  if (typeof x !== 'string' || !x.trim()) return null;
  return (lower ? x.trim().toLowerCase() : x.trim()).slice(0, max);
};

// Values outside the lists become null and bad seasons are dropped, never an error (API 4.4).
export function toClothingTags(raw: unknown): ClothingTags {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ApiError(
      502,
      'AI_FAILED',
      'The AI service failed. Please try again.',
    );
  }
  const r = raw as Record<string, unknown>;
  return {
    category: pick(v.CATEGORIES, r.category),
    subcategory: text(r.subcategory, 40, true),
    primaryColor: pick(v.COLORS, r.primaryColor),
    secondaryColor: pick(v.COLORS, r.secondaryColor),
    pattern: pick(v.PATTERN, r.pattern),
    fabric: text(r.fabric, 40, true),
    fit: pick(v.FIT, r.fit),
    seasons: Array.isArray(r.seasons)
      ? v.SEASONS.filter((s) => (r.seasons as unknown[]).includes(s))
      : [],
    formality: pick(v.FORMALITY, r.formality),
    aiNote: text(r.aiNote, 300),
  };
}

const RANK_SCHEMA = {
  type: 'object',
  properties: {
    outfits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          candidateId: { type: 'string' },
          outerwearId: { type: 'string', nullable: true },
          accessoryIds: { type: 'array', items: { type: 'string' } },
          stylingTips: { type: 'string' },
        },
        required: ['candidateId', 'outerwearId', 'accessoryIds', 'stylingTips'],
      },
    },
  },
  required: ['outfits'],
};

const rankPrompt = (input: RankInput, data: object) =>
  `You are a personal stylist. Choose outfits for the occasion below from the candidate list.
Each candidate is a fixed set of required items. You never invent outfits or items.
- Pick exactly ${input.count} different candidates, best first, that suit the occasion, the person's profile and each other (colors, formality, seasons).
- For each, choose at most one outerwear id from that candidate's outerwearOptionIds, or null. When the occasion takes the person outside and an option exists, suggest one by default.
- For each, choose 0 to ${input.maxAccessories} accessory ids from that candidate's accessoryOptionIds.
- colors (if present) is this request's color preference: prefer outfits in the liked colors and away from the avoided ones, but still pick ${input.count} if nothing fits. Color groups: ${v.COLOR_GROUPS.join(', ')}.
- stylingTips: English, at most 500 characters, how to wear the outfit and why it suits the occasion. Use metric units.
Use only the ids given below.

${JSON.stringify(data)}`;

// Turns the raw JSON into RankedOutfit[]; wrong types become values the repair step drops (AD10).
export function toRankedOutfits(
  raw: unknown,
  itemIdOf: (alias: string) => string,
): RankedOutfit[] {
  const outfits = (raw as { outfits?: unknown } | null)?.outfits;
  if (!Array.isArray(outfits)) {
    throw new ApiError(
      502,
      'AI_FAILED',
      'The AI service failed. Please try again.',
    );
  }
  return outfits.map((o: Record<string, unknown> | null) => ({
    candidateId: typeof o?.candidateId === 'string' ? o.candidateId : '',
    outerwearId:
      typeof o?.outerwearId === 'string' ? itemIdOf(o.outerwearId) : null,
    accessoryIds: Array.isArray(o?.accessoryIds)
      ? o.accessoryIds
          .filter((a): a is string => typeof a === 'string')
          .map(itemIdOf)
      : [],
    stylingTips: typeof o?.stylingTips === 'string' ? o.stylingTips : '',
  }));
}

@Injectable()
export class GeminiProvider implements TextAiProvider {
  async tagClothing(image: { data: Buffer; mimeType: string }) {
    const raw = await generateJson(
      env('GEMINI_MODEL_TAG'),
      [
        {
          inline_data: {
            mime_type: image.mimeType,
            data: image.data.toString('base64'),
          },
        },
        { text: TAG_PROMPT },
      ],
      TAG_SCHEMA,
      TAG_TIMEOUT_MS,
    );
    return toClothingTags(raw);
  }

  async rankOutfits(input: RankInput) {
    // Short aliases (i1, i2...) instead of UUIDs save tokens (TDD 4.1).
    const alias = new Map(input.items.map((it, i) => [it.id, `i${i + 1}`]));
    const back = new Map([...alias].map(([id, a]) => [a, id]));
    const a = (id: string) => alias.get(id) ?? id;
    const data = {
      occasion: input.occasion,
      profile: input.profile,
      ...(input.colors.liked.length || input.colors.avoid.length
        ? { colors: input.colors }
        : {}),
      items: input.items.map((it) => ({ ...it, id: a(it.id) })),
      candidates: input.candidates.map((c) => ({
        id: c.id,
        requiredItemIds: c.requiredItemIds.map(a),
        outerwearOptionIds: c.outerwearOptionIds.map(a),
        accessoryOptionIds: c.accessoryOptionIds.map(a),
      })),
    };
    const raw = await generateJson(
      env('GEMINI_MODEL_RANK'),
      [{ text: rankPrompt(input, data) }],
      RANK_SCHEMA,
      RANK_TIMEOUT_MS,
    );
    // An unknown alias stays as is, so it matches no option and is removed.
    return toRankedOutfits(raw, (x) => back.get(x) ?? x);
  }
}
