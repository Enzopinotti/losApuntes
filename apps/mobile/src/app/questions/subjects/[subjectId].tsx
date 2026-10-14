import { useLocalSearchParams } from "expo-router";

import { SubjectQuestionsScreen } from "@/features/community/subject-questions-screen";
import { subjectQuestionsRouteId } from "@/features/community/subject-questions-policy";

export default function SubjectQuestionsRoute() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  return (
    <SubjectQuestionsScreen subjectId={subjectQuestionsRouteId(subjectId)} />
  );
}
