import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { env } from '../common/env.js';
import * as v from '../meta/values.js';
import { generateJson } from './gemini.client.js';
import type { ClothingTags, TextAiProvider } from './text-ai.provider.js';

const TAG_TIMEOUT_MS = 30_000;

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
}
