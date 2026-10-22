import { ServiceUnavailableException } from '@nestjs/common';
import { StudyProgressFeatureGuard } from './study-progress.feature.guard';

describe('StudyProgressFeatureGuard', () => {
  it('fails closed by default and for string true', () => {
    for (const value of [undefined, null, 'true', false]) {
      const guard = new StudyProgressFeatureGuard({
        get: jest.fn().mockReturnValue(value),
      } as never);
      expect(() => guard.canActivate({} as never)).toThrow(
        ServiceUnavailableException,
      );
    }
  });
  it('permits requests only with validated server boolean true', () => {
    const guard = new StudyProgressFeatureGuard({
      get: jest.fn().mockReturnValue(true),
    } as never);
    expect(guard.canActivate({} as never)).toBe(true);
  });
});
