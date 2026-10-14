import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ResourceSavedSearchDto } from './resource-saved-search.dto';

describe('ResourceSavedSearchDto metadata search', () => {
  const errorsFor = (q: unknown) =>
    validateSync(plainToInstance(ResourceSavedSearchDto, { q })).flatMap(
      (error) => Object.keys(error.constraints ?? {}),
    );

  it('accepts text, a subject-only filter, or both', () => {
    expect(validateSync(plainToInstance(ResourceSavedSearchDto, {}))).toEqual([]);
    expect(validateSync(plainToInstance(ResourceSavedSearchDto, { subjectId: '11111111-1111-4111-8111-111111111111' }))).toEqual([]);
    expect(errorsFor('base de datos')).toEqual([]);
    expect(errorsFor('Álgebra')).toEqual([]);
    expect(errorsFor('x'.repeat(120))).toEqual([]);
  });

  it('rejects too-short, too-long and non-string queries', () => {
    for (const q of ['a', 'a ', '   ', 'x'.repeat(121), '', 1234, { x: 1 }]) {
      expect(errorsFor(q).length).toBeGreaterThan(0);
    }
  });

  it('accepts global title ordering with or without metadata filters', () => {
    expect(validateSync(plainToInstance(ResourceSavedSearchDto, { order: 'title' }))).toEqual([]);
    expect(validateSync(plainToInstance(ResourceSavedSearchDto, { order: 'title', q: 'alg' }))).toEqual([]);
    expect(validateSync(plainToInstance(ResourceSavedSearchDto, { order: 'saved', q: 'alg' }))).toEqual([]);
    for (const order of ['random', '-1', 'date', 42]) {
      expect(validateSync(plainToInstance(ResourceSavedSearchDto, { order })).length).toBeGreaterThan(0);
    }
  });

  it('rejects malformed subject IDs', () => {
    expect(validateSync(plainToInstance(ResourceSavedSearchDto, { subjectId: 'not-a-subject' })).length).toBeGreaterThan(0);
  });

  it('keeps the existing pagination limits', () => {
    const query = plainToInstance(ResourceSavedSearchDto, { q: 'alg', limit: 51 });
    expect(validateSync(query).length).toBeGreaterThan(0);
    expect(plainToInstance(ResourceSavedSearchDto, {}).limit).toBe(25);
  });
});
