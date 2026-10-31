import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { TEXT_AI, type TextAiProvider } from '../ai/text-ai.provider.js';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { ApiError } from '../common/api-error.js';
import { notFound, uuidOr404 } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ItemCategory } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import {
  buildCandidates,
  MAX_ACCESSORIES,
  MAX_CANDIDATES,
  missingSlots,
  repairSelections,
  sample,
} from './candidates.js';

// API 3.3 item order; OUTERWEAR and ACCESSORY are the optional slots.
const SLOT_ORDER: ItemCategory[] = [
  'TOP',
  'BOTTOM',
  'ONE_PIECE',
  'OUTERWEAR',
  'SHOES',
  'ACCESSORY',
];
const isOptional = (slot: ItemCategory) =>
  slot === 'OUTERWEAR' || slot === 'ACCESSORY';

export const outfitInclude = {
  occasion: { select: { name: true } },
  items: {
    include: {
      item: {
        select: {
          id: true,
          category: true,
          subcategory: true,
          primaryColor: true,
          originalPublicId: true,
          cleanPublicId: true,
        },
      },
    },
  },
} satisfies Prisma.OutfitInclude;
export type OutfitRow = Prisma.OutfitGetPayload<{
  include: typeof outfitInclude;
}>;

const listSchema = z.object({ liked: z.literal('true').optional() });
const patchSchema = z.object({ liked: z.boolean() });

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

