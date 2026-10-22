import { useLocalSearchParams } from "expo-router";

import { QaNeedsHelpScreen } from "@/features/community/qa-needs-help-screen";
import { subjectQuestionsRouteId } from "@/features/community/subject-questions-policy";

export default function QaNeedsHelpRoute() {
  const { subjectId } = useLocalSearchParams<{
    subjectId?: string | string[];
  }>();
  return <QaNeedsHelpScreen subjectId={subjectQuestionsRouteId(subjectId)} />;
}
