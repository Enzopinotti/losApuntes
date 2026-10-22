import type { OrganizationEvent } from "./organizations.js";

export declare function serializeOrganizationEventCalendar(
  event: OrganizationEvent,
  generatedAt?: Date,
): string | null;
