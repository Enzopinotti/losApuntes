export type OrganizationType =
  | "student_center"
  | "association"
  | "club"
  | "lab"
  | "research_group"
  | "alumni_association"
  | "incubator"
  | "cultural_sports"
  | "career_community";

export type OrganizationManagerRole = "owner" | "admin" | "editor";
export type OrganizationVerificationState = "unverified" | "verified";

export type OrganizationCard = {
  id: string;
  name: string;
  type: OrganizationType;
  avatarUrl: string | null;
  verificationState: OrganizationVerificationState;
  institution: { id: string; name: string };
  viewer?: { following: boolean };
};

export type OrganizationPost = {
  id: string;
  title: string | null;
  body: string;
  source: {
    kind: "campus_organization";
    organization: {
      id: string;
      name: string;
      verificationState: OrganizationVerificationState;
    };
  };
  academic: {
    subject: { id: string; name: string };
  } | null;
  revision: number;
  publishedAt: string;
  updatedAt: string;
};

export type OrganizationEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  locationLabel: string | null;
  externalUrl: string | null;
  state: "scheduled" | "cancelled";
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationDetail = {
  id: string;
  name: string;
  type: OrganizationType;
  about: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  websiteUrl: string | null;
  claimState: "claimed" | "unclaimed";
  verificationState: OrganizationVerificationState;
  scope: {
    institution: { id: string; name: string };
    campus: { id: string; name: string } | null;
    academicUnit: { id: string; name: string } | null;
    program: { id: string; name: string } | null;
  };
  followerCount: number;
  managers: Array<{
    role: OrganizationManagerRole;
    profile: {
      profileId: string | null;
      displayName: string;
      avatarUrl: string | null;
    };
  }>;
  links: Array<{ id: string; label: string; url: string }>;
  featuredResources: Array<{
    id: string;
    title: string;
    description: string | null;
    academic: { subject: { id: string; name: string } };
  }>;
  posts: OrganizationPost[];
  events: OrganizationEvent[];
  viewer?: {
    following: boolean;
    managementRole: OrganizationManagerRole | null;
  };
  revision: number;
  managementRevision?: number;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationManagement = {
  organization: {
    id: string;
    name: string;
    revision: number;
    managementRevision: number;
    verificationState: OrganizationVerificationState;
  };
  actorRole: OrganizationManagerRole;
  managers: Array<{
    role: OrganizationManagerRole;
    profile: {
      profileId: string | null;
      displayName: string;
      avatarUrl: string | null;
    };
    addedAt: string;
  }>;
};

export type AcademicInstitutionOption = {
  id: string;
  name: string;
};
