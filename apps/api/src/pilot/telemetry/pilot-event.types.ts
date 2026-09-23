export const PILOT_EVENT_NAMES = [
  'pilot.home_viewed',
  'pilot.search_performed',
  'pilot.resource_created',
  'pilot.question_created',
  'pilot.answer_created',
  'pilot.follow_created',
  'pilot.connection_accepted',
] as const;

export type PilotEventName = (typeof PILOT_EVENT_NAMES)[number];

export interface PilotEventRecord {
  id: string;
  event: PilotEventName;
  userId?: string;
  subjectId?: string;
  resultCount?: number;
  createdAt: Date;
}
