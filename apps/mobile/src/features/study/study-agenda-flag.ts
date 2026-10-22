export function studyAgendaVisible(raw: string | undefined) {
  return raw === "true";
}

export const MOBILE_STUDY_AGENDA_VISIBLE = studyAgendaVisible(
  process.env.EXPO_PUBLIC_STUDY_AGENDA_ENABLED,
);
