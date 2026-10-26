import type { ResourceView } from "@losapuntes/contracts";
import { Redirect, useIsFocused, useRouter } from "expo-router";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  type FlatList,
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
import { MobileResourceShareAction } from "./resource-share-action";
import { useSession } from "@/features/session/session-provider";
import { subjectResourcesSearchAction } from "@/features/search/search-subject-navigation";

import {
  MobileSavedResourcesController,
  type MobileSavedResourcesSnapshot,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";
import {
  mobileResourceConsumptionApi,
  mobileSavedSubjectFacetsApi,
} from "./resource-runtime";
import {
  MobileSavedSubjectFacetsController,
  type SavedSubjectFacetsSnapshot,
} from "./saved-subject-facets";
import {
  savedSubjectQuestionsAction,
  type SavedSubjectQuestionsAction,
} from "./saved-subject-questions-action";
import {
  findLoadedSavedResources,
  loadedSavedSearchSummary,
  SAVED_LIBRARY_QUERY_MAX_LENGTH,
  type SavedLibrarySort,
} from "./saved-library-filters";

/** Check only while focused + active; never poll in the background. */
export const SAVED_FOREGROUND_SYNC_INTERVAL_MS = 90_000;

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
  onOpenQuestions,
  onRemove,
  removing,
  removalPending,
  removalFailure,
}: {
  resource: ResourceView;
  onOpen: () => void;
  onOpenQuestions: (action: SavedSubjectQuestionsAction) => void;
  onRemove: () => void;
  removing: boolean;
  removalPending: boolean;
  removalFailure: ResourceConsumptionFailure | null;
}) {
  const questionsAction = savedSubjectQuestionsAction(resource);

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

      {questionsAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={questionsAction.accessibilityLabel}
          accessibilityHint={questionsAction.accessibilityHint}
          onPress={() => onOpenQuestions(questionsAction)}
          style={styles.questionsButton}
        >
          <Text style={styles.actionLabel}>Preguntas de la materia</Text>
        </Pressable>
      ) : null}

      <MobileResourceShareAction
        key={resource.id}
        resourceId={resource.id}
        resourceTitle={resource.title}
      />

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
  const subjectsController = useMemo(
    () => new MobileSavedSubjectFacetsController(mobileSavedSubjectFacetsApi),
    [],
  );
  const [subjectSnapshot, setSubjectSnapshot] =
    useState<SavedSubjectFacetsSnapshot>(subjectsController.getSnapshot());
  const [appState, setAppState] = useState(AppState.currentState);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SavedLibrarySort>("saved");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    null,
  );
  const announcedRemoval = useRef<number | null>(null);
  const listRef = useRef<FlatList<ResourceView> | null>(null);
  const sessionKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey = isFocused && appState === "active" ? sessionKey : null;
  const searchQuery = query.trim().replace(/\s+/gu, " ");
  const searchEligible = searchQuery.length === 0 || searchQuery.length >= 2;

  useEffect(() => {
    setQuery("");
    setSort("saved");
    setSelectedSubjectId(null);
  }, [sessionKey]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [sessionKey, query, selectedSubjectId, sort]);

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(
    () => subjectsController.subscribe(setSubjectSnapshot),
    [subjectsController],
  );

  useEffect(() => {
    if (!authorityKey) {
      subjectsController.invalidate();
      return;
    }
    void subjectsController.load(authorityKey);
    return () => subjectsController.invalidate(authorityKey);
  }, [authorityKey, subjectsController]);

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

    if (!searchEligible) {
      controller.invalidate(authorityKey);
      return;
    }
    const timeout = setTimeout(
      () => {
        void controller.load(
          authorityKey,
          searchQuery || undefined,
          selectedSubjectId ?? undefined,
          sort,
        );
      },
      searchQuery ? 300 : 0,
    );
    return () => {
      clearTimeout(timeout);
      controller.invalidate(authorityKey);
    };
  }, [
    authorityKey,
    controller,
    searchEligible,
    searchQuery,
    selectedSubjectId,
    sort,
  ]);

  useEffect(() => {
    if (!authorityKey || !searchEligible) return;
    const interval = setInterval(() => {
      void controller.sync(authorityKey);
      void subjectsController.sync(authorityKey);
    }, SAVED_FOREGROUND_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [authorityKey, controller, subjectsController, searchEligible]);

  const syncNoticeForScroll =
    snapshot.kind === "ready" ? snapshot.syncNotice : null;
  useEffect(() => {
    if (syncNoticeForScroll === "updated") {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [syncNoticeForScroll]);

  const current =
    snapshot.kind !== "idle" &&
    snapshot.authorityKey === authorityKey &&
    (snapshot.searchQuery ?? "") === searchQuery &&
    (snapshot.subjectId ?? "") === (selectedSubjectId ?? "") &&
    (snapshot.order ?? "saved") === sort
      ? snapshot
      : null;
  const activeFacetSnapshot =
    subjectSnapshot.kind !== "idle" &&
    subjectSnapshot.authorityKey === authorityKey
      ? subjectSnapshot
      : null;
  const subjectGroups =
    activeFacetSnapshot?.kind === "ready" ? activeFacetSnapshot.data.items : [];
  const activeSubjectId = selectedSubjectId;
  const activeSubject =
    subjectGroups.find((subject) => subject.subjectId === selectedSubjectId) ??
    null;
  const shownResources =
    current?.kind === "ready"
      ? findLoadedSavedResources(current.data.items, "", "saved", null)
      : [];

  const exploreSelectedSubject = activeSubject
    ? subjectResourcesSearchAction({
        subjectId: activeSubject.subjectId,
        subjectName: activeSubject.name,
      })
    : null;

  useEffect(() => {
    if (
      selectedSubjectId &&
      activeFacetSnapshot?.kind === "ready" &&
      !subjectGroups.some((subject) => subject.subjectId === selectedSubjectId)
    ) {
      setSelectedSubjectId(null);
    }
  }, [activeFacetSnapshot, selectedSubjectId, subjectGroups]);

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  const refresh = () => {
    if (authorityKey && searchEligible) {
      void controller.load(
        authorityKey,
        searchQuery || undefined,
        selectedSubjectId ?? undefined,
        sort,
      );
    }
    if (authorityKey) void subjectsController.load(authorityKey);
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
      flatList={{
        ref: listRef,
        data: shownResources,
        keyExtractor: (resource) => resource.id,
        renderItem: ({ item: resource }) =>
          current?.kind === "ready" ? (
            <View style={styles.virtualizedRow}>
              <SavedResourceRow
                resource={resource}
                removing={current.removingResourceId === resource.id}
                removalPending={
                  current.removingResourceId !== null ||
                  current.loadingMore ||
                  current.syncing
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
                onOpenQuestions={(action) => router.push(action.href)}
                onRemove={() =>
                  void controller.removeSaved(current.authorityKey, resource.id)
                }
              />
            </View>
          ) : null,
        footer:
          current?.kind === "ready" ? (
            <View style={styles.libraryFooter}>
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
              {current.paginationStalled ? (
                <View style={styles.card}>
                  <Text accessibilityRole="alert" style={styles.error}>
                    {current.paginationResetReason === "data_changed"
                      ? "Tus guardados o sus permisos cambiaron mientras navegabas. Volvé a cargar para continuar con resultados actualizados."
                      : "La paginación devolvió un cursor repetido. Para evitar resultados duplicados, reiniciá el listado."}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Reiniciar listado de guardados"
                    onPress={refresh}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      Reiniciar listado
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {current.data.nextCursor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    current.failure
                      ? "Reintentar cargar más guardados"
                      : "Cargar más guardados"
                  }
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
                      {current.failure
                        ? "Reintentar carga"
                        : "Cargar más guardados"}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          ) : null,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver a la pantalla anterior"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backLabel}>Volver</Text>
      </Pressable>

      <View style={styles.card}>
        <View style={styles.searchControls}>
          <Text style={styles.fieldLabel}>Buscar en toda tu biblioteca</Text>
          <TextInput
            accessibilityLabel="Buscar entre todos mis guardados"
            accessibilityHint="Busca en el servidor por título, descripción y etiquetas de todos tus apuntes guardados."
            autoCapitalize="none"
            maxLength={SAVED_LIBRARY_QUERY_MAX_LENGTH}
            onChangeText={(value) => {
              setQuery(value);
            }}
            placeholder="Título, descripción o etiqueta"
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
              <Text style={styles.clearSearchLabel}>Limpiar búsqueda</Text>
            </Pressable>
          ) : null}
          <View accessibilityRole="radiogroup" style={styles.sortOptions}>
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
              accessibilityLabel="Ordenar globalmente por título"
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
          <Text style={styles.meta}>
            {sort === "title"
              ? "Título A–Z ordena toda la biblioteca desde el servidor, incluso las páginas todavía no cargadas."
              : "Guardado muestra primero los apuntes guardados más recientemente."}
          </Text>
          <View style={styles.syncControls}>
            <Text style={styles.meta}>
              Los cambios realizados desde otro dispositivo se comprueban
              mientras mantenés abierta esta pantalla.
            </Text>
            {current?.kind === "ready" ? (
              <>
                {current.syncNotice === "updated" ? (
                  <Text accessibilityRole="alert" style={styles.success}>
                    Tus guardados se actualizaron. Se reinició la paginación
                    para mostrar los cambios más recientes.
                  </Text>
                ) : null}
                {current.syncFailure ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    No pudimos comprobar si cambiaron tus guardados. La lista
                    podría estar desactualizada.
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Comprobar cambios en mis guardados"
                  accessibilityState={{
                    disabled:
                      current.syncing ||
                      current.loadingMore ||
                      current.removingResourceId !== null,
                  }}
                  disabled={
                    current.syncing ||
                    current.loadingMore ||
                    current.removingResourceId !== null
                  }
                  onPress={() => {
                    void controller.sync(current.authorityKey);
                    void subjectsController.sync(current.authorityKey);
                  }}
                  style={[
                    styles.secondaryButton,
                    (current.syncing ||
                      current.loadingMore ||
                      current.removingResourceId !== null) &&
                      styles.disabledButton,
                  ]}
                >
                  {current.syncing ? (
                    <ActivityIndicator accessibilityLabel="Comprobando cambios en Guardados" />
                  ) : (
                    <Text style={styles.secondaryButtonText}>
                      Comprobar cambios
                    </Text>
                  )}
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Filtrar por materia
        </Text>
        {activeFacetSnapshot?.kind === "loading" || !activeFacetSnapshot ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator accessibilityLabel="Cargando materias guardadas" />
            <Text style={styles.meta}>
              Consultando todas tus materias guardadas…
            </Text>
          </View>
        ) : activeFacetSnapshot.kind === "failure" ? (
          <View style={styles.subjectSection}>
            <Text accessibilityRole="alert" style={styles.error}>
              {failureCopy[activeFacetSnapshot.reason]}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar consulta de materias guardadas"
              onPress={() =>
                authorityKey && void subjectsController.load(authorityKey)
              }
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                Reintentar materias
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.subjectSection}>
            <Text style={styles.meta}>
              Materias con recursos guardados accesibles. Los conteos
              corresponden a toda tu biblioteca, sin aplicar la búsqueda de
              texto.
            </Text>
            <View accessibilityRole="radiogroup" style={styles.subjectOptions}>
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel="Todas las materias"
                accessibilityState={{ checked: activeSubjectId === null }}
                onPress={() => setSelectedSubjectId(null)}
                style={[
                  styles.subjectOption,
                  activeSubjectId === null && styles.subjectOptionSelected,
                ]}
              >
                <Text style={styles.subjectName}>Todas las materias</Text>
              </Pressable>
              {subjectGroups.map((subject) => (
                <Pressable
                  key={subject.subjectId}
                  accessibilityRole="radio"
                  accessibilityLabel={`Filtrar todos mis guardados por ${subject.name}`}
                  accessibilityState={{
                    checked: activeSubjectId === subject.subjectId,
                  }}
                  onPress={() => setSelectedSubjectId(subject.subjectId)}
                  style={[
                    styles.subjectOption,
                    activeSubjectId === subject.subjectId &&
                      styles.subjectOptionSelected,
                  ]}
                >
                  <Text style={styles.subjectName}>{subject.name}</Text>
                  <Text style={styles.subjectCount}>
                    {subject.count} guardados accesibles
                  </Text>
                </Pressable>
              ))}
            </View>
            {exploreSelectedSubject ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={exploreSelectedSubject.accessibilityLabel}
                accessibilityHint={exploreSelectedSubject.accessibilityHint}
                onPress={() => router.push(exploreSelectedSubject.href)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>
                  Explorar más apuntes de esta materia
                </Text>
              </Pressable>
            ) : null}
            {activeFacetSnapshot.refreshFailure ? (
              <Text accessibilityRole="alert" style={styles.error}>
                No pudimos actualizar las materias guardadas. Los conteos
                podrían estar desactualizados.
              </Text>
            ) : null}
            {activeFacetSnapshot.data.truncated ? (
              <Text style={styles.meta}>
                Se muestran hasta 100 materias. Pueden existir otras materias
                guardadas todavía no disponibles en este selector.
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {!searchEligible ? (
        <View style={styles.card}>
          <Text style={styles.copy}>
            Escribí al menos dos caracteres para buscar en todos tus guardados.
          </Text>
        </View>
      ) : !current || current.kind === "loading" ? (
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
                  {current.paginationStalled
                    ? current.paginationResetReason === "data_changed"
                      ? "Tus guardados cambiaron mientras navegabas. Volvé a cargar para seguir consultando."
                      : "La paginación se interrumpió. Reiniciá el listado para consultar tus guardados."
                    : current.data.nextCursor
                      ? "Esta página no contiene resultados visibles. Podés cargar más guardados."
                      : searchQuery || selectedSubjectId
                        ? "No encontramos guardados accesibles con estos filtros. Probá otra búsqueda o materia."
                        : "Todavía no guardaste recursos. Podés hacerlo desde cualquier detalle de recurso."}
                </Text>
                {!current.paginationStalled &&
                !current.data.nextCursor &&
                !searchQuery &&
                !selectedSubjectId ? (
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
                {activeSubject ? (
                  <Text accessibilityRole="header" style={styles.sectionTitle}>
                    Apuntes de {activeSubject.name}
                  </Text>
                ) : null}
                <Text accessibilityLiveRegion="polite" style={styles.meta}>
                  {loadedSavedSearchSummary(
                    shownResources.length,
                    current.data.items.length,
                    Boolean(current.data.nextCursor),
                  )}
                </Text>
                {shownResources.length === 0 ? (
                  <Text style={styles.copy}>
                    {activeSubject
                      ? "No hay resultados visibles con estos filtros."
                      : "No hay resultados visibles entre las páginas cargadas."}
                    {current.data.nextCursor
                      ? " Cargá más para ampliar los resultados."
                      : " Probá otra búsqueda o seleccioná otra materia."}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </>
      )}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  syncControls: {
    gap: 10,
    alignItems: "flex-start",
  },
  virtualizedRow: {
    marginBottom: 10,
  },
  libraryFooter: {
    gap: 12,
  },
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
  subjectSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#20202a",
  },
  subjectOptions: {
    gap: 8,
  },
  subjectOption: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    gap: 4,
  },
  subjectOptionSelected: {
    borderColor: "#43366a",
    backgroundColor: "#f1eff8",
  },
  subjectName: {
    color: "#20202a",
    fontSize: 15,
    fontWeight: "700",
  },
  subjectCount: {
    color: "#686875",
    fontSize: 12,
    lineHeight: 18,
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
  questionsButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#f1eff8",
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
