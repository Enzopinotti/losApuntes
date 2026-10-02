import { useLocalSearchParams } from "expo-router";

import { PublicProfileScreen } from "@/features/search/search-result-screens";

export default function PublicProfileRoute() {
  const { profileId } = useLocalSearchParams<{
    profileId?: string | string[];
  }>();
  const id = Array.isArray(profileId)
    ? (profileId[0] ?? "")
    : (profileId ?? "");
  return <PublicProfileScreen profileId={id} />;
}
