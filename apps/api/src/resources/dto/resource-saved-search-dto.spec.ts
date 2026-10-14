import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ResourceSavedListDto } from './resource.dto';

describe('ResourceSavedListDto metadata search', () => {
  const errorsFor = (q: unknown) =>
    validateSync(plainToInstance(ResourceSavedListDto, { q })).flatMap(
      (error) => Object.keys(error.constraints ?? {}),
    );

  it('accepts a bounded phrase or omitted query', () => {
    expect(validateSync(plainToInstance(ResourceSavedListDto, {}))).toEqual([]);
    expect(errorsFor('base de datos')).toEqual([]);
    expect(errorsFor('Álgebra')).toEqual([]);
    expect(errorsFor('x'.repeat(120))).toEqual([]);
  });

  it('rejects too-short, too-long and non-string queries', () => {
    for (const q of ['a', '', 'x'.repeat(121), 1234, { x: 1 }]) {
      expect(errorsFor(q).length).toBeGreaterThan(0);
    }
  });

  it('keeps the existing pagination limits', () => {
    const query = plainToInstance(ResourceSavedListDto, { q: 'alg', limit: 51 });
    expect(validateSync(query).length).toBeGreaterThan(0);
    expect(plainToInstance(ResourceSavedListDto, {}).limit).toBe(25);
  });
});
