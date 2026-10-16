import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StudyProgressFeatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    // The feature gate is global; the Nest context has no influence on it.
    void context;
    if (this.config.get<boolean>('STUDY_PROGRESS_ENABLED') !== true) {
      throw new ServiceUnavailableException({
        code: 'STUDY_PROGRESS_NOT_ENABLED',
        message: 'Saved study progress is not enabled',
      });
    }
    return true;
  }
}
