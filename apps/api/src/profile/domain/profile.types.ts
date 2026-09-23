export const PROFILE_SECTIONS = [
  'about',
  'academic',
  'learning',
  'activities',
  'skills',
  'professional',
  'contributions',
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const PROFILE_VISIBILITIES = [
  'public',
  'university',
  'connections',
  'private',
] as const;

export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export const PROFILE_ACTIVITY_TYPES = [
  'project',
  'research',
  'club',
  'volunteering',
  'academic_work',
] as const;

export type ProfileActivityType = (typeof PROFILE_ACTIVITY_TYPES)[number];

export const PROFILE_ACCENT_PRESETS = [
  'default',
  'indigo',
  'emerald',
  'amber',
  'rose',
  'slate',
] as const;

export type ProfileAccentPreset = (typeof PROFILE_ACCENT_PRESETS)[number];

export const PROFILE_COVER_PRESETS = [
  'none',
  'gradient',
  'paper',
  'campus',
] as const;

export type ProfileCoverPreset = (typeof PROFILE_COVER_PRESETS)[number];

export type ProfileVisibilityPolicy = Record<
  ProfileSection,
  ProfileVisibility
>;

export type ProfileRecommendationSignals = {
  academicContext: boolean;
  learning: boolean;
  skillsInterests: boolean;
};

export type ProfileProfessionalSettings = {
  headline: string | null;
  careerDiscoveryOptIn: boolean;
};

export type ProfilePresentation = {
  accentPreset: ProfileAccentPreset;
  coverPreset: ProfileCoverPreset;
  sectionOrder: ProfileSection[];
};

export type ProfileRecord = {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  languages: string[];
  skills: string[];
  interests: string[];
  helpTopics: string[];
  learningTopics: string[];
  professional: ProfileProfessionalSettings;
  presentation: ProfilePresentation;
  visibility: ProfileVisibilityPolicy;
  recommendationSignals: ProfileRecommendationSignals;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProfileActivityRecord = {
  id: string;
  userId: string;
  type: ProfileActivityType;
  title: string;
  description: string | null;
  url: string | null;
  startedOn: string | null;
  endedOn: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};
