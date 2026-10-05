import { Injectable } from '@nestjs/common';

import { ProfileService } from '../../profile/domain/profile.service';
import { UsersService } from '../../users/users.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

function assertSingletonCursor(sectionId: string, cursor: string | null): void {
  if (cursor !== null) {
    throw new Error(
      `Account export section ${sectionId} does not accept a cursor`,
    );
  }
}

@Injectable()
export class AccountIdentityExportContributor implements AccountExportContributor {
  readonly sectionId = 'account';

  constructor(private readonly users: UsersService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    assertSingletonCursor(this.sectionId, input.cursor);

    const account = await this.users.getAccountExportProjection(input.userId);
    if (!account) {
      throw new Error('Account export owner record is missing');
    }

    const record: AccountExportRecord = {
      id: account.id,
      email: account.email,
      username: account.username,
      emailVerifiedAt: account.emailVerifiedAt,
      accountStatus: account.accountStatus,
      accountClosedAt: account.accountClosedAt,
      fullName: account.fullName,
      avatarUrl: account.avatarUrl,
      bio: account.bio,
      careerId: account.careerId,
      cohortYear: account.cohortYear,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };

    return { records: [record], nextCursor: null };
  }
}

@Injectable()
export class ProfileExportContributor implements AccountExportContributor {
  readonly sectionId = 'profile';

  constructor(private readonly profiles: ProfileService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    assertSingletonCursor(this.sectionId, input.cursor);

    const profile = await this.profiles.getAccountExportProfile(input.userId);
    if (!profile) return { records: [], nextCursor: null };

    const record: AccountExportRecord = {
      lifecycleState: profile.lifecycleState,
      id: profile.id,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      languages: profile.languages,
      skills: profile.skills,
      interests: profile.interests,
      helpTopics: profile.helpTopics,
      learningTopics: profile.learningTopics,
      professional: {
        headline: profile.professional.headline,
        careerDiscoveryOptIn: profile.professional.careerDiscoveryOptIn,
      },
      presentation: {
        accentPreset: profile.presentation.accentPreset,
        coverPreset: profile.presentation.coverPreset,
        sectionOrder: profile.presentation.sectionOrder,
      },
      visibility: {
        about: profile.visibility.about,
        academic: profile.visibility.academic,
        learning: profile.visibility.learning,
        activities: profile.visibility.activities,
        skills: profile.visibility.skills,
        professional: profile.visibility.professional,
        contributions: profile.visibility.contributions,
      },
      recommendationSignals: {
        academicContext: profile.recommendationSignals.academicContext,
        learning: profile.recommendationSignals.learning,
        skillsInterests: profile.recommendationSignals.skillsInterests,
      },
      revision: profile.revision,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };

    return { records: [record], nextCursor: null };
  }
}

@Injectable()
export class ProfileActivitiesExportContributor implements AccountExportContributor {
  readonly sectionId = 'profile.activities';

  constructor(private readonly profiles: ProfileService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.profiles.listAccountExportActivities(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((activity): AccountExportRecord => ({
        id: activity.id,
        type: activity.type,
        title: activity.title,
        description: activity.description,
        url: activity.url,
        startedOn: activity.startedOn,
        endedOn: activity.endedOn,
        revision: activity.revision,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
