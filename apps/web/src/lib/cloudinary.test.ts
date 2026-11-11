import { describe, expect, it } from 'vitest';
import { thumb } from './cloudinary';

describe('thumb', () => {
  it('adds the size-limiting transformation after /image/upload/', () => {
    expect(
      thumb('https://res.cloudinary.com/demo/image/upload/clocobi/u/items/clean/x'),
    ).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_400,f_auto,q_auto/clocobi/u/items/clean/x',
    );
  });

  it('accepts a width and leaves other URLs alone', () => {
    expect(thumb('https://res.cloudinary.com/d/image/upload/a', 200)).toContain('w_200');
    expect(thumb('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
  });
});
