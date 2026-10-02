import type {
  ContextualDiscoveryResponse,
  ResourceView,
  SearchResponse,
  SearchScope,
  SearchSubjectResult,
} from "@losapuntes/contracts";
import { useIsFocused, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAcademicContext } from "@/features/academic/academic-context-provider";
import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import {
  MobileSearchController,
  type ContextualDiscoverySnapshot,
  type MobileSearchSnapshot,
} from "./search-controller";
import { mobileSearchApi } from "./search-runtime";

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

const bytesLabel = (byteSize: number): string => {
  if (byteSize < 1024) return byteSize === 1 ? "1 byte" : `${byteSize} bytes`;
  if (byteSize < 1024 * 1024) {
    return `${Math.round(byteSize / 1024)} KB`;
  }
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
};

function ResourceResult({
  resource,
  onPress,
}: {
  resource: ResourceView;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${resource.title}`}
      onPress={onPress}
      style={styles.resultRow}
    >
      <Text style={styles.resultTitle}>{resource.title}</Text>
      <Text style={styles.meta}>
        {resource.academic.subject.name} ·{" "}
        {resource.author?.displayName ?? "Autor no disponible"}
      </Text>
      {resource.description ? (
        <Text numberOfLines={2} style={styles.copy}>
          {resource.description}
        </Text>
      ) : null}
      <Text style={styles.meta}>
        {resource.file.mimeType} · {bytesLabel(resource.file.byteSize)}
      </Text>
      <Text style={styles.actionLabel}>Ver recurso</Text>
    </Pressable>
  );
}

function ResourceGroup({
  title,
  resources,
  onOpen,
}: {
  title: string;
  resources: ResourceView[];
  onOpen: (resource: ResourceView) => void;
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
          />
        ))
      )}
    </View>
  );
}

function SubjectGroup({
  subjects,
  onOpen,
}: {
  subjects: SearchSubjectResult[];
  onOpen: (subject: SearchSubjectResult) => void;
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Buscar apuntes de ${subject.name}`}
            key={subject.id}
            onPress={() => onOpen(subject)}
            style={styles.resultRow}
          >
            <Text style={styles.resultTitle}>{subject.name}</Text>
            {subject.aliases.length > 0 ? (
              <Text style={styles.meta}>
                También: {subject.aliases.join(", ")}
              </Text>
            ) : null}
            <Text style={styles.actionLabel}>Ver apuntes de esta materia</Text>
          </Pressable>
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
}: {
  snapshot: ContextualDiscoverySnapshot;
  authorityKey: string | null;
  noContext: boolean;
  onRetry: () => void;
  onOpen: (resource: ResourceView) => void;
}) {
  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;

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
          <Text style={styles.copy}>
            {noContext
              ? "Todavía no seleccionaste una materia actual. El descubrimiento contextual aparecerá cuando el servidor confirme ese contexto."
              : "No encontramos recursos visibles para tus materias actuales."}
          </Text>
        ) : (
          current.data.subjects.map((bucket) => (
            <View key={bucket.subject.id} style={styles.contextBucket}>
              <Text style={styles.resultTitle}>{bucket.subject.name}</Text>
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
  const isFocused = useIsFocused();
  const { snapshot: session } = useSession();
  const { snapshot: academic, retry: retryAcademic } = useAcademicContext();
  const controller = useMemo(
    () => new MobileSearchController(mobileSearchApi),
    [],
  );
  const [search, setSearch] = useState<MobileSearchSnapshot>(
    controller.getSearchSnapshot(),
  );
  const [contextual, setContextual] = useState<ContextualDiscoverySnapshot>(
    controller.getContextualSnapshot(),
  );
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [appState, setAppState] = useState(AppState.currentState);
  const [foregroundContextFresh, setForegroundContextFresh] = useState(
    AppState.currentState === "active",
  );
  const appStateRef = useRef(AppState.currentState);
  const awaitingAcademicRestore = useRef(false);
  const sawAcademicLoading = useRef(false);

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
  const normalizedQuery = query.trim();

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
    if (!authorityKey || normalizedQuery.length < 2) return;

    void controller.search(authorityKey, {
      q: normalizedQuery,
      scope,
      ...(subjectId ? { subjectId } : {}),
    });
  }, [authorityKey, controller, normalizedQuery, scope, subjectId]);

  useEffect(() => {
    if (!authorityKey || normalizedQuery.length < 2) {
      controller.cancelSearch();
      return;
    }

    controller.scheduleSearch(authorityKey, {
      q: normalizedQuery,
      scope,
      ...(subjectId ? { subjectId } : {}),
    });
    return () => {
      controller.cancelSearch(authorityKey);
    };
  }, [authorityKey, controller, normalizedQuery, query, scope, subjectId]);

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
      setSubjectId(undefined);
      setQuery(value.slice(0, 120));
    },
    [clearSearch],
  );

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
        query === subject.name &&
        scope === "resources" &&
        subjectId === subject.id
      ) {
        return;
      }
      clearSearch();
      setQuery(subject.name);
      setScope("resources");
      setSubjectId(subject.id);
    },
    [clearSearch, query, scope, subjectId],
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

  const currentSearch =
    search.kind !== "idle" && search.authorityKey === authorityKey
      ? search
      : null;
  const academicFailure =
    academic.kind === "offline" ||
    academic.kind === "timeout" ||
    academic.kind === "server_unavailable" ||
    academic.kind === "error";

  const renderSearchResults = (data: SearchResponse) => (
    <View style={styles.resultGroups}>
      <Text style={styles.copy}>
        Resultados para <Text style={styles.resultTitle}>{data.query}</Text>
      </Text>
      {(scope === "all" || scope === "resources") && (
        <ResourceGroup
          title="Apuntes y recursos"
          resources={data.results.resources}
          onOpen={openResource}
        />
      )}
      {(scope === "all" || scope === "subjects") && (
        <SubjectGroup subjects={data.results.subjects} onOpen={openSubject} />
      )}
      {(scope === "all" || scope === "people") && (
        <PeopleGroup result={data} onOpen={openPerson} />
      )}
      <Text style={styles.meta}>
        Mostramos hasta ocho resultados de cada tipo.
      </Text>
    </View>
  );

  return (
    <ProductSurface
      title="Buscar"
      description="Encontrá apuntes, materias y perfiles públicos con los permisos de acceso vigentes."
      onRefresh={session.kind === "authenticated" ? refresh : undefined}
      refreshing={academic.kind === "loading"}
    >
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
        <Text style={styles.meta}>Escribí entre 2 y 120 caracteres.</Text>
        <View accessibilityRole="tablist" style={styles.scopeList}>
          {SEARCH_SCOPES.map((option) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: scope === option.value }}
              key={option.value}
              onPress={() => {
                if (scope === option.value) return;
                clearSearch();
                setScope(option.value);
                setSubjectId(undefined);
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
        {subjectId ? (
          <Text style={styles.meta}>
            Filtrando por la materia que elegiste.
          </Text>
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

      {authorityKey && normalizedQuery.length < 2 ? (
        <View style={styles.card}>
          <Text style={styles.copy}>
            Escribí al menos dos caracteres para buscar.
          </Text>
        </View>
      ) : null}

      {authorityKey && normalizedQuery.length >= 2 ? (
        currentSearch?.kind === "loading" ? (
          <View style={styles.card}>
            <View style={styles.loadingRow}>
              <ActivityIndicator accessibilityLabel="Buscando" />
              <Text style={styles.copy}>Buscando…</Text>
            </View>
          </View>
        ) : currentSearch?.kind === "ready" ? (
          renderSearchResults(currentSearch.data)
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
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: "#20202a",
  },
  resultRow: {
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 12,
  },
  contextBucket: {
    gap: 8,
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
