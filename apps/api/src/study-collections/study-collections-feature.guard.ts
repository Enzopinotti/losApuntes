import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Fail closed by default. Enabling this flag also causes account export
 * requests to use the complete 31-section v2 manifest.
 */
@Injectable()
export class StudyCollectionsFeatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    // This global rollout gate does not consume the request-specific context.
    void context;
    if (this.config.get<boolean>('STUDY_COLLECTIONS_ENABLED') !== true) {
      throw new ServiceUnavailableException({
        code: 'STUDY_COLLECTIONS_NOT_ENABLED',
        message: 'Persistent study collections are not enabled',
      });
    }
    return true;
  }
}
