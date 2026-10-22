import type {
  ContextualDiscoveryResponse,
  ResourceView,
  SearchResponse,
  SearchScope,
  SearchSubjectResult,
} from "@losapuntes/contracts";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AccessibilityInfo,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import { useAcademicContext } from "@/features/academic/academic-context-provider";
import { mobileResourceConsumptionApi } from "@/features/resources/resource-runtime";
import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import {
  resourceAuthorAction,
  resourceFileSizeLabel,
  resourceFileTypeLabel,
  resourceRowAccessibilityLabel,
} from "@/features/resources/resource-details-copy";
import { useSession } from "@/features/session/session-provider";

import {
  MobileSearchController,
  type ContextualDiscoverySnapshot,
  type MobileSearchSnapshot,
} from "./search-controller";
import {
  initialSearchInputState,
  searchInputForState,
  searchInputReducer,
} from "./search-input-state";
import {
  searchResultSummary,
  searchScopeRecoveryCopy,
} from "./search-results-copy";
import type { MobileSearchInput } from "./search-api";
import { mobileSearchApi } from "./search-runtime";
import { subjectResourcesSearchRouteId } from "./search-subject-navigation";
import {
  MobileSearchQuickSaveController,
  type SearchQuickSaveEntry,
  type SearchQuickSaveSnapshot,
} from "./search-quick-save-controller";
import {
  ACADEMIC_CONTEXT_HOME_ROUTE,
  contextualDiscoveryEmptyCopy,
} from "./search-contextual-discovery-copy";

const SEARCH_SCOPES: Array<{ value: SearchScope; label: string }> = [
  { value: "all", label: "Todo" },
  { value: "resources", label: "Apuntes" },
  { value: "subjects", label: "Materias" },
  { value: "people", label: "Personas" },
];

const failureCopy: Record<string, string> = {
  offline: "No hay conexión. No pudimos actualizar la búsqueda.",
  timeout: "La búsqueda tardó demasiado en responder.",
  server_unavailable: "El servicio de búsqueda no está disponible ahora.",
  restricted: "La cuenta no puede acceder a esta búsqueda.",
  error: "No pudimos completar la búsqueda.",
};

