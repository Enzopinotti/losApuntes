export type ProfileVisibility =
  "public" | "university" | "connections" | "private";

export type ProfileSection =
  | "about"
  | "academic"
  | "learning"
  | "activities"
  | "skills"
  | "professional"
  | "contributions";

export type ProfileActivityType =
  "project" | "research" | "club" | "volunteering" | "academic_work";

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

export type ProfileActivity = {
  id: string;
  type: ProfileActivityType;
  title: string;
  description: string | null;
  url: string | null;
  startedOn: string | null;
  endedOn: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type AcademicProfileProjection = {
  affiliations: unknown[];
  participations: unknown[];
  currentContext: unknown | null;
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
      contributions: {
        available: false;
        items: never[];
      };
      onboardingRequired: false;
    };

export type PublicProfileResponse = {
  profile: {
    id: string;
    revision: number;
    presentation: {
      accentPreset: string;
      coverPreset: string;
      sectionOrder: ProfileSection[];
    };
    about?: {
      displayName: string;
      bio: string | null;
      avatarUrl: string | null;
    };
    academic?: AcademicProfileProjection;
    learning?: {
      helpTopics: string[];
      learningTopics: string[];
    };
    activities?: ProfileActivity[];
    skills?: {
      languages: string[];
      skills: string[];
      interests: string[];
    };
    professional?: {
      headline: string | null;
    };
    contributions?: {
      available: false;
      items: never[];
    };
  };
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
