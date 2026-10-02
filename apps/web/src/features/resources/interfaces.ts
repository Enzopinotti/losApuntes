import type { ResourceView } from "@losapuntes/contracts";

export type {
  AcademicSubjectOption,
  ResourceView,
  ResourceVisibility,
} from "@losapuntes/contracts";

export type ResourceSearchResponse = {
  items: ResourceView[];
  nextCursor: string | null;
};

export type FileUploadIntent = {
  file: {
    id: string;
    filename: string;
    mimeType: string;
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
