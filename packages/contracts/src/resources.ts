export type ResourceVisibility = "private" | "shared" | "public";

export type AcademicSubjectOption = {
  id: string;
  name: string;
};

export type ResourceView = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  visibility: ResourceVisibility;
  author: {
    profileId: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  academic: {
    subject: AcademicSubjectOption;
    courseOffering: AcademicSubjectOption | null;
  };
  file: {
    id: string;
    filename: string;
    mimeType: string;
    byteSize: number;
  };
  capabilities: {
    edit: boolean;
    manageShares: boolean;
  };
  revision: number;
  createdAt: string;
  updatedAt: string;
};
