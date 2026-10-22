import type { ResourceView } from "../resources/interfaces";
import type { ContextualDiscoveryResponse } from "../search/interfaces";
import type { StudySession } from "./study-session-plan.mjs";

export function resourceToStudyHandoffPlan(
  resource: ResourceView,
  contextual: ContextualDiscoveryResponse,
  expectedResourceId: string,
): StudySession | null;
