import { Redirect } from "expo-router";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { useSession } from "@/features/session/session-provider";
import { MobileStudyFocusScreen } from "@/features/study/focus-clock-screen";

export default function StudyFocusRoute() {
  const { snapshot } = useSession();

  if (snapshot.kind !== "authenticated") return <Redirect href="/sign-in" />;

  const authorityKey = navigationAuthorityKey(
    snapshot.user.id,
    snapshot.session.id,
  );
  return <MobileStudyFocusScreen key={authorityKey} />;
}
