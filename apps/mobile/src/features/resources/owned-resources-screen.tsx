import type {
  OwnedResourceSubjects,
  ResourceView,
  ResourceVisibility,
} from "@losapuntes/contracts";
import { Redirect, useIsFocused, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import {
  resourceFileSizeLabel,
  resourceFileTypeLabel,
  resourceRowAccessibilityLabel,
  resourceVisibilityLabel,
} from "./resource-details-copy";
import {
  MobileOwnedResourcesController,
  type OwnedResourcesSnapshot,
} from "./resource-owned-controller";
import { mobileOwnedResourcesApi } from "./resource-runtime";
import type { ResourceConsumptionFailure } from "./resource-consumption-controller";

const choices: Array<{
  value: ResourceVisibility | null;
  label: string;
}> = [
  { value: null, label: "Todos" },
  { value: "private", label: "Privados" },
  { value: "shared", label: "Compartidos" },
  { value: "public", label: "Públicos" },
];

const failureCopy: Record<ResourceConsumptionFailure, string> = {
  offline: "No hay conexión para consultar tus publicaciones.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "No podemos cargar tus publicaciones ahora.",
  forbidden: "Tu sesión no puede consultar estas publicaciones.",
  not_found: "Algunas publicaciones ya no están disponibles.",
  restricted: "La cuenta tiene restringido el acceso a sus publicaciones.",
  error: "No pudimos consultar tus publicaciones.",
};

function OwnedResourceRow({
  resource,
  onOpen,
}: {
  resource: ResourceView;
  onOpen: () => void;
}) {
  return (
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
        "Administrar mi apunte",
      )}
      onPress={onOpen}
      style={styles.resourceRow}
    >
      <Text style={styles.resourceTitle}>{resource.title}</Text>
      <Text style={styles.meta}>{resource.academic.subject.name}</Text>
      <Text style={styles.meta}>
        {resourceVisibilityLabel(resource.visibility)} ·{" "}
        {resourceFileTypeLabel(resource.file.mimeType)} ·{" "}
        {resourceFileSizeLabel(resource.file.byteSize)}
      </Text>
      <Text style={styles.meta}>
        Publicado: {new Date(resource.createdAt).toLocaleDateString("es-AR")}
      </Text>
      <Text style={styles.actionText}>Abrir y administrar</Text>
    </Pressable>
  );
}

