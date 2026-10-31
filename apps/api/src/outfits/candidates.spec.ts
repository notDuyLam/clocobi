import { createHash } from 'node:crypto';
import {
  buildCandidates,
  comboKey,
  missingSlots,
  repairSelections,
  sample,
} from './candidates.js';

type Cat = 'TOP' | 'BOTTOM' | 'ONE_PIECE' | 'SHOES' | 'OUTERWEAR' | 'ACCESSORY';
const item = (
  id: string,
  category: Cat,
  seasons = ['hot', 'mild', 'cold'],
) => ({
  id,
  category,
  seasons,
});

describe('missingSlots', () => {
  it.each([
    [[], ['TOP', 'BOTTOM', 'SHOES']],
    [[item('t', 'TOP'), item('s', 'SHOES')], ['BOTTOM']],
    [[item('d', 'ONE_PIECE')], ['SHOES']],
    [[item('d', 'ONE_PIECE'), item('s', 'SHOES')], []],
    [[item('t', 'TOP'), item('b', 'BOTTOM'), item('s', 'SHOES')], []],
  ] as const)('%j → %j', (items, missing) => {
    expect(missingSlots([...items])).toEqual(missing);
  });
});

describe('comboKey', () => {
  it('is the SHA-256 of the sorted ids, order-independent', () => {
    expect(comboKey(['b', 'a', 'c'])).toBe(
      createHash('sha256').update('a,b,c').digest('hex'),
    );
    expect(comboKey(['c', 'a', 'b'])).toBe(comboKey(['a', 'b', 'c']));
  });
});

describe('buildCandidates', () => {
  it('builds top+bottom+shoes and one-piece+shoes combinations', () => {
    const c = buildCandidates([
      item('t1', 'TOP'),
      item('t2', 'TOP'),
      item('b1', 'BOTTOM'),
      item('d1', 'ONE_PIECE'),
      item('s1', 'SHOES'),
      item('s2', 'SHOES'),
    ]);
    expect(c.map((x) => x.requiredItemIds)).toEqual([
      ['t1', 'b1', 's1'],
      ['t1', 'b1', 's2'],
      ['t2', 'b1', 's1'],
      ['t2', 'b1', 's2'],
      ['d1', 's1'],
      ['d1', 's2'],
    ]);
    expect(c[0].comboKey).toBe(comboKey(['t1', 'b1', 's1']));
  });

  it('allows optional items only when they share a season with every required item (R9)', () => {
    const [c] = buildCandidates([
      item('t', 'TOP', ['hot', 'mild']),
      item('b', 'BOTTOM', ['mild']),
      item('s', 'SHOES', ['mild', 'cold']),
      item('coat', 'OUTERWEAR', ['cold']),
      item('jacket', 'OUTERWEAR', ['mild', 'cold']),
      item('cap', 'ACCESSORY', ['hot']),
      item('watch', 'ACCESSORY', ['hot', 'mild', 'cold']),
    ]);
    expect(c.outerwearOptionIds).toEqual(['jacket']);
    expect(c.accessoryOptionIds).toEqual(['watch']);
  });
});

describe('sample', () => {
  it('returns n distinct elements of the list', () => {
    const list = Array.from({ length: 50 }, (_, i) => i);
    const s = sample(list, 20);
    expect(s).toHaveLength(20);
    expect(new Set(s).size).toBe(20);
    expect(s.every((x) => list.includes(x))).toBe(true);
    expect(sample(list, 99)).toHaveLength(50);
  });
});

describe('repairSelections (AD10)', () => {
  const cands = [
    {
      id: 'c1',
      requiredItemIds: ['t', 'b', 's'],
      outerwearOptionIds: ['j'],
      accessoryOptionIds: ['a1', 'a2', 'a3'],
      comboKey: 'k1',
    },
    {
      id: 'c2',
      requiredItemIds: ['d', 's'],
      outerwearOptionIds: [],
      accessoryOptionIds: [],
      comboKey: 'k2',
    },
    {
      id: 'c3',
      requiredItemIds: ['t', 'b2', 's'],
      outerwearOptionIds: [],
      accessoryOptionIds: [],
      comboKey: 'k3',
    },
  ];
  const sel = (candidateId: string, extra = {}) => ({
    candidateId,
    outerwearId: null,
    accessoryIds: [],
    stylingTips: 'Wear it.',
    ...extra,
  });

  it('drops unknown, duplicate and empty-tip selections and keeps at most count', () => {
    const out = repairSelections(
      [
        sel('c9'),
        sel('c1'),
        sel('c1'),
        sel('c2', { stylingTips: '  ' }),
        sel('c3'),
        sel('c2'),
      ],
      cands,
      2,
    );
    expect(out.map((o) => o.candidateId)).toEqual(['c1', 'c3']);
  });

  it('removes optional ids outside the options, repeats, and accessories beyond 2', () => {
    const [o] = repairSelections(
      [
        sel('c1', {
          outerwearId: 'x',
          accessoryIds: ['a1', 'a1', 'zz', 'a2', 'a3'],
        }),
      ],
      cands,
      3,
    );
    expect(o.outerwearId).toBeNull();
    expect(o.accessoryIds).toEqual(['a1', 'a2']);
    const [ok] = repairSelections([sel('c1', { outerwearId: 'j' })], cands, 3);
    expect(ok.outerwearId).toBe('j');
  });

  it('trims tips and cuts them to 600 characters', () => {
    const [o] = repairSelections(
      [sel('c1', { stylingTips: ` ${'x'.repeat(700)}` })],
      cands,
      1,
    );
    expect(o.stylingTips).toBe('x'.repeat(600));
  });
});
