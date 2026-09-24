import { Redirect } from "expo-router";

import { useSession } from "@/features/session/session-provider";

export default function IndexRoute() {
  const { snapshot } = useSession();

  if (snapshot.kind === "authenticated") {
    return <Redirect href="/home" />;
  }

  return <Redirect href="/sign-in" />;
}
