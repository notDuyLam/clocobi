import { createHash } from 'node:crypto';
import type {
  Candidate,
  ItemForAi,
  RankedOutfit,
} from '../ai/text-ai.provider.js';
import type { ItemCategory } from '../generated/prisma/enums.js';

export const MAX_ACCESSORIES = 2; // DB D9
export const MAX_CANDIDATES = 200; // TDD 4.2, initial value
const TIPS_MAX = 600;

type ItemLike = Pick<ItemForAi, 'id' | 'category' | 'seasons'>;
export type CoreCandidate = Candidate & { comboKey: string };

// SHA-256 hex of the sorted required item IDs joined with a comma (DB section 6).
export const comboKey = (requiredIds: string[]) =>
  createHash('sha256')
    .update([...requiredIds].sort().join(','))
    .digest('hex');

// Generate step 3: slots that stop any valid outfit (R3).
export function missingSlots(items: ItemLike[]): ItemCategory[] {
  const has = (c: ItemCategory) => items.some((i) => i.category === c);
  const missing: ItemCategory[] = [];
  if (!has('ONE_PIECE')) {
    if (!has('TOP')) missing.push('TOP');
    if (!has('BOTTOM')) missing.push('BOTTOM');
  }
  if (!has('SHOES')) missing.push('SHOES');
  return missing;
}

// Generate step 4: every core combination with its R9 options. Ids are set later.
export function buildCandidates(items: ItemLike[]): CoreCandidate[] {
  const of = (c: ItemCategory) => items.filter((i) => i.category === c);
  const shoes = of('SHOES');
  const cores: ItemLike[][] = [
    ...of('TOP').flatMap((t) => of('BOTTOM').map((b) => [t, b])),
    ...of('ONE_PIECE').map((o) => [o]),
  ].flatMap((core) => shoes.map((s) => [...core, s]));
  // R9: an optional item must share a season with every required item.
  const allowed = (required: ItemLike[], c: ItemCategory) =>
    of(c)
      .filter((o) =>
        required.every((r) => r.seasons.some((s) => o.seasons.includes(s))),
      )
      .map((o) => o.id);
  return cores.map((required) => {
    const requiredItemIds = required.map((r) => r.id);
    return {
      id: '',
      requiredItemIds,
      outerwearOptionIds: allowed(required, 'OUTERWEAR'),
      accessoryOptionIds: allowed(required, 'ACCESSORY'),
      comboKey: comboKey(requiredItemIds),
    };
  });
}

// Random sample without repeats (partial Fisher-Yates).
export function sample<T>(list: T[], n: number): T[] {
  const a = [...list];
  for (let i = 0; i < Math.min(n, a.length); i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// Generate step 8 (AD10): drop selections with a wrong core, repair wrong optional items.
export function repairSelections(
  ranked: RankedOutfit[],
  candidates: CoreCandidate[],
  count: number,
) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const out: (RankedOutfit & { candidate: CoreCandidate })[] = [];
  for (const r of ranked) {
    if (out.length === count) break;
    const candidate = byId.get(r.candidateId);
    const stylingTips = r.stylingTips.trim().slice(0, TIPS_MAX);
    if (!candidate || !stylingTips) continue;
    if (out.some((o) => o.candidateId === r.candidateId)) continue;
    out.push({
      candidate,
      candidateId: r.candidateId,
      outerwearId:
        r.outerwearId && candidate.outerwearOptionIds.includes(r.outerwearId)
          ? r.outerwearId
          : null,
      accessoryIds: [...new Set(r.accessoryIds)]
        .filter((id) => candidate.accessoryOptionIds.includes(id))
        .slice(0, MAX_ACCESSORIES),
      stylingTips,
    });
  }
  return out;
}
