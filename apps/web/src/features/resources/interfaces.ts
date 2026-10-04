import type {
  FileUploadIntentResponse,
  ResourceView,
} from "@losapuntes/contracts";

export type {
  AcademicSubjectOption,
  ResourceView,
  ResourceVisibility,
} from "@losapuntes/contracts";

export type ResourceSearchResponse = {
  items: ResourceView[];
  nextCursor: string | null;
};

export type FileUploadIntent = FileUploadIntentResponse;
