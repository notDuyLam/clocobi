import { Controller, Get } from '@nestjs/common';
import * as v from './values.js';

@Controller('meta')
export class MetaController {
  @Get()
  get() {
    return {
      categories: v.CATEGORIES,
      seasons: v.SEASONS,
      formality: v.FORMALITY,
      fit: v.FIT,
      pattern: v.PATTERN,
      colors: v.COLORS,
      colorGroups: v.COLOR_GROUPS,
      clothingCategory: v.CLOTHING_CATEGORY,
      build: v.BUILD,
      skinUndertone: v.SKIN_UNDERTONE,
      fitPreference: v.FIT_PREFERENCE,
    };
  }
}
