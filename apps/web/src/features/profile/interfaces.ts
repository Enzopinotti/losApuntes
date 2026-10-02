import type {
  AcademicProfileProjection,
  ProfileActivity,
  ProfileSection,
  ProfileVisibility,
} from "@losapuntes/contracts";

export type {
  AcademicProfileProjection,
  ProfileActivity,
  ProfileActivityType,
  ProfileSection,
  ProfileVisibility,
  PublicProfileResponse,
} from "@losapuntes/contracts";

export type OwnerProfile = {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  languages: string[];
  skills: string[];
  interests: string[];
  helpTopics: string[];
  learningTopics: string[];
  professional: {
    headline: string | null;
    careerDiscoveryOptIn: boolean;
  };
  presentation: {
    accentPreset: string;
    coverPreset: string;
    sectionOrder: ProfileSection[];
  };
  visibility: Record<ProfileSection, ProfileVisibility>;
  recommendationSignals: {
    academicContext: boolean;
    learning: boolean;
    skillsInterests: boolean;
  };
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type ProfileActivityPageResponse = {
  items: ProfileActivity[];
  nextCursor: string | null;
};

export type OwnerProfileResponse =
  | {
      profile: null;
      onboardingRequired: true;
    }
  | {
      profile: OwnerProfile;
      academic: AcademicProfileProjection;
      activities: ProfileActivity[];
      activitiesNextCursor: string | null;
      activitiesLimit: number;
      contributions: {
        available: false;
        items: never[];
      };
      onboardingRequired: false;
    };

export type UpdateProfileInput = {
  expectedRevision: number;
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  languages?: string[];
  skills?: string[];
  interests?: string[];
  helpTopics?: string[];
  learningTopics?: string[];
  professional?: {
    headline?: string | null;
    careerDiscoveryOptIn?: boolean;
  };
  visibility?: Partial<Record<ProfileSection, ProfileVisibility>>;
  recommendationSignals?: {
    academicContext?: boolean;
    learning?: boolean;
    skillsInterests?: boolean;
  };
};
