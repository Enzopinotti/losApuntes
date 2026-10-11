import type { QuestionScope } from "./community-controller";
import type { CommunityAuthorityGate } from "./use-community-authority";
import { ACADEMIC_CONTEXT_HOME_ROUTE } from "../search/search-contextual-discovery-copy";

export { ACADEMIC_CONTEXT_HOME_ROUTE };

export type CommunityQuestionNextStep =
  "gated" | "revalidate" | "configure" | "compose";

/**
 * Only a server-validated ready/no-current-subject state may guide the
 * student to Home. An unresolved participation must be revalidated instead.
 */
export function communityQuestionNextStep(
  gate: CommunityAuthorityGate,
  scopeKind: QuestionScope["kind"],
): CommunityQuestionNextStep {
  if (gate !== "ready") return "gated";
  if (scopeKind === "unresolved") return "revalidate";
  if (scopeKind === "all") return "configure";
  return "compose";
}
