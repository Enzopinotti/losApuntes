import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AcademicService } from '../../academic/domain/academic.service';
import type {
  CreateProfileActivityDto,
  CreateProfileDto,
  UpdateProfileActivityDto,
  UpdateProfileDto,
} from '../dto/profile.dto';
import {
  PROFILE_STORE,
  ProfileAlreadyExistsError,
  type ProfileStore,
  type UpdateProfileRecord,
} from './profile.store';
import {
  PROFILE_SECTIONS,
  type ProfileActivityRecord,
  type ProfileRecord,
  type ProfileSection,
  type ProfileVisibilityPolicy,
} from './profile.types';

const DEFAULT_SECTION_ORDER = [...PROFILE_SECTIONS];

const DEFAULT_VISIBILITY: ProfileVisibilityPolicy = {
  about: 'public',
  academic: 'private',
  learning: 'private',
  activities: 'private',
  skills: 'private',
  professional: 'private',
  contributions: 'private',
};

function cleanText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function cleanNullable(value: string | null): string | null {
  return value === null ? null : cleanText(value);
}

function normalizedKey(value: string): string {
  return cleanText(value).normalize('NFKC').toLocaleLowerCase('es-AR');
}

function cleanList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = cleanText(raw);
    const key = normalizedKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

@Injectable()
export class ProfileService {
  constructor(
    @Inject(PROFILE_STORE)
    private readonly store: ProfileStore,
    private readonly academic: AcademicService,
  ) {}

  async getOwnerProfile(userId: string) {
    const profile = await this.store.findProfileByUserId(userId);
    if (!profile) {
      return {
        profile: null,
        onboardingRequired: true,
      };
    }

    const [academic, activities] = await Promise.all([
      this.academicProjection(userId),
      this.store.listActivitiesForUser(userId),
    ]);

    return {
      profile: this.ownerProfile(profile),
      academic,
      activities: activities.map((row) => this.publicActivity(row)),
      contributions: this.emptyContributions(),
      onboardingRequired: false,
    };
  }

  async createProfile(userId: string, dto: CreateProfileDto) {
    const record = {
      id: randomUUID(),
      userId,
      displayName: cleanText(dto.displayName),
      bio: dto.bio === undefined ? null : cleanNullable(dto.bio),
      avatarUrl: dto.avatarUrl ?? null,
      languages: cleanList(dto.languages ?? []),
      skills: cleanList(dto.skills ?? []),
      interests: cleanList(dto.interests ?? []),
      helpTopics: cleanList(dto.helpTopics ?? []),
      learningTopics: cleanList(dto.learningTopics ?? []),
      professional: {
        headline:
          dto.professional?.headline === undefined
            ? null
            : cleanNullable(dto.professional.headline),
        careerDiscoveryOptIn: dto.professional?.careerDiscoveryOptIn ?? false,
      },
      presentation: {
        accentPreset: dto.presentation?.accentPreset ?? 'default',
        coverPreset: dto.presentation?.coverPreset ?? 'none',
        sectionOrder: this.sectionOrder(
          dto.presentation?.sectionOrder ?? DEFAULT_SECTION_ORDER,
        ),
      },
      visibility: {
        ...DEFAULT_VISIBILITY,
        ...dto.visibility,
      },
      recommendationSignals: {
        academicContext: dto.recommendationSignals?.academicContext ?? true,
        learning: dto.recommendationSignals?.learning ?? true,
        skillsInterests: dto.recommendationSignals?.skillsInterests ?? true,
      },
      revision: 1,
    } as const;

    try {
      const created = await this.store.createProfile(record);
      return { profile: this.ownerProfile(created) };
    } catch (error) {
      if (error instanceof ProfileAlreadyExistsError) {
        throw new ConflictException({
          code: 'PROFILE_ALREADY_EXISTS',
          message: 'Profile already exists for this account',
        });
      }

      throw error;
    }
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existing = await this.store.findProfileByUserId(userId);
    if (!existing) this.profileNotFound();

    const patch: UpdateProfileRecord = {
      ...(dto.displayName === undefined
        ? {}
        : { displayName: cleanText(dto.displayName) }),
      ...(dto.bio === undefined ? {} : { bio: cleanNullable(dto.bio) }),
      ...(dto.avatarUrl === undefined ? {} : { avatarUrl: dto.avatarUrl }),
      ...(dto.languages === undefined
        ? {}
        : { languages: cleanList(dto.languages) }),
      ...(dto.skills === undefined ? {} : { skills: cleanList(dto.skills) }),
      ...(dto.interests === undefined
        ? {}
        : { interests: cleanList(dto.interests) }),
      ...(dto.helpTopics === undefined
        ? {}
        : { helpTopics: cleanList(dto.helpTopics) }),
      ...(dto.learningTopics === undefined
        ? {}
        : { learningTopics: cleanList(dto.learningTopics) }),
      ...(dto.professional === undefined
        ? {}
        : {
            professional: {
              headline:
                dto.professional.headline === undefined
                  ? existing.professional.headline
                  : cleanNullable(dto.professional.headline),
              careerDiscoveryOptIn:
                dto.professional.careerDiscoveryOptIn ??
                existing.professional.careerDiscoveryOptIn,
            },
          }),
      ...(dto.presentation === undefined
        ? {}
        : {
            presentation: {
              accentPreset:
                dto.presentation.accentPreset ??
                existing.presentation.accentPreset,
              coverPreset:
                dto.presentation.coverPreset ??
                existing.presentation.coverPreset,
              sectionOrder:
                dto.presentation.sectionOrder === undefined
                  ? existing.presentation.sectionOrder
                  : this.sectionOrder(dto.presentation.sectionOrder),
            },
          }),
      ...(dto.visibility === undefined
        ? {}
        : {
            visibility: {
              ...existing.visibility,
              ...dto.visibility,
            },
          }),
      ...(dto.recommendationSignals === undefined
        ? {}
        : {
            recommendationSignals: {
              ...existing.recommendationSignals,
              ...dto.recommendationSignals,
            },
          }),
    };

    const updated = await this.store.updateProfile(
      userId,
      dto.expectedRevision,
      patch,
    );

    if (!updated) {
      throw new ConflictException({
        code: 'PROFILE_REVISION_CONFLICT',
        message: 'Profile changed concurrently',
      });
    }

    return { profile: this.ownerProfile(updated) };
  }

