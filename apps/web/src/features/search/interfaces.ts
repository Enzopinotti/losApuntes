import type { ResourceView } from "../resources/interfaces";

export type SearchScope = "all" | "resources" | "subjects" | "people";

export type SearchSubjectResult = {
  id: string;
  name: string;
  aliases: string[];
  kind: "subject";
};

export type SearchPersonResult = {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type SearchResponse = {
  query: string;
  scope: SearchScope;
  results: {
    resources: ResourceView[];
    subjects: SearchSubjectResult[];
    people: SearchPersonResult[];
  };
};

export type ContextualDiscoveryResponse = {
  subjects: Array<{
    subject: {
      id: string;
      name: string;
    };
    resources: ResourceView[];
  }>;
};
