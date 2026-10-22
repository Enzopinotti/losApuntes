import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { OrganizationCalendarSharePort } from "./organization-event-calendar-share";

export const nativeOrganizationCalendarSharePort: OrganizationCalendarSharePort =
  {
    createFile(filename, contents) {
      const file = new File(Paths.cache, filename);
      file.write(contents);
      return {
        uri: file.uri,
        cleanup: () => {
          if (file.exists) file.delete();
        },
      };
    },
    shareFile(uri) {
      return Sharing.shareAsync(uri, {
        dialogTitle: "Compartir evento",
        mimeType: "text/calendar",
      });
    },
  };
