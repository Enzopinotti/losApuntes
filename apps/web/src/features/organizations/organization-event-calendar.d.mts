import type { OrganizationEvent } from "./interfaces.js";

export function serializeOrganizationEventCalendar(
  event: OrganizationEvent,
  generatedAt?: Date | string | number,
): string | null;
