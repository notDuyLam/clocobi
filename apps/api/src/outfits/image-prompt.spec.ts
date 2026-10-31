import {
  byReferenceOrder,
  outfitPrompt,
  type PromptItem,
} from './image-prompt.js';

const it_ = (
  slot: PromptItem['slot'],
  extra: Partial<PromptItem> = {},
): PromptItem => ({
  slot,
  category: slot,
  subcategory: null,
  primaryColor: 'navy',
  secondaryColor: null,
  pattern: 'solid',
  fabric: null,
  originalPublicId: 'o',
  cleanPublicId: null,
  ...extra,
});

describe('byReferenceOrder', () => {
  it('puts top or one-piece, bottom, shoes, outerwear, then accessories', () => {
    const slots = byReferenceOrder([
      it_('ACCESSORY'),
      it_('SHOES'),
      it_('OUTERWEAR'),
      it_('BOTTOM'),
      it_('TOP'),
    ]).map((i) => i.slot);
    expect(slots).toEqual(['TOP', 'BOTTOM', 'SHOES', 'OUTERWEAR', 'ACCESSORY']);
  });
});

describe('outfitPrompt', () => {
  const items = [
    it_('TOP', {
      subcategory: 'shirt',
      primaryColor: 'white',
      secondaryColor: 'blue',
      pattern: 'striped',
      fabric: 'linen',
    }),
    it_('ONE_PIECE'),
  ];

  it('describes each garment and picks the person from clothingCategory', () => {
    const p = outfitPrompt(items, 'Womenswear');
    expect(p).toContain('of a woman wearing');
    expect(p).toContain(
      'white and blue striped linen shirt (top); navy one-piece (one-piece)',
    );
    expect(p).toContain('The first 2 reference images');
  });

  it.each([
    ['Menswear', 'a man'],
    ['Unisex', 'a person'],
    [undefined, 'a person'],
  ])('%s → %s', (cat, person) => {
    expect(outfitPrompt(items, cat)).toContain(`of ${person} wearing`);
  });

  it('never mentions body traits', () => {
    expect(outfitPrompt(items, 'Menswear')).not.toMatch(
      /\b(height|weight|build|skin|cm|kg)\b/i,
    );
  });
});
