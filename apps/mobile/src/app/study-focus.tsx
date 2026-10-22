import { Redirect, useLocalSearchParams } from "expo-router";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { useSession } from "@/features/session/session-provider";
import { studyFocusMinutesFromParam } from "@/features/study/focus-clock";
import { MobileStudyFocusScreen } from "@/features/study/focus-clock-screen";

export default function StudyFocusRoute() {
  const { snapshot } = useSession();
  const { minutes } = useLocalSearchParams<{ minutes?: string | string[] }>();
  const suggestedMinutes = studyFocusMinutesFromParam(minutes) ?? 25;

  if (snapshot.kind !== "authenticated") return <Redirect href="/sign-in" />;

  const authorityKey = navigationAuthorityKey(
    snapshot.user.id,
    snapshot.session.id,
  );
  return (
    <MobileStudyFocusScreen
      key={`${authorityKey}:${suggestedMinutes}`}
      initialStudyMinutes={suggestedMinutes}
    />
  );
}
