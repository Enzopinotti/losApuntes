import { useLocalSearchParams } from "expo-router";

import { CommunityQuestionScreen } from "@/features/community/community-screens";

export default function QuestionRoute() {
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  return <CommunityQuestionScreen questionId={questionId} />;
}