export function OwnedResourcesScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { snapshot: session } = useSession();
  const [appState, setAppState] = useState(AppState.currentState);
  const [visibility, setVisibility] = useState<ResourceVisibility | null>(null);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [subjects, setSubjects] = useState<{
    authorityKey: string;
    data: OwnedResourceSubjects | null;
    failed: boolean;
  } | null>(null);
  const controller = useMemo(
    () => new MobileOwnedResourcesController(mobileOwnedResourcesApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<OwnedResourcesSnapshot>(
    controller.getSnapshot(),
  );
  const sessionKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey = isFocused && appState === "active" ? sessionKey : null;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setVisibility(null);
    setDraftQuery("");
    setQuery("");
    setSubjectId(null);
    setOrder("newest");
  }, [sessionKey]);

  useEffect(() => {
    if (!authorityKey) {
      controller.invalidate();
      return;
    }
    void controller.load(authorityKey, visibility, {
      ...(query ? { q: query } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(order !== "newest" ? { order } : {}),
    });
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller, visibility, query, subjectId, order]);

  useEffect(() => {
    if (!authorityKey) {
      setSubjects(null);
      return;
    }
    const active = new AbortController();
    setSubjects({ authorityKey, data: null, failed: false });
    void mobileOwnedResourcesApi
      .listSubjects(active.signal)
      .then((data) => {
        if (!active.signal.aborted) {
          setSubjects({ authorityKey, data, failed: false });
        }
      })
      .catch(() => {
        if (!active.signal.aborted) {
          setSubjects({ authorityKey, data: null, failed: true });
        }
      });
    return () => active.abort();
  }, [authorityKey]);

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  const current =
    snapshot.kind !== "idle" &&
    snapshot.authorityKey === authorityKey &&
    snapshot.visibility === visibility &&
    snapshot.filters.q === (query || null) &&
    snapshot.filters.subjectId === subjectId &&
    snapshot.filters.order === order
      ? snapshot
      : null;
  const ready = current?.kind === "ready" ? current : null;

  const refresh = () => {
    if (authorityKey) {
      void controller.load(authorityKey, visibility, {
        ...(query ? { q: query } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(order !== "newest" ? { order } : {}),
      });
    }
  };
  const normalizedDraft = draftQuery
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("es-AR");
  const canSearch =
    normalizedDraft.length === 0 ||
    (normalizedDraft.length >= 2 && normalizedDraft.length <= 120);
  const subjectResults =
    subjects?.authorityKey === authorityKey ? subjects : null;
  const hasFilters =
    !!query || !!subjectId || !!visibility || order !== "newest";

  return (
    <ProductSurface
      title="Mis apuntes"
      description="Tus publicaciones, privadas y compartidas. Abrí un apunte para corregirlo o administrar quién puede acceder."
      refreshing={current?.kind === "loading"}
      onRefresh={authorityKey ? refresh : undefined}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver a Perfil"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backText}>Volver</Text>
      </Pressable>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Tus publicaciones
        </Text>
        <Text style={styles.meta}>
          Ordenadas por fecha de publicación. Los conteos muestran únicamente
          las páginas cargadas.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver estadísticas de mis apuntes"
          onPress={() => router.push("/my-resource-statistics")}
          style={styles.statisticsLink}
        >
          <Text style={styles.statisticsLabel}>Ver mis estadísticas</Text>
        </Pressable>
        <Text style={styles.sectionLabel}>
          Buscar en todas mis publicaciones
        </Text>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Buscar mis apuntes por título, descripción o etiquetas"
            autoCorrect={false}
            returnKeyType="search"
            placeholder="Título, descripción o etiqueta"
            maxLength={120}
            value={draftQuery}
            onChangeText={setDraftQuery}
            onSubmitEditing={() => {
              if (canSearch) setQuery(normalizedDraft);
            }}
            style={styles.searchInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buscar entre mis publicaciones"
            accessibilityState={{ disabled: !canSearch }}
            disabled={!canSearch}
            onPress={() => setQuery(normalizedDraft)}
            style={[styles.filterButton, !canSearch && styles.disabled]}
          >
            <Text style={styles.filterText}>Buscar</Text>
          </Pressable>
        </View>
        {!canSearch ? (
          <Text accessibilityRole="alert" style={styles.error}>
            Escribí al menos 2 caracteres o borrá la búsqueda.
          </Text>
        ) : null}
        <Text style={styles.sectionLabel}>Visibilidad</Text>
        <View accessibilityRole="radiogroup" style={styles.filters}>
          {choices.map((option) => (
            <Pressable
              key={option.value ?? "all"}
              accessibilityRole="radio"
              accessibilityLabel={`Filtrar mis apuntes: ${option.label}`}
              accessibilityState={{ checked: visibility === option.value }}
              onPress={() => setVisibility(option.value)}
              style={[
                styles.filterButton,
                visibility === option.value && styles.filterSelected,
              ]}
            >
              <Text style={styles.filterText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionLabel}>Materia</Text>
        {subjectResults?.failed ? (
          <Text style={styles.error}>
            No se pudieron consultar tus materias. Volvé a entrar para
            reintentar.
          </Text>
        ) : subjectResults?.data ? (
          <>
            <View accessibilityRole="radiogroup">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.filters}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel="Todas las materias"
                    accessibilityState={{ checked: subjectId === null }}
                    onPress={() => setSubjectId(null)}
                    style={[
                      styles.filterButton,
                      subjectId === null && styles.filterSelected,
                    ]}
                  >
                    <Text style={styles.filterText}>Todas las materias</Text>
                  </Pressable>
                  {subjectResults.data.items.map((subject) => (
                    <Pressable
                      key={subject.subjectId}
                      accessibilityRole="radio"
                      accessibilityLabel={`Materia ${subject.name}: ${subject.count} publicaciones`}
                      accessibilityState={{
                        checked: subjectId === subject.subjectId,
                      }}
                      onPress={() => setSubjectId(subject.subjectId)}
                      style={[
                        styles.filterButton,
                        subjectId === subject.subjectId &&
                          styles.filterSelected,
                      ]}
                    >
                      <Text style={styles.filterText}>
                        {subject.name} ({subject.count})
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
            {subjectResults.data.truncated ? (
              <Text style={styles.meta}>
                Se muestran las 50 materias con más publicaciones.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.meta}>Cargando materias…</Text>
        )}
        <Text style={styles.sectionLabel}>Ordenar por publicación</Text>
        <View accessibilityRole="radiogroup" style={styles.filters}>
          {(
            [
              { value: "newest", label: "Más recientes" },
              { value: "oldest", label: "Más antiguos" },
            ] as const
          ).map((choice) => (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityState={{ checked: order === choice.value }}
              onPress={() => setOrder(choice.value)}
              style={[
                styles.filterButton,
                order === choice.value && styles.filterSelected,
              ]}
            >
              <Text style={styles.filterText}>{choice.label}</Text>
            </Pressable>
          ))}
        </View>
        {hasFilters ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Limpiar búsqueda y filtros"
            onPress={() => {
              setDraftQuery("");
              setQuery("");
              setVisibility(null);
              setSubjectId(null);
              setOrder("newest");
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonText}>Limpiar filtros</Text>
          </Pressable>
        ) : null}
      </View>

      {!current || current.kind === "loading" ? (
        <View style={styles.card}>
          <ActivityIndicator accessibilityLabel="Cargando mis apuntes" />
          <Text style={styles.meta}>Cargando tus publicaciones…</Text>
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
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text accessibilityLiveRegion="polite" style={styles.meta}>
              {ready?.data.items.length ?? 0} publicaciones cargadas
              {ready?.data.nextCursor ? " · Hay más apuntes" : ""}
            </Text>
            {ready?.data.items.length === 0 ? (
              <>
                <Text style={styles.meta}>
                  {ready.data.nextCursor
                    ? "No hay resultados en esta página. Cargá más para continuar."
                    : hasFilters
                      ? "No hay publicaciones que coincidan con estos filtros."
                      : "Todavía no publicaste apuntes. Podés crear tu primer recurso desde Crear."}
                </Text>
                {!hasFilters && !ready.data.nextCursor ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Crear un apunte"
                    onPress={() => router.push("/(tabs)/create")}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryText}>Crear un apunte</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              ready?.data.items.map((item) => (
                <OwnedResourceRow
                  key={item.id}
                  resource={item}
                  onOpen={() =>
                    router.push({
                      pathname: "/resources/[id]",
                      params: { id: item.id },
                    })
                  }
                />
              ))
            )}
          </View>

          {ready?.failure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureCopy[ready.failure]}
            </Text>
          ) : null}

          {ready?.cursorRepeated ? (
            <View style={styles.card}>
              <Text accessibilityRole="alert" style={styles.error}>
                El servidor devolvió un cursor repetido. Actualizá la lista para
                empezar de nuevo.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={refresh}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Actualizar publicaciones</Text>
              </Pressable>
            </View>
          ) : null}

          {ready?.data.nextCursor ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cargar más apuntes propios"
              accessibilityState={{ disabled: ready.loadingMore }}
              disabled={ready.loadingMore}
              onPress={() => {
                if (authorityKey) void controller.loadMore(authorityKey);
              }}
              style={[
                styles.secondaryButton,
                ready.loadingMore && styles.disabled,
              ]}
            >
              {ready.loadingMore ? (
                <ActivityIndicator accessibilityLabel="Cargando más apuntes" />
              ) : (
                <Text style={styles.buttonText}>Cargar más</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  statisticsLink: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  statisticsLabel: { color: "#43366a", fontWeight: "700", fontSize: 14 },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  backText: { color: "#43366a", fontWeight: "700", fontSize: 15 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  title: { color: "#20202a", fontWeight: "700", fontSize: 18 },
  meta: { color: "#686875", lineHeight: 20, fontSize: 13 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sectionLabel: { fontWeight: "700", color: "#20202a", fontSize: 14 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: {
    minHeight: 46,
    flex: 1,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 12,
    color: "#20202a",
    fontSize: 14,
  },
  filterButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  filterSelected: {
    borderColor: "#43366a",
    backgroundColor: "#f1eff8",
  },
  filterText: { color: "#20202a", fontSize: 14, fontWeight: "700" },
  resourceRow: {
    gap: 5,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dddce6",
  },
  resourceTitle: { color: "#20202a", fontSize: 16, fontWeight: "700" },
  actionText: { color: "#43366a", fontSize: 14, fontWeight: "700" },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  buttonText: { color: "#20202a", fontSize: 14, fontWeight: "700" },
  primaryButton: {
    backgroundColor: "#3446a2",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  error: { color: "#a12020", fontSize: 14, lineHeight: 20 },
  disabled: { opacity: 0.5 },
});
