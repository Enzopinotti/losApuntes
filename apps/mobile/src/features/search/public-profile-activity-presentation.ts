import type { ProfileActivity } from "@losapuntes/contracts";

const activityTypeLabels: Record<ProfileActivity["type"], string> = {
  project: "Proyecto",
  research: "Investigación",
  club: "Club",
  volunteering: "Voluntariado",
  academic_work: "Trabajo académico",
};

export type PublicProfileActivityPresentation = {
  typeLabel: string;
  dateLabel: string | null;
};

export function publicProfileActivityPresentation(
  activity: Pick<ProfileActivity, "type" | "startedOn" | "endedOn">,
): PublicProfileActivityPresentation {
  const { startedOn, endedOn } = activity;
  let dateLabel: string | null = null;

  if (startedOn && endedOn) {
    dateLabel = startedOn === endedOn ? startedOn : `${startedOn} – ${endedOn}`;
  } else if (startedOn) {
    dateLabel = `Desde ${startedOn}`;
  } else if (endedOn) {
    dateLabel = `Hasta ${endedOn}`;
  }

  return {
    typeLabel: activityTypeLabels[activity.type],
    dateLabel,
  };
}
