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
import {
  blankToNull,
  notFound,
  optionalEnum,
  optionalText,
  uniqueList,
  uuidOr404,
} from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { Item } from '../generated/prisma/client.js';
import { ItemCategory, ItemStatus } from '../generated/prisma/enums.js';
import * as v from '../meta/values.js';
import { PrismaService } from '../prisma.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';

// Attributes of API section 3.1. No defaults here, so PATCH can leave fields unchanged.
const attrs = {
  category: z.preprocess(blankToNull, z.enum(ItemCategory).nullable()),
  subcategory: optionalText(40, true),
  primaryColor: optionalEnum(v.COLORS),
  secondaryColor: optionalEnum(v.COLORS),
  pattern: optionalEnum(v.PATTERN),
  fabric: optionalText(40, true),
  fit: optionalEnum(v.FIT),
  seasons: uniqueList(z.enum(v.SEASONS)),
  formality: optionalEnum(v.FORMALITY),
  aiNote: optionalText(300),
  size: optionalText(20),
  brand: optionalText(60),
  notes: optionalText(500),
  liked: z.boolean(),
};

const createSchema = z.object({
  ...attrs,
  seasons: attrs.seasons.default([]),
  liked: attrs.liked.default(false),
  status: z.enum(ItemStatus).default('COMPLETE'),
  originalPublicId: z.string(),
  cleanPublicId: z.preprocess(blankToNull, z.string().nullable()),
});
// originalPublicId cannot change (API 4.4).
const patchSchema = z
  .object({ ...attrs, status: z.enum(ItemStatus), cleanPublicId: z.string() })
  .partial();
const listSchema = z.object({
  status: z.enum(ItemStatus).optional(),
  category: z.enum(ItemCategory).optional(),
  liked: z.literal('true').optional(),
});
const analyzeSchema = z.object({ originalPublicId: z.string() });

// Rule R1: a COMPLETE item has every required attribute.
const REQUIRED = [
  'category',
  'primaryColor',
  'pattern',
  'fabric',
  'fit',
  'formality',
] as const;
function checkComplete(
  item: Pick<Item, (typeof REQUIRED)[number] | 'status' | 'seasons'>,
) {
  if (item.status !== 'COMPLETE') return;
  const fields: string[] = REQUIRED.filter((f) => item[f] == null);
  if (!item.seasons.length) fields.push('seasons');
  if (fields.length) {
    throw new ApiError(
      400,
      'VALIDATION_FAILED',
      'A complete item needs all required attributes.',
      { fields },
    );
  }
}

const invalidPublicId = () =>
  new ApiError(400, 'INVALID_PUBLIC_ID', 'Invalid photo reference.');
// Only the exact folder for the purpose; one plain segment, so "../" cannot leave it.
function checkPublicId(
  userId: string,
  folder: 'original' | 'clean',
  id: string,
) {
  if (!new RegExp(`^clocobi/${userId}/items/${folder}/[\\w-]+$`).test(id)) {
    throw invalidPublicId();
  }
}
// The public ID columns are the only unique columns an item write can hit.
async function uniquePublicId<T>(write: Promise<T>) {
  try {
    return await write;
  } catch (e) {
    if ((e as { code?: unknown }).code === 'P2002') throw invalidPublicId();
    throw e;
  }
}

@Controller('items')
export class ItemsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    @Inject(TEXT_AI) private readonly ai: TextAiProvider,
  ) {}

  // API 3.1: full URLs instead of public IDs, no userId.
  private toItem(row: Item) {
    const { userId: _, originalPublicId, cleanPublicId, ...rest } = row;
    return {
      ...rest,
      originalUrl: this.cloudinary.url(originalPublicId),
      cleanUrl: cleanPublicId ? this.cloudinary.url(cleanPublicId) : null,
    };
  }

  private async find(userId: string, id: string) {
    const row = await this.prisma.item.findFirst({
      where: { id: uuidOr404(id), userId },
    });
    if (!row) throw notFound();
    return row;
  }

  @Post('analyze')
  @HttpCode(200)
  async analyze(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(analyzeSchema)) body: z.infer<typeof analyzeSchema>,
  ) {
    checkPublicId(req.userId, 'original', body.originalPublicId);
    const image = await this.cloudinary.download(body.originalPublicId);
    return { proposed: await this.ai.tagClothing(image) };
  }

  @Post()
  async create(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    checkPublicId(req.userId, 'original', body.originalPublicId);
    if (body.cleanPublicId) {
      checkPublicId(req.userId, 'clean', body.cleanPublicId);
    }
    checkComplete(body);
    const row = await uniquePublicId(
      this.prisma.item.create({ data: { ...body, userId: req.userId } }),
    );
    return this.toItem(row);
  }

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>,
  ) {
    const liked = q.liked === 'true';
    const rows = await this.prisma.item.findMany({
      where: {
        userId: req.userId,
        // The liked view shows both statuses unless one is asked for.
        status: q.status ?? (liked ? undefined : 'COMPLETE'),
        category: q.category,
        liked: liked || undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((r) => this.toItem(r)) };
  }

  // Declared before :id so "summary" is not taken as an id.
  @Get('summary')
  async summary(@Req() req: AuthedRequest) {
    // shortcut: counts in memory from one small query, fine for one wardrobe; use groupBy if it grows to thousands.
    const rows = await this.prisma.item.findMany({
      where: { userId: req.userId },
      select: { status: true, category: true, liked: true },
    });
    const counts = Object.fromEntries(v.CATEGORIES.map((c) => [c, 0]));
    for (const r of rows) {
      if (r.status === 'COMPLETE' && r.category) counts[r.category]++;
    }
    return {
      counts,
      drafts: rows.filter((r) => r.status === 'DRAFT').length,
      liked: rows.filter((r) => r.liked).length,
    };
  }

  @Get(':id')
  async get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.toItem(await this.find(req.userId, id));
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(patchSchema)) body: z.infer<typeof patchSchema>,
  ) {
    const old = await this.find(req.userId, id);
    if (old.status === 'COMPLETE' && body.status === 'DRAFT') {
      throw new ApiError(
        409,
        'INVALID_STATUS_CHANGE',
        'A complete item cannot become a draft.',
      );
    }
    if (body.cleanPublicId !== undefined) {
      checkPublicId(req.userId, 'clean', body.cleanPublicId);
    }
    if (body.category !== undefined && body.category !== old.category) {
      const uses = await this.prisma.outfitItem.count({
        where: { itemId: old.id, outfit: { userId: req.userId } },
      });
      if (uses) {
        throw new ApiError(
          409,
          'ITEM_IN_USE',
          'This item is in an outfit, so its category cannot change.',
        );
      }
    }
    checkComplete({ ...old, ...body });
    const row = await uniquePublicId(
      this.prisma.item.update({
        where: { id: old.id, userId: req.userId },
        data: body,
      }),
    );
    if (old.cleanPublicId && old.cleanPublicId !== row.cleanPublicId) {
      await this.cloudinary.destroy(old.cleanPublicId);
    }
    return this.toItem(row);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    const old = await this.find(req.userId, id);
    // OutfitItem.itemId becomes NULL in the database (FR-027).
    await this.prisma.item.delete({
      where: { id: old.id, userId: req.userId },
    });
    await this.cloudinary.destroy(old.originalPublicId);
    if (old.cleanPublicId) await this.cloudinary.destroy(old.cleanPublicId);
  }
}
