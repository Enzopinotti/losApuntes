import { Redirect, Stack } from "expo-router";

import { communityQuestionRouteGate } from "@/features/community/community-controller";
import { useSession } from "@/features/session/session-provider";

export default function QuestionsLayout() {
  const { snapshot } = useSession();
  const gate = communityQuestionRouteGate(snapshot.kind);

  if (gate === "restoring") return null;
  if (gate === "redirect") return <Redirect href="/sign-in" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
