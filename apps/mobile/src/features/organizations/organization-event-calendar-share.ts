import type { OrganizationEvent } from "@losapuntes/contracts";
import { serializeOrganizationEventCalendar } from "@losapuntes/contracts/organization-event-calendar";

export type OrganizationCalendarTemporaryFile = {
  uri: string;
  cleanup(): void | Promise<void>;
};

export type OrganizationCalendarSharePort = {
  createFile(
    filename: string,
    contents: string,
  ):
    | OrganizationCalendarTemporaryFile
    | Promise<OrganizationCalendarTemporaryFile>;
  shareFile(uri: string): void | Promise<void>;
};

export async function shareOrganizationEventCalendar(
  event: OrganizationEvent,
  port: OrganizationCalendarSharePort,
  generatedAt = new Date(),
): Promise<void> {
  const contents = serializeOrganizationEventCalendar(event, generatedAt);
  if (!contents) throw new Error("Event cannot be exported as a calendar file");

  const safeId = event.id.replace(/[^a-zA-Z0-9._-]/gu, "-").slice(0, 64);
  const filename = `organization-event-${safeId || "event"}-${generatedAt.getTime()}.ics`;
  const file = await port.createFile(filename, contents);
  try {
    await port.shareFile(file.uri);
  } finally {
    try {
      await file.cleanup();
    } catch {
      // Cache cleanup must not replace the result of the system share sheet.
    }
  }
}
