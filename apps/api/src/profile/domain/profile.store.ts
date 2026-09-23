import type { ProfileActivityRecord, ProfileRecord } from './profile.types';

export const PROFILE_STORE = Symbol('PROFILE_STORE');

export class ProfileAlreadyExistsError extends Error {
  constructor() {
    super('Profile already exists');
    this.name = 'ProfileAlreadyExistsError';
  }
}

export type CreateProfileRecord = Omit<
  ProfileRecord,
  'createdAt' | 'updatedAt'
>;

export type UpdateProfileRecord = Partial<
  Pick<
    ProfileRecord,
    | 'displayName'
    | 'bio'
    | 'avatarUrl'
    | 'languages'
    | 'skills'
    | 'interests'
    | 'helpTopics'
    | 'learningTopics'
    | 'professional'
    | 'presentation'
    | 'visibility'
    | 'recommendationSignals'
  >
>;

export type CreateProfileActivityRecord = Omit<
  ProfileActivityRecord,
  'createdAt' | 'updatedAt'
>;

export type UpdateProfileActivityRecord = Partial<
  Pick<
    ProfileActivityRecord,
    'type' | 'title' | 'description' | 'url' | 'startedOn' | 'endedOn'
  >
>;

export interface ProfileStore {
  findProfileByUserId(userId: string): Promise<ProfileRecord | null>;
  findProfileById(id: string): Promise<ProfileRecord | null>;
  createProfile(input: CreateProfileRecord): Promise<ProfileRecord>;
  updateProfile(
    userId: string,
    expectedRevision: number,
    patch: UpdateProfileRecord,
  ): Promise<ProfileRecord | null>;

  listActivitiesForUser(userId: string): Promise<ProfileActivityRecord[]>;
  findActivityForUser(
    userId: string,
    id: string,
  ): Promise<ProfileActivityRecord | null>;
  createActivity(
    input: CreateProfileActivityRecord,
  ): Promise<ProfileActivityRecord>;
  updateActivity(
    userId: string,
    id: string,
    expectedRevision: number,
    patch: UpdateProfileActivityRecord,
  ): Promise<ProfileActivityRecord | null>;
  deleteActivity(
    userId: string,
    id: string,
    expectedRevision: number,
  ): Promise<boolean>;
}
