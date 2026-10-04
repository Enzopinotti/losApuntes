export type ResourceVisibility = "private" | "shared" | "public";

export const RESOURCE_FILE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ResourceFileMimeType = (typeof RESOURCE_FILE_MIME_TYPES)[number];

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

export type FileUploadIntentResponse = {
  file: {
    id: string;
    filename: string;
    mimeType: ResourceFileMimeType;
    expectedByteSize: number;
    state: "pending";
  };
  upload: {
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expiresAt: string;
  };
};

export type ResourceCreateInput = {
  assetId: string;
  title: string;
  description?: string;
  tags: string[];
  subjectId: string;
  courseOfferingId?: string;
  visibility: ResourceVisibility;
};
