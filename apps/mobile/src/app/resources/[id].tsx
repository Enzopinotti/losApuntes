import { useLocalSearchParams } from "expo-router";

import { ResourceDetailsScreen } from "@/features/search/search-result-screens";

export default function ResourceDetailsRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const resourceId = Array.isArray(id) ? (id[0] ?? "") : (id ?? "");
  return <ResourceDetailsScreen resourceId={resourceId} />;
}
