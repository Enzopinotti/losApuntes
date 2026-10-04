import { useLocalSearchParams } from "expo-router";

import { MobileResourceDetailsScreen } from "@/features/resources/resource-details-screen";

export default function ResourceDetailsRoute() {
  const { id, saved } = useLocalSearchParams<{
    id?: string | string[];
    saved?: string | string[];
  }>();
  const resourceId = Array.isArray(id) ? (id[0] ?? "") : (id ?? "");
  const savedParam = Array.isArray(saved) ? saved[0] : saved;
  return (
    <MobileResourceDetailsScreen
      resourceId={resourceId}
      initialSaved={savedParam === "1" ? true : null}
    />
  );
}
