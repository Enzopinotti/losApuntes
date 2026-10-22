import type { PublicProfileResponse } from "@losapuntes/contracts";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { mobileSearchApi } from "./search-runtime";
import { PublicProfileActivitiesController } from "./public-profile-activities-controller";
import { publicProfileActivityPresentation } from "./public-profile-activity-presentation";
import { publicProfileActivityExternalUrl } from "./public-profile-activity-link-policy";

const failureCopy = {
  offline: "No hay conexión. Revisá tu conexión e intentá de nuevo.",
  timeout: "El servidor tardó demasiado. Podés volver a intentarlo.",
  server_unavailable: "La actividad no está disponible ahora.",
  forbidden: "Ya no tenés permiso para ver esta actividad.",
  not_found: "Esta actividad ya no está disponible.",
  restricted: "La cuenta no puede acceder a esta actividad.",
  error: "No pudimos cargar más actividad.",
} as const;

export function PublicProfileActivities({
  authorityKey,
  profile,
}: {
  authorityKey: string;
  profile: PublicProfileResponse["profile"];
}) {
  const [controller] = useState(
    () => new PublicProfileActivitiesController(mobileSearchApi),
  );
  const [openingLinkKey, setOpeningLinkKey] = useState<string | null>(null);
  const [failedLinkKey, setFailedLinkKey] = useState<string | null>(null);
  const openingLink = useRef(false);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.setProfile(authorityKey, profile);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller, profile]);

  const openActivityLink = async (linkKey: string, value: string | null) => {
    const url = publicProfileActivityExternalUrl(value);
    if (!url || openingLink.current) return;

    openingLink.current = true;
    setOpeningLinkKey(linkKey);
    setFailedLinkKey(null);
    try {
      await Linking.openURL(url);
    } catch {
      setFailedLinkKey(linkKey);
    } finally {
      openingLink.current = false;
      setOpeningLinkKey(null);
    }
  };

  if (snapshot.kind !== "ready") return null;

  return (
    <View style={styles.activityList}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Actividad pública
      </Text>
      {snapshot.items.length ? (
        snapshot.items.map((activity) => {
          const presentation = publicProfileActivityPresentation(activity);
          const linkKey = `${authorityKey}:${profile.id}:${activity.id}`;
          const externalUrl = publicProfileActivityExternalUrl(activity.url);
          const externalHost = externalUrl
            ? new URL(externalUrl).hostname
            : null;
          const isOpeningLink = openingLinkKey === linkKey;
          return (
            <View key={activity.id} style={styles.activity}>
              <Text accessibilityRole="header" style={styles.activityTitle}>
                {activity.title}
              </Text>
              <View style={styles.activityDetails}>
                <Text style={styles.meta}>{presentation.typeLabel}</Text>
                {presentation.dateLabel ? (
                  <Text style={styles.meta}>{presentation.dateLabel}</Text>
                ) : null}
              </View>
              {activity.description ? (
                <Text style={styles.copy}>{activity.description}</Text>
              ) : null}
              {externalUrl && externalHost ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={
                    isOpeningLink
                      ? "Abriendo enlace externo"
                      : `Abrir enlace externo en ${externalHost}`
                  }
                  disabled={openingLinkKey !== null}
                  onPress={() => void openActivityLink(linkKey, activity.url)}
                  style={styles.activityLinkButton}
                >
                  <Text style={styles.activityLinkLabel}>
                    {isOpeningLink
                      ? "Abriendo enlace…"
                      : `Abrir enlace externo · ${externalHost}`}
                  </Text>
                </Pressable>
              ) : null}
              {failedLinkKey === linkKey ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  No pudimos abrir este enlace en tu dispositivo.
                </Text>
              ) : null}
            </View>
          );
        })
      ) : (
        <Text style={styles.meta}>Todavía no hay actividad pública.</Text>
      )}
      {snapshot.failure ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {failureCopy[snapshot.failure]}
        </Text>
      ) : null}
      {snapshot.nextCursor ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            snapshot.loadingMore
              ? "Cargando más actividad pública"
              : snapshot.failure
                ? "Reintentar carga de actividad pública"
                : "Cargar más actividad pública"
          }
          disabled={snapshot.loadingMore}
          onPress={() =>
            void controller.loadMore(authorityKey, snapshot.profileId)
          }
          style={styles.loadMoreButton}
        >
          {snapshot.loadingMore ? (
            <ActivityIndicator accessibilityLabel="Cargando actividad" />
          ) : (
            <Text style={styles.loadMoreLabel}>
              {snapshot.failure ? "Reintentar" : "Cargar más"}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  activityList: {
    gap: 8,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: "#55555f",
  },
  activity: {
    gap: 5,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e4e2ea",
  },
  activityTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    color: "#20202a",
  },
  activityDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  activityLinkButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingVertical: 8,
  },
  activityLinkLabel: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  meta: {
    fontSize: 13,
    lineHeight: 19,
    color: "#656570",
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
  loadMoreButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  loadMoreLabel: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
});
