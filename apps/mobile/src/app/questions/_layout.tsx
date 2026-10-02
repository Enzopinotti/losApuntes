import { Redirect, Stack } from "expo-router";

import { canAccessCommunityQuestionRoute } from "@/features/community/community-controller";
import { useSession } from "@/features/session/session-provider";

export default function QuestionsLayout() {
  const { snapshot } = useSession();

  if (!canAccessCommunityQuestionRoute(snapshot.kind)) {
    return <Redirect href="/sign-in" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