@Controller()
export class OutfitsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    @Inject(TEXT_AI) private readonly ai: TextAiProvider,
  ) {}

  // API 3.3: URLs instead of public IDs, items in slot order, isIncomplete derived (DB D1).
  toOutfit(o: OutfitRow) {
    const url = (id: string | null) => (id ? this.cloudinary.url(id) : null);
    const items = [...o.items]
      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
      .map(({ id, slot, item }) => ({
        id,
        slot,
        optional: isOptional(slot),
        item: item && {
          id: item.id,
          category: item.category,
          subcategory: item.subcategory,
          primaryColor: item.primaryColor,
          originalUrl: url(item.originalPublicId),
          cleanUrl: url(item.cleanPublicId),
        },
      }));
    return {
      id: o.id,
      occasionId: o.occasionId,
      occasionName: o.occasion.name,
      stylingTips: o.stylingTips,
      liked: o.liked,
      imageUrl: url(o.imagePublicId),
      isIncomplete: items.some((i) => !i.item && !i.optional),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      items,
    };
  }

  private async find(userId: string, id: string) {
    const row = await this.prisma.outfit.findFirst({
      where: { id: uuidOr404(id), userId },
      include: outfitInclude,
    });
    if (!row) throw notFound();
    return row;
  }

  private async findOccasion(userId: string, id: string) {
    const occasion = await this.prisma.occasion.findFirst({
      where: { id: uuidOr404(id), userId },
      select: { id: true, name: true, description: true },
    });
    if (!occasion) throw notFound();
    return occasion;
  }

  @Get('occasions/:id/outfits')
  async listForOccasion(@Req() req: AuthedRequest, @Param('id') id: string) {
    const occasion = await this.findOccasion(req.userId, id);
    const rows = await this.prisma.outfit.findMany({
      where: { occasionId: occasion.id, userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: outfitInclude,
    });
    return { outfits: rows.map((o) => this.toOutfit(o)) };
  }

  @Get('outfits')
  async list(
    @Req() req: AuthedRequest,
    @Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>,
  ) {
    const rows = await this.prisma.outfit.findMany({
      where: { userId: req.userId, liked: q.liked ? true : undefined },
      orderBy: { createdAt: 'desc' },
      include: outfitInclude,
    });
    return { outfits: rows.map((o) => this.toOutfit(o)) };
  }

  @Get('outfits/:id')
  async get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.toOutfit(await this.find(req.userId, id));
  }

  @Patch('outfits/:id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(patchSchema)) body: z.infer<typeof patchSchema>,
  ) {
    const old = await this.find(req.userId, id);
    return this.toOutfit(
      await this.prisma.outfit.update({
        where: { id: old.id, userId: req.userId },
        data: body,
        include: outfitInclude,
      }),
    );
  }

  @Delete('outfits/:id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    const old = await this.find(req.userId, id);
    await this.prisma.outfit.delete({
      where: { id: old.id, userId: req.userId },
    });
    if (old.imagePublicId) await this.cloudinary.destroy(old.imagePublicId);
  }

  // FR-057: only optional slots can be removed; the image is not regenerated.
  @Delete('outfits/:id/items/:outfitItemId')
  async removeItem(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('outfitItemId') outfitItemId: string,
  ) {
    const outfit = await this.find(req.userId, id);
    const row = outfit.items.find((i) => i.id === outfitItemId);
    if (!row) throw notFound();
    if (!isOptional(row.slot)) {
      throw new ApiError(
        409,
        'REQUIRED_ITEM',
        'Required items cannot be removed from an outfit.',
      );
    }
    // Through the outfit, which has the userId (DB D2).
    await this.prisma.outfitItem.deleteMany({
      where: {
        id: row.id,
        outfitId: outfit.id,
        outfit: { userId: req.userId },
      },
    });
    return this.toOutfit({
      ...outfit,
      items: outfit.items.filter((i) => i !== row),
    });
  }

  // Generate flow, API 4.6 steps 1 to 10.
  @Post('occasions/:id/outfits/generate')
  async generate(@Req() req: AuthedRequest, @Param('id') id: string) {
    const { userId } = req;
    const occasion = await this.findOccasion(userId, id);

    const profile = await this.prisma.styleProfile.findUnique({
      where: { userId },
      omit: { id: true, userId: true, createdAt: true, updatedAt: true },
    });
    if (!profile) {
      throw new ApiError(
        422,
        'PROFILE_REQUIRED',
        'Create your style profile before generating outfits.',
      );
    }

    const items = await this.prisma.item.findMany({
      where: { userId, status: 'COMPLETE' },
      select: {
        id: true,
        category: true,
        subcategory: true,
        primaryColor: true,
        secondaryColor: true,
        pattern: true,
        fabric: true,
        fit: true,
        seasons: true,
        formality: true,
        aiNote: true,
      },
    });
    const missing = missingSlots(items);
    if (missing.length) {
      throw new ApiError(
        422,
        'MISSING_SLOTS',
        `Add ${missing.map((m) => m.toLowerCase()).join(', ')} to your wardrobe first.`,
        { missing },
      );
    }

    const existing = new Set(
      (
        await this.prisma.outfit.findMany({
          where: { occasionId: occasion.id, userId },
          select: { comboKey: true },
        })
      ).map((o) => o.comboKey),
    );
    const left = buildCandidates(items).filter(
      (c) => !existing.has(c.comboKey),
    );
    if (!left.length) {
      return {
        outfits: [],
        notice: {
          code: 'NO_NEW_COMBINATIONS',
          message:
            'Every outfit your wardrobe allows for this occasion already exists. Add items for new ones.',
        },
      };
    }

    const count = Math.min(3, left.length);
    const candidates = (
      left.length > MAX_CANDIDATES ? sample(left, MAX_CANDIDATES) : left
    ).map((c, i) => ({ ...c, id: `c${i + 1}` }));
    const used = new Set(
      candidates.flatMap((c) => [
        ...c.requiredItemIds,
        ...c.outerwearOptionIds,
        ...c.accessoryOptionIds,
      ]),
    );
    const ranked = await this.ai.rankOutfits({
      occasion: { name: occasion.name, description: occasion.description },
      profile,
      items: items.filter((i) => used.has(i.id)),
      candidates,
      count,
      maxAccessories: MAX_ACCESSORIES,
    });
    const selections = repairSelections(ranked, candidates, count);
    if (!selections.length) {
      throw new ApiError(
        502,
        'AI_FAILED',
        'The AI service failed. Please try again.',
      );
    }

    const categoryOf = new Map(items.map((i) => [i.id, i.category!]));
    const outfits: OutfitRow[] = [];
    for (const s of selections) {
      const rows = [
        ...s.candidate.requiredItemIds.map((itemId) => ({
          itemId,
          slot: categoryOf.get(itemId)!,
        })),
        ...(s.outerwearId
          ? [{ itemId: s.outerwearId, slot: 'OUTERWEAR' as const }]
          : []),
        ...s.accessoryIds.map((itemId) => ({
          itemId,
          slot: 'ACCESSORY' as const,
        })),
      ];
      try {
        // One create with nested rows runs in one transaction.
        outfits.push(
          await this.prisma.outfit.create({
            data: {
              userId,
              occasionId: occasion.id,
              comboKey: s.candidate.comboKey,
              stylingTips: s.stylingTips,
              items: { create: rows },
            },
            include: outfitInclude,
          }),
        );
      } catch (e) {
        // A parallel request saved the same combination (R8): skip it.
        if ((e as { code?: unknown }).code !== 'P2002') throw e;
      }
    }

    const saved = outfits.length;
    const notice =
      saved < count
        ? {
            code: 'AI_RETURNED_FEWER',
            message: `Only ${plural(saved, 'new outfit was', 'new outfits were')} created. Generate again for more.`,
          }
        : count < 3
          ? {
              code: 'FEWER_THAN_REQUESTED',
              message: `Only ${plural(count, 'valid outfit exists', 'valid outfits exist')}.`,
            }
          : null;
    return { outfits: outfits.map((o) => this.toOutfit(o)), notice };
  }
}