  async searchPublicProfiles(query: string, limit: number) {
    const rows = await this.store.searchPublicProfiles(cleanText(query), limit);

    return {
      items: rows.map((profile) => ({
        profileId: profile.id,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      })),
    };
  }

  async getAttributionForUser(userId: string) {
    const profile = await this.store.findProfileByUserId(userId);
    if (!profile) return null;

    const aboutPublic = profile.visibility.about === 'public';
    return {
      profileId: profile.id,
      displayName: aboutPublic ? profile.displayName : 'Usuario de Los Apuntes',
      avatarUrl: aboutPublic ? profile.avatarUrl : null,
    };
  }

  async getFeedSignals(userId: string) {
    const profile = await this.store.findProfileByUserId(userId);
    if (!profile) return null;

    return {
      profileId: profile.id,
      skills: profile.skills,
      interests: profile.interests,
      helpTopics: profile.helpTopics,
      learningTopics: profile.learningTopics,
      recommendationSignals: profile.recommendationSignals,
    };
  }

  async getAttributionsForUsers(userIds: string[]) {
    const unique = [...new Set(userIds)];
    const rows = await this.store.findProfilesByUserIds(unique);
    const byUserId = new Map(
      rows.map((profile) => {
        const aboutPublic = profile.visibility.about === 'public';
        return [
          profile.userId,
          {
            profileId: profile.id,
            displayName: aboutPublic
              ? profile.displayName
              : 'Usuario de Los Apuntes',
            avatarUrl: aboutPublic ? profile.avatarUrl : null,
          },
        ] as const;
      }),
    );

    return byUserId;
  }

  async resolveUserIdByProfileId(profileId: string): Promise<string | null> {
    const profile = await this.store.findProfileById(profileId);
    return profile?.userId ?? null;
  }

  async getPublicProfile(profileId: string) {
    const profile = await this.store.findProfileById(profileId);
    if (!profile) this.profileNotFound();

    const visible = (section: ProfileSection) =>
      profile.visibility[section] === 'public';

    const [academic, activities] = await Promise.all([
      visible('academic')
        ? this.academicProjection(profile.userId)
        : Promise.resolve(undefined),
      visible('activities')
        ? this.store.listActivitiesForUser(profile.userId)
        : Promise.resolve(undefined),
    ]);

    const publicOrder = profile.presentation.sectionOrder.filter(visible);

    return {
      profile: {
        id: profile.id,
        revision: profile.revision,
        presentation: {
          accentPreset: profile.presentation.accentPreset,
          coverPreset: profile.presentation.coverPreset,
          sectionOrder: publicOrder,
        },
        ...(visible('about')
          ? {
              about: {
                displayName: profile.displayName,
                bio: profile.bio,
                avatarUrl: profile.avatarUrl,
              },
            }
          : {}),
        ...(visible('academic') ? { academic } : {}),
        ...(visible('learning')
          ? {
              learning: {
                helpTopics: profile.helpTopics,
                learningTopics: profile.learningTopics,
              },
            }
          : {}),
        ...(visible('activities')
          ? {
              activities:
                activities?.map((row) => this.publicActivity(row)) ?? [],
            }
          : {}),
        ...(visible('skills')
          ? {
              skills: {
                languages: profile.languages,
                skills: profile.skills,
                interests: profile.interests,
              },
            }
          : {}),
        ...(visible('professional')
          ? {
              professional: {
                headline: profile.professional.headline,
              },
            }
          : {}),
        ...(visible('contributions')
          ? { contributions: this.emptyContributions() }
          : {}),
      },
    };
  }

