import type { StudyNextActionTask } from "./study-next-actions-api";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type StudyNextActionDestination =
  | { pathname: "/questions/[questionId]"; params: { questionId: string } }
  | { pathname: "/resources/[id]"; params: { id: string } };

export function studyNextActionDestination(
  task: StudyNextActionTask,
): StudyNextActionDestination | null {
  if (!UUID_V4.test(task.id)) return null;
  if (task.kind === "question") {
    return {
      pathname: "/questions/[questionId]",
      params: { questionId: task.id },
    };
  }
  if (task.kind === "resource") {
    return { pathname: "/resources/[id]", params: { id: task.id } };
  }
  return null;
}

export function studyNextActionTaskLabel(task: StudyNextActionTask): string {
  return task.kind === "question" ? "Pregunta" : "Apunte";
}
