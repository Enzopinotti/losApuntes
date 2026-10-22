import { Link, useIsFocused } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { useSession } from "@/features/session/session-provider";

import { MOBILE_PERSISTENT_COLLECTIONS_VISIBLE } from "./persistent-collections-flag";
import {
  ResourceCollectionPickerController,
  type ResourceCollectionPickerSnapshot,
} from "./resource-collection-picker-controller";
import { mobileStudyCollectionsApi } from "./study-collections-runtime";

export function ResourceCollectionSaveAction({
  resourceId,
  resourceTitle,
}: {
  resourceId: string;
  resourceTitle: string;
}) {
  const focused = useIsFocused();
  const { snapshot: session } = useSession();
  const [appState, setAppState] = useState(AppState.currentState);
  const [expanded, setExpanded] = useState(false);
  const controller = useMemo(
    () => new ResourceCollectionPickerController(mobileStudyCollectionsApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<ResourceCollectionPickerSnapshot>(
    controller.getSnapshot(),
  );

  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey =
    focused && appState === "active" ? sessionAuthority : null;
  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!authorityKey || !MOBILE_PERSISTENT_COLLECTIONS_VISIBLE) {
      controller.close();
      setExpanded(false);
    }
    return () => controller.close();
  }, [authorityKey, controller, resourceId]);

  useEffect(() => () => controller.dispose(), [controller]);

  const current =
    snapshot.kind !== "idle" &&
    snapshot.authorityKey === authorityKey &&
    snapshot.resourceId === resourceId
      ? snapshot
      : null;

  const open = () => {
    const scope = authorityKey;
    if (!scope) return;
    setExpanded(true);
    void controller.open(scope, resourceId);
  };

  const close = () => {
    setExpanded(false);
    controller.close();
  };

  if (
    !MOBILE_PERSISTENT_COLLECTIONS_VISIBLE ||
    session.kind !== "authenticated"
  ) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Agregar ${resourceTitle} a una colección de estudio`}
        accessibilityState={{ disabled: !authorityKey }}
        disabled={!authorityKey}
        onPress={expanded ? close : open}
        style={[styles.toggleButton, !authorityKey && styles.disabled]}
      >
        <Text style={styles.toggleLabel}>
          {expanded ? "Cerrar colecciones" : "Agregar a colección"}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.picker}>
          <Text accessibilityRole="header" style={styles.heading}>
            Guardar en una colección
          </Text>
          {current?.kind === "loading" || !current ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator accessibilityLabel="Cargando colecciones" />
              <Text style={styles.copy}>Cargando tus colecciones…</Text>
            </View>
          ) : (
            <>
              {current.error ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {current.error}
                </Text>
              ) : null}
              {current.notice ? (
                <Text accessibilityLiveRegion="polite" style={styles.success}>
                  {current.notice}
                </Text>
              ) : null}
              {current.items.map((collection) => {
                const busy = current.busyCollectionId === collection.id;
                const saved = current.savedCollectionIds.includes(
                  collection.id,
                );
                return (
                  <View key={collection.id} style={styles.collectionRow}>
                    <View style={styles.collectionCopy}>
                      <Text style={styles.collectionTitle}>
                        {collection.title}
                      </Text>
                      <Text style={styles.meta}>
                        {collection.resourceCount} apuntes
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        saved
                          ? `Apunte agregado a ${collection.title}`
                          : `Guardar apunte en ${collection.title}`
                      }
                      accessibilityState={{
                        disabled:
                          saved || busy || current.busyCollectionId !== null,
                      }}
                      disabled={
                        saved ||
                        busy ||
                        current.busyCollectionId !== null ||
                        current.loadingMore
                      }
                      onPress={() => void controller.save(collection.id)}
                      style={[
                        styles.saveButton,
                        (saved || busy || current.busyCollectionId !== null) &&
                          styles.disabled,
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator accessibilityLabel="Guardando apunte" />
                      ) : (
                        <Text style={styles.saveLabel}>
                          {saved ? "Agregado" : "Guardar"}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
              {!current.items.length && !current.error ? (
                <>
                  <Text style={styles.copy}>
                    Todavía no tenés colecciones de estudio.
                  </Text>
                  <Link href="/study-collections" asChild>
                    <Pressable
                      accessibilityRole="link"
                      onPress={close}
                      style={styles.manageLink}
                    >
                      <Text style={styles.manageLinkLabel}>
                        Crear una colección
                      </Text>
                    </Pressable>
                  </Link>
                </>
              ) : null}
              {!current.items.length && current.error ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (authorityKey) {
                      void controller.open(authorityKey, resourceId);
                    }
                  }}
                  style={styles.manageLink}
                >
                  <Text style={styles.manageLinkLabel}>Reintentar</Text>
                </Pressable>
              ) : null}
              {current.nextCursor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: current.loadingMore }}
                  disabled={
                    current.loadingMore || current.busyCollectionId !== null
                  }
                  onPress={() => void controller.loadMore()}
                  style={styles.manageLink}
                >
                  {current.loadingMore ? (
                    <ActivityIndicator accessibilityLabel="Cargando más colecciones" />
                  ) : (
                    <Text style={styles.manageLinkLabel}>
                      Mostrar más colecciones
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  toggleButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  toggleLabel: { color: "#24243a", fontSize: 15, fontWeight: "700" },
  picker: {
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e2e8",
    padding: 12,
    backgroundColor: "#fbfbfd",
  },
  heading: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: { fontSize: 13, lineHeight: 19, color: "#55555f" },
  meta: { fontSize: 12, lineHeight: 18, color: "#686875" },
  error: { color: "#9f1d1d", fontSize: 13, lineHeight: 19 },
  success: { color: "#17643a", fontSize: 13, lineHeight: 19 },
  loadingRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  collectionRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 8,
  },
  collectionCopy: { flex: 1, gap: 2 },
  collectionTitle: {
    color: "#20202a",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  saveButton: {
    minWidth: 82,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: "#3446a2",
  },
  saveLabel: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  manageLink: {
    minHeight: 42,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  manageLinkLabel: { color: "#43366a", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.48 },
});
