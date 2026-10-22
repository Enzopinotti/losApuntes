import { ServiceUnavailableException } from '@nestjs/common';
import { StudyCollectionsFeatureGuard } from './study-collections-feature.guard';

describe('StudyCollectionsFeatureGuard', () => {
  it('denies CRUD by default', () => {
    const guard = new StudyCollectionsFeatureGuard({
      get: jest.fn().mockReturnValue(undefined),
    } as never);
    expect(() => guard.canActivate({} as never)).toThrow(
      ServiceUnavailableException,
    );
  });
  it('allows CRUD only when server flag is the boolean true', () => {
    const enabled = new StudyCollectionsFeatureGuard({
      get: jest.fn().mockReturnValue(true),
    } as never);
    expect(enabled.canActivate({} as never)).toBe(true);
    const invalid = new StudyCollectionsFeatureGuard({
      get: jest.fn().mockReturnValue('true'),
    } as never);
    expect(() => invalid.canActivate({} as never)).toThrow(
      ServiceUnavailableException,
    );
  });
});
