import type { ResourceView } from "@losapuntes/contracts";
import { Redirect, useIsFocused, useRouter } from "expo-router";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import {
  resourceFileSizeLabel,
  resourceFileTypeLabel,
  resourceRowAccessibilityLabel,
} from "@/features/resources/resource-details-copy";
import { useSession } from "@/features/session/session-provider";

import {
  MobileSavedResourcesController,
  type MobileSavedResourcesSnapshot,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";
import { mobileResourceConsumptionApi } from "./resource-runtime";
import {
  findLoadedSavedResources,
  loadedSavedSearchSummary,
  SAVED_LIBRARY_QUERY_MAX_LENGTH,
  type SavedLibrarySort,
} from "./saved-library-filters";

const failureCopy: Record<ResourceConsumptionFailure, string> = {
  offline:
    "No hay conexión. Tus guardados se cargarán cuando vuelvas a estar en línea.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "No pudimos cargar tus guardados ahora.",
  forbidden: "La sesión ya no puede consultar estos guardados.",
  not_found: "Algunos recursos guardados ya no están disponibles.",
  restricted: "La cuenta no puede acceder a tus guardados.",
  error: "No pudimos cargar tus guardados.",
};

const removalFailureCopy: Record<ResourceConsumptionFailure, string> = {
  offline:
    "No hay conexión. El recurso sigue en la lista; volvé a intentarlo cuando estés en línea.",
  timeout:
    "No pudimos confirmar si se quitó. El recurso sigue en la lista; podés reintentar.",
  server_unavailable:
    "El servidor no pudo quitarlo. El recurso sigue en la lista; podés reintentar.",
  forbidden: "La sesión ya no puede quitar este recurso de tus guardados.",
  not_found:
    "El recurso ya no está disponible. Actualizá tus guardados para sincronizar la lista.",
  restricted: "La cuenta no puede modificar tus guardados.",
  error: "No pudimos quitar el recurso. Sigue en la lista y podés reintentar.",
};

function SavedResourceRow({
  resource,
  onOpen,
  onRemove,
  removing,
  removalPending,
  removalFailure,
}: {
  resource: ResourceView;
  onOpen: () => void;
  onRemove: () => void;
  removing: boolean;
  removalPending: boolean;
  removalFailure: ResourceConsumptionFailure | null;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={resourceRowAccessibilityLabel(
          {
            title: resource.title,
            subjectName: resource.academic.subject.name,
            authorName: resource.author?.displayName ?? null,
            mimeType: resource.file.mimeType,
            byteSize: resource.file.byteSize,
          },
          "Abrir recurso guardado",
        )}
        onPress={onOpen}
        style={styles.openButton}
      >
        <Text style={styles.rowTitle}>{resource.title}</Text>
        <Text style={styles.meta}>{resource.academic.subject.name}</Text>
        {resource.author ? (
          <Text style={styles.meta}>Por {resource.author.displayName}</Text>
        ) : null}
        <Text style={styles.meta}>
          {resourceFileTypeLabel(resource.file.mimeType)} ·{" "}
          {resourceFileSizeLabel(resource.file.byteSize)}
        </Text>
        <Text style={styles.actionLabel}>Abrir recurso</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${removalFailure ? "Reintentar quitar" : "Quitar"} ${resource.title} de guardados`}
        accessibilityState={{ disabled: removalPending }}
        disabled={removalPending}
        onPress={onRemove}
        style={[styles.removeButton, removalPending && styles.disabledButton]}
      >
        {removing ? (
          <ActivityIndicator accessibilityLabel="Quitando de guardados" />
        ) : (
          <Text style={styles.removeButtonText}>
            {removalFailure ? "Reintentar quitar" : "Quitar de guardados"}
          </Text>
        )}
      </Pressable>

      {removalFailure ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {removalFailureCopy[removalFailure]}
        </Text>
      ) : null}
    </View>
  );
}

export function SavedResourcesScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { snapshot: session } = useSession();
  const controller = useMemo(
    () => new MobileSavedResourcesController(mobileResourceConsumptionApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<MobileSavedResourcesSnapshot>(
    controller.getSnapshot(),
  );
  const [appState, setAppState] = useState(AppState.currentState);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SavedLibrarySort>("saved");
  const announcedRemoval = useRef<number | null>(null);
  const sessionKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey = isFocused && appState === "active" ? sessionKey : null;

  useEffect(() => {
    setQuery("");
    setSort("saved");
  }, [sessionKey]);

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (
      !authorityKey ||
      !isFocused ||
      appState !== "active" ||
      snapshot.kind !== "ready" ||
      snapshot.authorityKey !== authorityKey ||
      !snapshot.notice
    ) {
      announcedRemoval.current = null;
      return;
    }

    if (announcedRemoval.current === snapshot.notice.operationId) return;

    AccessibilityInfo.announceForAccessibility(
      `Se quitó ${snapshot.notice.resourceTitle} de tus guardados.`,
    );
    announcedRemoval.current = snapshot.notice.operationId;
  }, [appState, authorityKey, isFocused, snapshot]);

  useEffect(() => {
    if (!authorityKey) {
      controller.invalidate();
      return;
    }

    void controller.load(authorityKey);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller]);

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;
  const shownResources =
    current?.kind === "ready"
      ? findLoadedSavedResources(current.data.items, query, sort)
      : [];

  const refresh = () => {
    if (authorityKey) void controller.load(authorityKey);
  };

  return (
    <ProductSurface
      title="Guardados"
      description="Recursos que decidiste conservar. El servidor vuelve a autorizar cada recurso antes de mostrarlo o abrirlo."
      onRefresh={
        authorityKey &&
        !(current?.kind === "ready" && current.removingResourceId)
          ? refresh
          : undefined
      }
      refreshing={current?.kind === "loading"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver a Perfil"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backLabel}>Volver</Text>
      </Pressable>

      {!current || current.kind === "loading" ? (
        <View style={styles.card}>
          <View style={styles.loadingRow}>
            <ActivityIndicator accessibilityLabel="Cargando recursos guardados" />
            <Text style={styles.copy}>Cargando tus guardados…</Text>
          </View>
        </View>
      ) : current.kind === "failure" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureCopy[current.failure]}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={refresh}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Tu biblioteca
            </Text>
            {current.data.items.length === 0 ? (
              <>
                <Text style={styles.copy}>
                  {current.data.nextCursor
                    ? "No quedan recursos en esta página. Cargá más para seguir viendo tus guardados."
                    : "Todavía no guardaste recursos. Podés hacerlo desde cualquier detalle de recurso."}
                </Text>
                {!current.data.nextCursor ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Buscar recursos"
                    onPress={() => router.push("/(tabs)/search")}
                    style={styles.searchButton}
                  >
                    <Text style={styles.searchButtonText}>Buscar recursos</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.searchControls}>
                  <Text style={styles.fieldLabel}>Buscar en tus guardados</Text>
                  <TextInput
                    accessibilityLabel="Buscar entre los guardados cargados"
                    accessibilityHint="Busca por título, materia, autor o etiquetas entre los recursos ya cargados."
                    autoCapitalize="none"
                    maxLength={SAVED_LIBRARY_QUERY_MAX_LENGTH}
                    onChangeText={setQuery}
                    placeholder="Título, materia, autor o etiqueta"
                    returnKeyType="search"
                    style={styles.searchInput}
                    value={query}
                  />
                  {query.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Limpiar búsqueda de guardados"
                      onPress={() => setQuery("")}
                      style={styles.clearSearchButton}
                    >
                      <Text style={styles.clearSearchLabel}>
                        Limpiar búsqueda
                      </Text>
                    </Pressable>
                  ) : null}
                  <View
                    accessibilityRole="radiogroup"
                    style={styles.sortOptions}
                  >
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityLabel="Orden de guardado"
                      accessibilityState={{ checked: sort === "saved" }}
                      onPress={() => setSort("saved")}
                      style={[
                        styles.sortButton,
                        sort === "saved" && styles.sortButtonSelected,
                      ]}
                    >
                      <Text style={styles.sortLabel}>Guardado</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityLabel="Ordenar por título"
                      accessibilityState={{ checked: sort === "title" }}
                      onPress={() => setSort("title")}
                      style={[
                        styles.sortButton,
                        sort === "title" && styles.sortButtonSelected,
                      ]}
                    >
                      <Text style={styles.sortLabel}>Título A–Z</Text>
                    </Pressable>
                  </View>
                </View>
                <Text accessibilityLiveRegion="polite" style={styles.meta}>
                  {loadedSavedSearchSummary(
                    shownResources.length,
                    current.data.items.length,
                    Boolean(current.data.nextCursor),
                  )}
                </Text>
                {shownResources.length === 0 ? (
                  <Text style={styles.copy}>
                    No hay coincidencias entre los guardados cargados.
                    {current.data.nextCursor
                      ? " Cargá más para seguir buscando."
                      : " Probá con otra palabra o limpiá la búsqueda."}
                  </Text>
                ) : (
                  shownResources.map((resource) => (
                    <SavedResourceRow
                      key={resource.id}
                      resource={resource}
                      removing={current.removingResourceId === resource.id}
                      removalPending={
                        current.removingResourceId !== null ||
                        current.loadingMore
                      }
                      removalFailure={
                        current.removalFailure?.resourceId === resource.id
                          ? current.removalFailure.failure
                          : null
                      }
                      onOpen={() =>
                        router.push({
                          pathname: "/resources/[id]",
                          params: { id: resource.id, saved: "1" },
                        })
                      }
                      onRemove={() =>
                        void controller.removeSaved(
                          current.authorityKey,
                          resource.id,
                        )
                      }
                    />
                  ))
                )}
              </>
            )}
          </View>

          {current.notice ? (
            <Text style={styles.success}>
              Se quitó {current.notice.resourceTitle} de tus guardados.
            </Text>
          ) : null}

          {current.failure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureCopy[current.failure]}
            </Text>
          ) : null}

          {current.data.nextCursor ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: current.loadingMore }}
              disabled={current.loadingMore}
              onPress={() => void controller.loadMore(current.authorityKey)}
              style={[
                styles.secondaryButton,
                current.loadingMore && styles.disabledButton,
              ]}
            >
              {current.loadingMore ? (
                <ActivityIndicator accessibilityLabel="Cargando más guardados" />
              ) : (
                <Text style={styles.secondaryButtonText}>
                  {query.trim() ? "Cargar más guardados" : "Cargar más"}
                </Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  backLabel: {
    color: "#43366a",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: "#20202a",
  },
  searchControls: {
    gap: 8,
  },
  fieldLabel: {
    color: "#20202a",
    fontSize: 14,
    fontWeight: "700",
  },
  searchInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 11,
    paddingHorizontal: 12,
    color: "#20202a",
    fontSize: 15,
  },
  clearSearchButton: {
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  clearSearchLabel: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  sortOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sortButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    justifyContent: "center",
  },
  sortButtonSelected: {
    borderColor: "#43366a",
    backgroundColor: "#f1eff8",
  },
  sortLabel: {
    color: "#343247",
    fontSize: 14,
    fontWeight: "700",
  },
  row: {
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 12,
  },
  openButton: {
    minHeight: 44,
    gap: 5,
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 14,
    lineHeight: 20,
    color: "#55555f",
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
    color: "#686875",
  },
  actionLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: "#43366a",
    fontWeight: "700",
  },
  removeButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c9c9d2",
  },
  removeButtonText: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  searchButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#3446a2",
  },
  searchButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  loadingRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: "#24243a",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.48,
  },
  error: {
    color: "#9f1d1d",
    fontSize: 14,
    lineHeight: 20,
  },
  success: {
    color: "#17643a",
    fontSize: 14,
    lineHeight: 20,
  },
});
