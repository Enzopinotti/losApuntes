import type { ResourceView } from "@losapuntes/contracts";

export type ResourceCitation = Readonly<{
  text: string;
  publicLinkIncluded: boolean;
  visibility: ResourceView["visibility"];
  attributionVerified: false;
  grantsResourceAccess: false;
}>;

export function buildResourceCitation(
  resource: Pick<ResourceView, "id" | "title" | "visibility" | "academic" | "author">,
  origin: string,
): ResourceCitation;
