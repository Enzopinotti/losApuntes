import type { ConnectionView } from "./interfaces";

export interface NetworkConnectionGroups {
  incomingRequests: ConnectionView[];
  otherRelationships: ConnectionView[];
}

/** Presentation-only grouping: the server still owns status and authorization. */
export function groupNetworkConnections(
  connections: readonly ConnectionView[],
): NetworkConnectionGroups {
  const incomingRequests: ConnectionView[] = [];
  const otherRelationships: ConnectionView[] = [];

  for (const connection of connections) {
    if (connection.status === "pending" && connection.incoming) {
      incomingRequests.push(connection);
    } else {
      otherRelationships.push(connection);
    }
  }

  return { incomingRequests, otherRelationships };
}

export function networkConnectionStatusLabel(
  connection: Pick<ConnectionView, "status" | "incoming">,
): string {
  switch (connection.status) {
    case "pending":
      return connection.incoming ? "Solicitud recibida" : "Solicitud enviada";
    case "accepted":
      return "Conexión aceptada";
    case "declined":
      return "Solicitud rechazada";
    case "disconnected":
      return "Conexión finalizada";
  }
}
