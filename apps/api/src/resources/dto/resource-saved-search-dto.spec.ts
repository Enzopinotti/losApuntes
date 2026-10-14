import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ResourceSavedSearchDto } from './resource-saved-search.dto';

describe('ResourceSavedSearchDto metadata search', () => {
  const errorsFor = (q: unknown) =>
    validateSync(plainToInstance(ResourceSavedSearchDto, { q })).flatMap(
      (error) => Object.keys(error.constraints ?? {}),
    );

  it('accepts a bounded phrase but requires an explicit query', () => {
    expect(validateSync(plainToInstance(ResourceSavedSearchDto, {})).length).toBeGreaterThan(0);
    expect(errorsFor('base de datos')).toEqual([]);
    expect(errorsFor('Álgebra')).toEqual([]);
    expect(errorsFor('x'.repeat(120))).toEqual([]);
  });

  it('rejects too-short, too-long and non-string queries', () => {
    for (const q of ['a', 'a ', '   ', 'x'.repeat(121), '', 1234, { x: 1 }]) {
      expect(errorsFor(q).length).toBeGreaterThan(0);
    }
  });

  it('keeps the existing pagination limits', () => {
    const query = plainToInstance(ResourceSavedSearchDto, { q: 'alg', limit: 51 });
    expect(validateSync(query).length).toBeGreaterThan(0);
    expect(plainToInstance(ResourceSavedSearchDto, {}).limit).toBe(25);
  });
});
