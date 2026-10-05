import { useLocalSearchParams } from "expo-router";

import { MobileOrganizationDetailScreen } from "@/features/organizations/organization-detail-screen";

export default function OrganizationDetailRoute() {
  const { organizationId } = useLocalSearchParams<{
    organizationId?: string | string[];
  }>();
  const id = Array.isArray(organizationId)
    ? (organizationId[0] ?? "")
    : (organizationId ?? "");

  return <MobileOrganizationDetailScreen organizationId={id} />;
}