  async createActivity(userId: string, dto: CreateProfileActivityDto) {
    await this.requireOwnerProfile(userId);
    this.assertActivityPeriod(dto.startedOn, dto.endedOn);

    const created = await this.store.createActivity({
      id: randomUUID(),
      userId,
      type: dto.type,
      title: cleanText(dto.title),
      description:
        dto.description === undefined ? null : cleanNullable(dto.description),
      url: dto.url ?? null,
      startedOn: dto.startedOn ?? null,
      endedOn: dto.endedOn ?? null,
      revision: 1,
    });

    return { activity: this.publicActivity(created) };
  }

  async updateActivity(
    userId: string,
    id: string,
    dto: UpdateProfileActivityDto,
  ) {
    const existing = await this.store.findActivityForUser(userId, id);
    if (!existing) this.activityNotFound();

    const startedOn =
      dto.startedOn === undefined ? existing.startedOn : dto.startedOn;
    const endedOn = dto.endedOn === undefined ? existing.endedOn : dto.endedOn;
    this.assertActivityPeriod(startedOn, endedOn);

    const updated = await this.store.updateActivity(
      userId,
      id,
      dto.expectedRevision,
      {
        ...(dto.type === undefined ? {} : { type: dto.type }),
        ...(dto.title === undefined ? {} : { title: cleanText(dto.title) }),
        ...(dto.description === undefined
          ? {}
          : { description: cleanNullable(dto.description) }),
        ...(dto.url === undefined ? {} : { url: dto.url }),
        ...(dto.startedOn === undefined ? {} : { startedOn: dto.startedOn }),
        ...(dto.endedOn === undefined ? {} : { endedOn: dto.endedOn }),
      },
    );

    if (!updated) {
      throw new ConflictException({
        code: 'PROFILE_ACTIVITY_REVISION_CONFLICT',
        message: 'Profile activity changed concurrently',
      });
    }

    return { activity: this.publicActivity(updated) };
  }

  async deleteActivity(
    userId: string,
    id: string,
    expectedRevision: number,
  ): Promise<void> {
    const existing = await this.store.findActivityForUser(userId, id);
    if (!existing) this.activityNotFound();

    const deleted = await this.store.deleteActivity(
      userId,
      id,
      expectedRevision,
    );

    if (!deleted) {
      throw new ConflictException({
        code: 'PROFILE_ACTIVITY_REVISION_CONFLICT',
        message: 'Profile activity changed concurrently',
      });
    }
  }

  private assertActivityPeriod(
    startedOn: string | null | undefined,
    endedOn: string | null | undefined,
  ): void {
    if (!startedOn || !endedOn) return;

    if (endedOn < startedOn) {
      throw new UnprocessableEntityException({
        code: 'PROFILE_ACTIVITY_PERIOD_INVALID',
        message: 'Activity end period cannot be before start period',
      });
    }
  }

  private async requireOwnerProfile(userId: string): Promise<ProfileRecord> {
    const profile = await this.store.findProfileByUserId(userId);
    if (!profile) this.profileNotFound();
    return profile;
  }

  private sectionOrder(values: readonly ProfileSection[]): ProfileSection[] {
    if (
      values.length !== PROFILE_SECTIONS.length ||
      PROFILE_SECTIONS.some((section) => !values.includes(section))
    ) {
      throw new UnprocessableEntityException({
        code: 'PROFILE_SECTION_ORDER_INVALID',
        message:
          'Profile section order must contain every section exactly once',
      });
    }

    return [...values];
  }

  private async academicProjection(userId: string) {
    const [affiliations, participations, context] = await Promise.all([
      this.academic.listAffiliations(userId),
      this.academic.listSubjectParticipations(userId),
      this.academic.getCurrentContext(userId),
    ]);

    return {
      affiliations: affiliations.affiliations,
      participations: participations.participations,
      currentContext: context.context,
    };
  }

  private ownerProfile(profile: ProfileRecord) {
    return {
      id: profile.id,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      languages: profile.languages,
      skills: profile.skills,
      interests: profile.interests,
      helpTopics: profile.helpTopics,
      learningTopics: profile.learningTopics,
      professional: profile.professional,
      presentation: profile.presentation,
      visibility: profile.visibility,
      recommendationSignals: profile.recommendationSignals,
      revision: profile.revision,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private publicActivity(row: ProfileActivityRecord) {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      url: row.url,
      startedOn: row.startedOn,
      endedOn: row.endedOn,
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private emptyContributions() {
    return {
      available: false,
      items: [] as never[],
    };
  }

  private profileNotFound(): never {
    throw new NotFoundException({
      code: 'PROFILE_NOT_FOUND',
      message: 'Profile was not found',
    });
  }

  private activityNotFound(): never {
    throw new NotFoundException({
      code: 'PROFILE_ACTIVITY_NOT_FOUND',
      message: 'Profile activity was not found',
    });
  }
}