function ResourceResult({
  resource,
  onPress,
  onOpenProfile,
  quickSaveEntry,
  onQuickSave,
  onOpenSaved,
}: {
  resource: ResourceView;
  onPress: () => void;
  onOpenProfile: (profileId: string) => void;
  quickSaveEntry: SearchQuickSaveEntry | undefined;
  onQuickSave: () => void;
  onOpenSaved: () => void;
}) {
  const authorAction = resourceAuthorAction(resource.author);

  return (
    <View style={styles.resultRow}>
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
          "Abrir recurso",
        )}
        onPress={onPress}
        style={styles.resourceOpenAction}
      >
        <Text style={styles.resultTitle}>{resource.title}</Text>
        <Text style={styles.meta}>{resource.academic.subject.name}</Text>
        {resource.description ? (
          <Text numberOfLines={2} style={styles.copy}>
            {resource.description}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {resourceFileTypeLabel(resource.file.mimeType)} ·{" "}
          {resourceFileSizeLabel(resource.file.byteSize)}
        </Text>
        <Text style={styles.actionLabel}>Ver recurso</Text>
      </Pressable>
      {resource.author ? (
        authorAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={authorAction.accessibilityLabel}
            accessibilityHint={authorAction.accessibilityHint}
            onPress={() => onOpenProfile(authorAction.profileId)}
            style={styles.resourceAuthorAction}
          >
            <Text style={styles.resourceAuthorLabel}>
              Por {resource.author.displayName}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.meta}>Por {resource.author.displayName}</Text>
        )
      ) : null}
      <View style={styles.quickSaveRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            quickSaveEntry?.state === "saved"
              ? `${resource.title} ya está guardado`
              : `Guardar ${resource.title} desde Buscar`
          }
          accessibilityState={{
            disabled:
              quickSaveEntry?.state === "saving" ||
              quickSaveEntry?.state === "saved" ||
              quickSaveEntry?.state === "uncertain",
          }}
          disabled={
            quickSaveEntry?.state === "saving" ||
            quickSaveEntry?.state === "saved" ||
            quickSaveEntry?.state === "uncertain"
          }
          onPress={onQuickSave}
          style={styles.quickSaveButton}
        >
          {quickSaveEntry?.state === "saving" ? (
            <ActivityIndicator accessibilityLabel="Guardando apunte" />
          ) : (
            <Text style={styles.actionLabel}>
              {quickSaveEntry?.state === "saved"
                ? "Guardado"
                : quickSaveEntry?.state === "error"
                  ? "Reintentar guardar"
                  : "Guardar"}
            </Text>
          )}
        </Pressable>
        {quickSaveEntry?.state === "uncertain" ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>
              No pudimos confirmar el guardado.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Revisar mis recursos guardados"
              onPress={onOpenSaved}
              style={styles.quickSaveButton}
            >
              <Text style={styles.actionLabel}>Revisar Guardados</Text>
            </Pressable>
          </>
        ) : quickSaveEntry?.state === "error" ? (
          <Text accessibilityRole="alert" style={styles.error}>
            No se pudo guardar. Revisá tu sesión o el acceso al recurso.
          </Text>
        ) : quickSaveEntry?.state === "saved" ? (
          <Text accessibilityLiveRegion="polite" style={styles.meta}>
            Confirmado por el servidor.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ResourceGroup({
  title,
  resources,
  onOpen,
  onOpenProfile,
  quickSave,
  onQuickSave,
  onOpenSaved,
}: {
  title: string;
  resources: ResourceView[];
  onOpen: (resource: ResourceView) => void;
  onOpenProfile: (profileId: string) => void;
  quickSave: SearchQuickSaveSnapshot;
  onQuickSave: (id: string) => void;
  onOpenSaved: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        {title}
      </Text>
      {resources.length === 0 ? (
        <Text style={styles.copy}>No encontramos recursos visibles.</Text>
      ) : (
        resources.map((resource) => (
          <ResourceResult
            key={resource.id}
            resource={resource}
            onPress={() => onOpen(resource)}
            onOpenProfile={onOpenProfile}
            quickSaveEntry={quickSave.items[resource.id]}
            onQuickSave={() => onQuickSave(resource.id)}
            onOpenSaved={onOpenSaved}
          />
        ))
      )}
    </View>
  );
}

function SubjectGroup({
  subjects,
  onOpen,
  onOpenQuestions,
}: {
  subjects: SearchSubjectResult[];
  onOpen: (subject: SearchSubjectResult) => void;
  onOpenQuestions: (subjectId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        Materias
      </Text>
      {subjects.length === 0 ? (
        <Text style={styles.copy}>No encontramos materias.</Text>
      ) : (
        subjects.map((subject) => (
          <View key={subject.id} style={styles.subjectResult}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Buscar apuntes de ${subject.name}`}
              onPress={() => onOpen(subject)}
              style={styles.resultRow}
            >
              <Text style={styles.resultTitle}>{subject.name}</Text>
              {subject.aliases.length > 0 ? (
                <Text style={styles.meta}>
                  También: {subject.aliases.join(", ")}
                </Text>
              ) : null}
              <Text style={styles.actionLabel}>
                Ver apuntes de esta materia
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver preguntas de la materia ${subject.name}`}
              onPress={() => onOpenQuestions(subject.id)}
              style={styles.searchActionButton}
            >
              <Text style={styles.searchActionLabel}>
                Ver preguntas de esta materia
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function PeopleGroup({
  result,
  onOpen,
}: {
  result: SearchResponse;
  onOpen: (profileId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        Personas con identidad pública
      </Text>
      {result.results.people.length === 0 ? (
        <Text style={styles.copy}>No encontramos perfiles públicos.</Text>
      ) : (
        result.results.people.map((person) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver perfil de ${person.displayName}`}
            key={person.profileId}
            onPress={() => onOpen(person.profileId)}
            style={styles.resultRow}
          >
            <Text style={styles.resultTitle}>{person.displayName}</Text>
            <Text style={styles.actionLabel}>Ver perfil</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function ContextualDiscovery({
  snapshot,
  authorityKey,
  noContext,
  onRetry,
  onOpen,
  onOpenProfile,
  onConfigureContext,
  onOpenQuestions,
  onExploreSubject,
  quickSave,
  onQuickSave,
  onOpenSaved,
}: {
  snapshot: ContextualDiscoverySnapshot;
  authorityKey: string | null;
  noContext: boolean;
  onRetry: () => void;
  onOpen: (resource: ResourceView) => void;
  onOpenProfile: (profileId: string) => void;
  onConfigureContext: () => void;
  onOpenQuestions: (subjectId: string) => void;
  onExploreSubject: (subject: { id: string; name: string }) => void;
  quickSave: SearchQuickSaveSnapshot;
  onQuickSave: (id: string) => void;
  onOpenSaved: () => void;
}) {
  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;
  const emptyCopy = contextualDiscoveryEmptyCopy(noContext);

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        Recursos de tus materias actuales
      </Text>
      {!current || current.kind === "loading" ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator accessibilityLabel="Cargando descubrimiento contextual" />
          <Text style={styles.copy}>Consultando tu contexto actual…</Text>
        </View>
      ) : current.kind === "ready" ? (
        current.data.subjects.length === 0 ? (
          <View style={styles.emptyDiscovery}>
            <Text style={styles.copy}>{emptyCopy.message}</Text>
            {emptyCopy.configureContextLabel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Configurar contexto académico desde Inicio"
                onPress={onConfigureContext}
                style={styles.searchActionButton}
              >
                <Text style={styles.searchActionLabel}>
                  {emptyCopy.configureContextLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          current.data.subjects.map((bucket) => (
            <View key={bucket.subject.id} style={styles.contextBucket}>
              <Text style={styles.resultTitle}>{bucket.subject.name}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Explorar apuntes de ${bucket.subject.name}`}
                onPress={() => onExploreSubject(bucket.subject)}
                style={styles.searchActionButton}
              >
                <Text style={styles.searchActionLabel}>
                  Explorar apuntes de esta materia
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ver preguntas de la materia ${bucket.subject.name}`}
                onPress={() => onOpenQuestions(bucket.subject.id)}
                style={styles.searchActionButton}
              >
                <Text style={styles.searchActionLabel}>
                  Ver preguntas de esta materia
                </Text>
              </Pressable>
              {bucket.resources.length === 0 ? (
                <Text style={styles.copy}>
                  Todavía no hay recursos visibles.
                </Text>
              ) : (
                bucket.resources.map((resource) => (
                  <ResourceResult
                    key={resource.id}
                    resource={resource}
                    onPress={() => onOpen(resource)}
                    onOpenProfile={onOpenProfile}
                    quickSaveEntry={quickSave.items[resource.id]}
                    onQuickSave={() => onQuickSave(resource.id)}
                    onOpenSaved={onOpenSaved}
                  />
                ))
              )}
            </View>
          ))
        )
      ) : (
        <>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureCopy[current.kind]}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.retryButton}
          >
            <Text style={styles.retryLabel}>Reintentar descubrimiento</Text>
          </Pressable>
        </>
      )}
      <Text style={styles.meta}>
        La respuesta está acotada a seis materias y cuatro recursos por materia.
      </Text>
    </View>
  );
}

export function SearchScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ subjectId?: string }>();
  const incomingSubjectId = subjectResourcesSearchRouteId(
    routeParams.subjectId,
  );
  const handledIncomingSubject = useRef<string | null>(null);
  const isFocused = useIsFocused();
  const { snapshot: session } = useSession();
  const { snapshot: academic, retry: retryAcademic } = useAcademicContext();
  const controller = useMemo(
    () => new MobileSearchController(mobileSearchApi),
    [],
  );
  const quickSaveController = useMemo(
    () => new MobileSearchQuickSaveController(mobileResourceConsumptionApi),
    [],
  );
  const [quickSave, setQuickSave] = useState<SearchQuickSaveSnapshot>(
    quickSaveController.getSnapshot(),
  );
  const [search, setSearch] = useState<MobileSearchSnapshot>(
    controller.getSearchSnapshot(),
  );
  const [contextual, setContextual] = useState<ContextualDiscoverySnapshot>(
    controller.getContextualSnapshot(),
  );
  const [searchInputState, dispatchSearchInput] = useReducer(
    searchInputReducer,
    initialSearchInputState,
  );
  const { query, scope, selectedSubject } = searchInputState;
  const subjectId = selectedSubject?.id ?? null;
  const [appState, setAppState] = useState(AppState.currentState);
  const [foregroundContextFresh, setForegroundContextFresh] = useState(
    AppState.currentState === "active",
  );
  const appStateRef = useRef(AppState.currentState);
  const awaitingAcademicRestore = useRef(false);
  const sawAcademicLoading = useRef(false);
  const announcedSearchResult = useRef<string | null>(null);

  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const academicData =
    academic.kind === "ready" || academic.kind === "no_context"
      ? academic.data
      : null;
  const academicMatchesSession = Boolean(
    sessionAuthority &&
    academicData?.contextAuthorityKey.startsWith(`${sessionAuthority}:`),
  );
  const authorityKey =
    isFocused &&
    appState === "active" &&
    foregroundContextFresh &&
    sessionAuthority &&
    academicData &&
    academicMatchesSession
      ? `${sessionAuthority}:${academicData.contextAuthorityKey}`
      : null;
  useEffect(() => {
    if (!incomingSubjectId) {
      handledIncomingSubject.current = null;
      return;
    }
    if (!authorityKey) return;
    const key = `${sessionAuthority}:${incomingSubjectId}`;
    if (handledIncomingSubject.current === key) return;
    handledIncomingSubject.current = key;
    controller.cancelSearch();
    dispatchSearchInput({
      type: "subjectSelected",
      subject: { id: incomingSubjectId, name: "esta materia" },
    });
  }, [authorityKey, controller, incomingSubjectId, sessionAuthority]);

  const scopedQuickSave: SearchQuickSaveSnapshot =
    quickSave.authorityKey === authorityKey
      ? quickSave
      : { authorityKey, items: {} };
  const normalizedQuery = query.trim();
  const searchInput = useMemo<MobileSearchInput | null>(
    () => searchInputForState(searchInputState),
    [query, scope, subjectId],
  );

  useEffect(
    () => quickSaveController.subscribe(setQuickSave),
    [quickSaveController],
  );

  useEffect(() => {
    quickSaveController.setAuthority(authorityKey);
    return () => quickSaveController.invalidate();
  }, [authorityKey, quickSaveController]);

  useEffect(
    () =>
      controller.subscribe(() => {
        setSearch(controller.getSearchSnapshot());
        setContextual(controller.getContextualSnapshot());
      }),
    [controller],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      setAppState(nextState);

      if (nextState !== "active") {
        awaitingAcademicRestore.current = false;
        sawAcademicLoading.current = false;
        setForegroundContextFresh(false);
        controller.invalidate();
        return;
      }

      if (previousState !== "active") {
        awaitingAcademicRestore.current = true;
        sawAcademicLoading.current = false;
        setForegroundContextFresh(false);
      }
    });
    return () => subscription.remove();
  }, [controller]);

  useEffect(() => {
    if (!awaitingAcademicRestore.current) return;

    if (academic.kind === "loading") {
      sawAcademicLoading.current = true;
      return;
    }

    if (
      sawAcademicLoading.current &&
      (academic.kind === "ready" || academic.kind === "no_context")
    ) {
      awaitingAcademicRestore.current = false;
      sawAcademicLoading.current = false;
      setForegroundContextFresh(true);
    }
  }, [academic]);

  useEffect(() => {
    if (!authorityKey) {
      controller.invalidate();
      return;
    }

    void controller.loadContextual(authorityKey);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller]);

  const runSearch = useCallback(() => {
    if (!authorityKey || !searchInput) return;

    void controller.search(authorityKey, searchInput);
  }, [authorityKey, controller, searchInput]);

  useEffect(() => {
    if (!authorityKey || !searchInput) {
      controller.cancelSearch();
      return;
    }

    controller.scheduleSearch(authorityKey, searchInput);
    return () => {
      controller.cancelSearch(authorityKey);
    };
  }, [authorityKey, controller, query, searchInput]);

  useEffect(
    () => () => {
      controller.invalidate();
    },
    [controller],
  );

  const clearSearch = useCallback(() => {
    controller.cancelSearch();
  }, [controller]);

  const setQueryText = useCallback(
    (value: string) => {
      clearSearch();
      dispatchSearchInput({ type: "queryChanged", query: value });
    },
    [clearSearch],
  );

  const clearSubjectFilter = useCallback(() => {
    clearSearch();
    dispatchSearchInput({ type: "subjectFilterCleared" });
  }, [clearSearch]);

  const resetAllFilters = useCallback(() => {
    clearSearch();
    dispatchSearchInput({ type: "resetAll" });
    // A deep-linked Subject must not be reapplied on the next focus/session.
    if (routeParams.subjectId !== undefined) {
      router.replace("/(tabs)/search");
    }
  }, [clearSearch, routeParams.subjectId, router]);

  const quickSaveResource = useCallback(
    (resourceId: string) => {
      if (!authorityKey) return;
      void quickSaveController.save(authorityKey, resourceId);
    },
    [authorityKey, quickSaveController],
  );

  const openSavedResources = useCallback(() => {
    router.push("/saved-resources");
  }, [router]);

  const openResource = useCallback(
    (resource: ResourceView) => {
      router.push({
        pathname: "/resources/[id]",
        params: { id: resource.id },
      });
    },
    [router],
  );

  const openSubject = useCallback(
    (subject: SearchSubjectResult) => {
      if (
        query.length === 0 &&
        scope === "resources" &&
        subjectId === subject.id
      ) {
        return;
      }
      clearSearch();
      dispatchSearchInput({
        type: "subjectSelected",
        subject: { id: subject.id, name: subject.name },
      });
    },
    [clearSearch, query.length, scope, subjectId],
  );

  const exploreContextSubject = useCallback(
    (subject: { id: string; name: string }) => {
      const canonicalId = subjectResourcesSearchRouteId(subject.id);
      if (!canonicalId) return;
      clearSearch();
      dispatchSearchInput({
        type: "subjectSelected",
        subject: { id: canonicalId, name: subject.name },
      });
    },
    [clearSearch],
  );

  const openSubjectQuestions = useCallback(
    (subjectId: string) => {
      router.push({
        pathname: "/questions/subjects/[subjectId]",
        params: { subjectId },
      });
    },
    [router],
  );

  const openPerson = useCallback(
    (profileId: string) => {
      router.push({
        pathname: "/profiles/[profileId]",
        params: { profileId },
      });
    },
    [router],
  );

  const refresh = useCallback(() => {
    if (session.kind === "authenticated") void retryAcademic();
  }, [retryAcademic, session.kind]);

  // Do not flash results from the previous filter combination before the
  // effect that cancels the old request has run.
  const currentSearch =
    searchInput &&
    search.kind !== "idle" &&
    search.authorityKey === authorityKey &&
    ((search.kind !== "ready" && search.kind !== "loading") ||
      (search.query === (searchInput.q ?? "") &&
        search.scope === searchInput.scope &&
        (search.subjectId ?? null) === (searchInput.subjectId ?? null)))
      ? search
      : null;
  useEffect(() => {
    const ready = currentSearch?.kind === "ready" ? currentSearch : null;
    if (!ready || !authorityKey || appState !== "active" || !isFocused) {
      announcedSearchResult.current = null;
      return;
    }

    const announcementKey = `${ready.authorityKey}:${ready.scope}:${ready.query}`;
    if (announcedSearchResult.current === announcementKey) return;

    AccessibilityInfo.announceForAccessibility(
      searchResultSummary(
        {
          resources: ready.data.results.resources.length,
          subjects: ready.data.results.subjects.length,
          people: ready.data.results.people.length,
        },
        ready.scope,
      ),
    );
    announcedSearchResult.current = announcementKey;
  }, [appState, authorityKey, currentSearch, isFocused]);
  const academicFailure =
    academic.kind === "offline" ||
    academic.kind === "timeout" ||
    academic.kind === "server_unavailable" ||
    academic.kind === "error";

  const renderSearchResults = (
    data: SearchResponse,
    resultScope: SearchScope,
  ) => {
    const counts = {
      resources: data.results.resources.length,
      subjects: data.results.subjects.length,
      people: data.results.people.length,
    };
    const scopedSubjectEmpty =
      resultScope === "resources" &&
      selectedSubject !== null &&
      counts.resources === 0;
    const recoveryCopy = selectedSubject
      ? null
      : searchScopeRecoveryCopy(counts, resultScope, data.query);

    return (
      <View style={styles.resultGroups}>
        {data.query ? (
          <Text style={styles.copy}>
            Resultados para <Text style={styles.resultTitle}>{data.query}</Text>
          </Text>
        ) : (
          <Text style={styles.copy}>Recursos de la materia seleccionada</Text>
        )}
        <Text style={styles.copy}>
          {searchResultSummary(counts, resultScope)}
        </Text>
        {scopedSubjectEmpty ? (
          <View style={styles.emptyRecovery}>
            <Text style={styles.copy}>
              No encontramos apuntes accesibles de{" "}
              {selectedSubject?.name ?? "esta materia"}
              {normalizedQuery ? ` con “${normalizedQuery}”` : ""}. Probá con
              otra palabra o ampliá la búsqueda.
            </Text>
            {normalizedQuery.length >= 2 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Buscar ${normalizedQuery} en todas las materias`}
                onPress={clearSubjectFilter}
                style={styles.searchActionButton}
              >
                <Text style={styles.searchActionLabel}>
                  Buscar texto en todas las materias
                </Text>
              </Pressable>
            ) : null}
            {normalizedQuery.length >= 2 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ver apuntes de ${selectedSubject?.name ?? "esta materia"} sin palabras clave`}
                onPress={() => setQueryText("")}
                style={styles.searchActionButton}
              >
                <Text style={styles.searchActionLabel}>
                  Ver materia sin texto
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quitar filtro de materia y ampliar búsqueda"
                onPress={clearSubjectFilter}
                style={styles.searchActionButton}
              >
                <Text style={styles.searchActionLabel}>
                  Quitar filtro de materia
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
        {recoveryCopy ? (
          <View style={styles.emptyRecovery}>
            <Text style={styles.copy}>{recoveryCopy.message}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${recoveryCopy.actionLabel} para ${data.query}`}
              onPress={() => {
                clearSearch();
                dispatchSearchInput({ type: "scopeChanged", scope: "all" });
              }}
              style={styles.searchActionButton}
            >
              <Text style={styles.searchActionLabel}>
                {recoveryCopy.actionLabel}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {(resultScope === "all" || resultScope === "resources") && (
          <ResourceGroup
            title="Apuntes y recursos"
            resources={data.results.resources}
            onOpen={openResource}
            onOpenProfile={openPerson}
            quickSave={scopedQuickSave}
            onQuickSave={quickSaveResource}
            onOpenSaved={openSavedResources}
          />
        )}
        {(resultScope === "all" || resultScope === "subjects") && (
          <SubjectGroup
            subjects={data.results.subjects}
            onOpen={openSubject}
            onOpenQuestions={openSubjectQuestions}
          />
        )}
        {(resultScope === "all" || resultScope === "people") && (
          <PeopleGroup result={data} onOpen={openPerson} />
        )}
        <Text style={styles.meta}>
          Mostramos hasta ocho resultados de cada tipo.
        </Text>
      </View>
    );
  };

  return (
    <ProductSurface
      title="Buscar"
      description="Encontrá apuntes, materias y perfiles públicos con los permisos de acceso vigentes."
      onRefresh={session.kind === "authenticated" ? refresh : undefined}
      refreshing={academic.kind === "loading"}
    >
      {routeParams.subjectId !== undefined && !incomingSubjectId ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            El enlace de materia no es válido. Podés buscar recursos normalmente
            o elegir una materia desde los resultados.
          </Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.label}>Buscar en Los Apuntes</Text>
        <TextInput
          accessibilityLabel="Buscar recursos, materias y personas"
          autoCorrect={false}
          maxLength={120}
          onChangeText={setQueryText}
          onSubmitEditing={runSearch}
          placeholder="Ej. Base de Datos o Ana"
          returnKeyType="search"
          style={styles.input}
          value={query}
        />
        <Text style={styles.meta}>
          {selectedSubject
            ? "Podés combinar esta materia con 2 a 120 caracteres. Sin texto se muestran sus apuntes accesibles."
            : "La búsqueda por texto requiere entre 2 y 120 caracteres."}
        </Text>
        <View accessibilityRole="tablist" style={styles.scopeList}>
          {SEARCH_SCOPES.map((option) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: scope === option.value }}
              key={option.value}
              onPress={() => {
                if (scope === option.value) return;
                clearSearch();
                dispatchSearchInput({
                  type: "scopeChanged",
                  scope: option.value,
                });
              }}
              style={[
                styles.scopeButton,
                scope === option.value ? styles.scopeButtonSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.scopeLabel,
                  scope === option.value ? styles.scopeLabelSelected : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {selectedSubject ? (
          <View style={styles.filterNotice}>
            <Text style={styles.meta}>
              Filtrando por {selectedSubject.name}.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar filtro de materia ${selectedSubject.name}`}
              onPress={clearSubjectFilter}
              style={styles.searchActionButton}
            >
              <Text style={styles.searchActionLabel}>
                Quitar filtro de materia
              </Text>
            </Pressable>
          </View>
        ) : null}
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Limpiar texto de búsqueda"
            onPress={() => setQueryText("")}
            style={styles.searchActionButton}
          >
            <Text style={styles.searchActionLabel}>Limpiar texto</Text>
          </Pressable>
        ) : null}
        {query.length > 0 || scope !== "all" || selectedSubject ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restablecer búsqueda y filtros"
            onPress={resetAllFilters}
            style={styles.searchActionButton}
          >
            <Text style={styles.searchActionLabel}>
              Restablecer búsqueda y filtros
            </Text>
          </Pressable>
        ) : null}
      </View>

      {!authorityKey ? (
        <View style={styles.card}>
          {academicFailure ? (
            <>
              <Text accessibilityRole="alert" style={styles.error}>
                No pudimos actualizar tu contexto académico. Reintentá para
                preparar resultados actuales.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void retryAcademic()}
                style={styles.retryButton}
              >
                <Text style={styles.retryLabel}>Reintentar</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.loadingRow}>
              <ActivityIndicator accessibilityLabel="Validando sesión y contexto" />
              <Text style={styles.copy}>Validando tu sesión y contexto…</Text>
            </View>
          )}
        </View>
      ) : null}

      {authorityKey && !searchInput ? (
        <View style={styles.card}>
          <Text style={styles.copy}>
            {selectedSubject && normalizedQuery.length === 1
              ? "Escribí al menos dos caracteres para refinar esta materia, o borrá el texto para ver sus apuntes."
              : "Escribí al menos dos caracteres para buscar."}
          </Text>
        </View>
      ) : null}

      {authorityKey && searchInput ? (
        currentSearch?.kind === "loading" ? (
          <View style={styles.card}>
            <View style={styles.loadingRow}>
              <ActivityIndicator accessibilityLabel="Buscando" />
              <Text style={styles.copy}>Buscando…</Text>
            </View>
          </View>
        ) : currentSearch?.kind === "ready" ? (
          renderSearchResults(currentSearch.data, currentSearch.scope)
        ) : currentSearch ? (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.error}>
              {failureCopy[currentSearch.kind]}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={runSearch}
              style={styles.retryButton}
            >
              <Text style={styles.retryLabel}>Reintentar búsqueda</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.loadingRow}>
              <ActivityIndicator accessibilityLabel="Preparando búsqueda" />
              <Text style={styles.copy}>Preparando búsqueda…</Text>
            </View>
          </View>
        )
      ) : null}

      {authorityKey ? (
        <ContextualDiscovery
          snapshot={contextual}
          authorityKey={authorityKey}
          noContext={academic.kind === "no_context"}
          onRetry={() => void controller.loadContextual(authorityKey)}
          onOpen={openResource}
          onOpenProfile={openPerson}
          onConfigureContext={() => router.push(ACADEMIC_CONTEXT_HOME_ROUTE)}
          onOpenQuestions={openSubjectQuestions}
          onExploreSubject={exploreContextSubject}
          quickSave={scopedQuickSave}
          onQuickSave={quickSaveResource}
          onOpenSaved={openSavedResources}
        />
      ) : null}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#292936",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#c8c8d2",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#17171c",
    backgroundColor: "#ffffff",
  },
  filterNotice: {
    gap: 4,
    alignItems: "flex-start",
  },
  searchActionButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#c8c8d2",
    borderRadius: 10,
  },
  searchActionLabel: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  scopeList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scopeButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#c8c8d2",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  scopeButtonSelected: {
    borderColor: "#352b55",
    backgroundColor: "#352b55",
  },
  scopeLabel: {
    color: "#383844",
    fontSize: 14,
    fontWeight: "600",
  },
  scopeLabelSelected: {
    color: "#ffffff",
  },
  resultGroups: {
    gap: 14,
  },
  emptyRecovery: {
    gap: 8,
    alignItems: "flex-start",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f4f3fa",
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: "#20202a",
  },
  subjectResult: { gap: 8 },
  resultRow: {
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 12,
  },
  resourceOpenAction: {
    alignItems: "flex-start",
    gap: 5,
    minHeight: 44,
  },
  quickSaveRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  quickSaveButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#c8c8d2",
    borderRadius: 10,
  },
  resourceAuthorAction: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 4,
  },
  resourceAuthorLabel: {
    color: "#43366a",
    fontSize: 12,
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  contextBucket: {
    gap: 8,
  },
  emptyDiscovery: {
    gap: 12,
  },
  resultTitle: {
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
  loadingRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  error: {
    color: "#9f1d1d",
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  retryLabel: {
    color: "#24243a",
    fontSize: 15,
    fontWeight: "700",
  },
});
