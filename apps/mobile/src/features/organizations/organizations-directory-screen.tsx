import type {
  AcademicCatalogNode,
  OrganizationCard,
  OrganizationType,
} from "@losapuntes/contracts";
import { Redirect, useIsFocused, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { PublicAvatar } from "@/features/profile/public-avatar";
import { useSession } from "@/features/session/session-provider";
import { mobileAcademicFollowsApi } from "@/features/academic/academic-follows-runtime";

import {
  MobileOrganizationsDirectoryController,
  type MobileOrganizationsDirectorySnapshot,
  type MobileOrganizationsDirectoryFollowAction,
  type MobileOrganizationsFailure,
} from "./organizations-controller";
import { normalizeOrganizationQuery } from "./organizations-input-policy";
import { mobileOrganizationsApi } from "./organizations-runtime";

const types: Array<{ value: OrganizationType | null; label: string }> = [
  { value: null, label: "Todas" },
  { value: "student_center", label: "Centros" },
  { value: "association", label: "Asociaciones" },
  { value: "club", label: "Clubes" },
  { value: "lab", label: "Laboratorios" },
  { value: "research_group", label: "Investigación" },
  { value: "incubator", label: "Incubadoras" },
  { value: "cultural_sports", label: "Cultura y deportes" },
  { value: "career_community", label: "Carreras" },
  { value: "alumni_association", label: "Graduados" },
];

const typeLabel: Record<OrganizationType, string> = {
  student_center: "Centro de estudiantes",
  association: "Asociación",
  club: "Club",
  lab: "Laboratorio",
  research_group: "Grupo de investigación",
  alumni_association: "Asociación de graduados",
  incubator: "Incubadora",
  cultural_sports: "Grupo cultural o deportivo",
  career_community: "Comunidad de carrera",
};

function failureMessage(failure: MobileOrganizationsFailure): string {
  if (failure.kind === "offline") {
    return "No hay conexión. Reintentá cuando vuelvas a estar en línea.";
  }
  if (failure.kind === "timeout") {
    return "El servidor tardó demasiado en responder.";
  }
  if (failure.kind === "server_unavailable") {
    return "El directorio no está disponible ahora.";
  }
  if (failure.kind === "auth_required") {
    return "La sesión cambió. Iniciá sesión nuevamente.";
  }
  if (failure.kind === "restricted") {
    return "La cuenta no puede consultar este directorio.";
  }
  return "No pudimos cargar las organizaciones.";
}

function OrganizationRow({
  organization,
  followAction,
  followActionBusy,
  onOpen,
  onToggleFollow,
}: {
  organization: OrganizationCard;
  followAction: MobileOrganizationsDirectoryFollowAction | null;
  followActionBusy: boolean;
  onOpen: () => void;
  onToggleFollow: () => void;
}) {
  const following = organization.viewer?.following === true;
  const action =
    followAction?.organizationId === organization.id ? followAction : null;
  const busy = action?.status === "loading";

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir organización ${organization.name}`}
        onPress={onOpen}
        style={styles.rowOpen}
      >
        <View style={styles.rowHeading}>
          <PublicAvatar
            avatarUrl={organization.avatarUrl}
            displayName={organization.name}
            size="small"
          />
          <Text style={styles.rowTitle}>{organization.name}</Text>
          {organization.verificationState === "verified" ? (
            <Text
              accessibilityLabel="Organización verificada"
              style={styles.badge}
            >
              Verificada
            </Text>
          ) : null}
        </View>
        <Text style={styles.meta}>{typeLabel[organization.type]}</Text>
        <Text style={styles.meta}>{organization.institution.name}</Text>
        {following ? <Text style={styles.following}>La seguís</Text> : null}
        <Text style={styles.action}>Ver organización</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${following ? "Dejar de seguir" : "Seguir"} ${organization.name}`}
        accessibilityState={{ busy, disabled: followActionBusy }}
        disabled={followActionBusy}
        onPress={onToggleFollow}
        style={[styles.followButton, following && styles.followingButton]}
      >
        <Text
          style={[
            styles.followButtonText,
            following && styles.followingButtonText,
          ]}
        >
          {busy ? "Actualizando…" : following ? "Dejar de seguir" : "Seguir"}
        </Text>
      </Pressable>
      {action?.message ? (
        <Text
          accessibilityLiveRegion={
            action.status === "failure" ? undefined : "polite"
          }
          accessibilityRole={action.status === "failure" ? "alert" : "text"}
          style={action.status === "failure" ? styles.error : styles.following}
        >
          {action.message}
        </Text>
      ) : null}
    </View>
  );
}

export function MobileOrganizationsDirectoryScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { snapshot: session } = useSession();
  const controller = useMemo(
    () => new MobileOrganizationsDirectoryController(mobileOrganizationsApi),
    [],
  );
  const [snapshot, setSnapshot] =
    useState<MobileOrganizationsDirectorySnapshot>(controller.getSnapshot());
  const [appState, setAppState] = useState(AppState.currentState);
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [type, setType] = useState<OrganizationType | null>(null);
  const [filterInstitutionQuery, setFilterInstitutionQuery] = useState("");
  const [filterInstitutionSelection, setFilterInstitutionSelection] = useState<{
    sessionKey: string;
    institution: Pick<AcademicCatalogNode, "id" | "name">;
  } | null>(null);
  const [institutionSearchRequest, setInstitutionSearchRequest] = useState<{
    authorityKey: string;
    query: string;
  } | null>(null);
  const [institutionSearchState, setInstitutionSearchState] = useState<{
    scopeKey: string;
    phase: "loading" | "ready" | "failure";
    items: AcademicCatalogNode[];
  } | null>(null);

  const sessionKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const filterInstitution =
    filterInstitutionSelection?.sessionKey === sessionKey
      ? filterInstitutionSelection.institution
      : null;
  const authorityKey =
    sessionKey && isFocused && appState === "active"
      ? [
          sessionKey,
          "organizations",
          query || "all",
          type ?? "all",
          filterInstitution?.id ?? "all-institutions",
        ].join(":")
      : null;
  const institutionFilterSearchScopeKey = [
    authorityKey ?? "inactive-organizations",
    filterInstitutionQuery.trim(),
  ].join(":");
  const institutionSearch =
    institutionSearchState?.scopeKey === institutionFilterSearchScopeKey
      ? institutionSearchState
      : null;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!authorityKey) {
      if (sessionKey) controller.suspend(authorityKey ?? sessionKey);
      else controller.invalidate();
      return;
    }

    void controller.load(authorityKey, {
      ...(query ? { q: query } : {}),
      ...(type ? { type } : {}),
      ...(filterInstitution ? { institutionId: filterInstitution.id } : {}),
    });
    return () => controller.suspend(authorityKey);
  }, [
    authorityKey,
    controller,
    filterInstitution?.id,
    query,
    sessionKey,
    type,
  ]);

  useEffect(() => {
    const request = institutionSearchRequest;
    if (
      !authorityKey ||
      !request ||
      request.authorityKey !== authorityKey ||
      request.query !== filterInstitutionQuery.trim()
    ) {
      return;
    }

    const abortController = new AbortController();
    let current = true;
    setInstitutionSearchState({
      scopeKey: institutionFilterSearchScopeKey,
      phase: "loading",
      items: [],
    });

    void mobileAcademicFollowsApi
      .search("institution", request.query, undefined, abortController.signal)
      .then((result) => {
        if (!current) return;
        setInstitutionSearchState({
          scopeKey: institutionFilterSearchScopeKey,
          phase: "ready",
          items: result.items,
        });
      })
      .catch(() => {
        if (!current || abortController.signal.aborted) return;
        setInstitutionSearchState({
          scopeKey: institutionFilterSearchScopeKey,
          phase: "failure",
          items: [],
        });
      });

    return () => {
      current = false;
      abortController.abort();
    };
  }, [
    authorityKey,
    filterInstitutionQuery,
    institutionFilterSearchScopeKey,
    institutionSearchRequest,
  ]);

  useEffect(
    () => () => {
      controller.invalidate();
    },
    [controller],
  );

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;
  const directoryActionBusy =
    current?.kind === "ready" &&
    (current.loadingMore || current.followAction?.status === "loading");

  const applySearch = () => {
    const result = normalizeOrganizationQuery(queryDraft);
    if (!result.ok) {
      setQueryError(result.message);
      return;
    }

    setQueryError(null);
    setQuery(result.query);
  };

  const retry = () => {
    if (!authorityKey) return;
    void controller.load(authorityKey, {
      ...(query ? { q: query } : {}),
      ...(type ? { type } : {}),
      ...(filterInstitution ? { institutionId: filterInstitution.id } : {}),
    });
  };

  const searchFilterInstitutions = () => {
    const searchQuery = filterInstitutionQuery.trim();
    if (searchQuery.length < 2 || !authorityKey) return;
    setInstitutionSearchRequest({
      authorityKey,
      query: searchQuery,
    });
  };

  return (
    <ProductSurface
      title="Organizaciones"
      description="Centros, clubes, laboratorios y comunidades del campus. La verificación confirma un claim revisado; no implica respaldo de Los Apuntes."
      onRefresh={authorityKey ? retry : undefined}
      refreshing={current?.kind === "loading"}
    >
      <View style={styles.card}>
        <Text style={styles.label}>Buscar por nombre</Text>
        <TextInput
          accessibilityLabel="Buscar organizaciones por nombre"
          autoCorrect={false}
          maxLength={120}
          onChangeText={(value) => {
            setQueryDraft(value);
            if (queryError) setQueryError(null);
          }}
          onSubmitEditing={applySearch}
          placeholder="Ej. GIDAS"
          returnKeyType="search"
          style={styles.input}
          value={queryDraft}
        />
        <Text style={styles.meta}>
          Dejá vacío para ver todo o escribí entre 2 y 120 caracteres.
        </Text>
        {queryError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {queryError}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={applySearch}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Buscar</Text>
        </Pressable>

        <Text style={styles.label}>Tipo</Text>
        <View accessibilityRole="radiogroup" style={styles.filters}>
          {types.map((option) => {
            const selected = type === option.value;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option.value ?? "all"}
                onPress={() => setType(option.value)}
                style={[styles.filter, selected && styles.filterSelected]}
              >
                <Text
                  style={[
                    styles.filterText,
                    selected && styles.filterTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Filtrar por institución</Text>
        <TextInput
          accessibilityLabel="Buscar institución para filtrar organizaciones"
          autoCorrect={false}
          maxLength={120}
          onChangeText={(value) => {
            setFilterInstitutionQuery(value);
            setFilterInstitutionSelection(null);
            setInstitutionSearchRequest(null);
            setInstitutionSearchState(null);
          }}
          onSubmitEditing={searchFilterInstitutions}
          placeholder="Buscar universidad"
          returnKeyType="search"
          style={styles.input}
          value={filterInstitutionQuery}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            busy: institutionSearch?.phase === "loading",
            disabled:
              filterInstitutionQuery.trim().length < 2 ||
              institutionSearch?.phase === "loading",
          }}
          disabled={
            filterInstitutionQuery.trim().length < 2 ||
            institutionSearch?.phase === "loading"
          }
          onPress={searchFilterInstitutions}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>
            {institutionSearch?.phase === "loading"
              ? "Buscando…"
              : "Buscar institución"}
          </Text>
        </Pressable>
        {filterInstitution ? (
          <View style={styles.selectedInstitution}>
            <Text style={styles.following}>
              Filtro activo: {filterInstitution.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar filtro de institución"
              onPress={() => {
                setFilterInstitutionSelection(null);
                setFilterInstitutionQuery("");
                setInstitutionSearchRequest(null);
                setInstitutionSearchState(null);
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Quitar filtro</Text>
            </Pressable>
          </View>
        ) : null}
        {institutionSearch?.phase === "failure" ? (
          <Text accessibilityRole="alert" style={styles.error}>
            No pudimos buscar instituciones. Revisá la conexión e intentá de
            nuevo.
          </Text>
        ) : institutionSearch?.phase === "ready" &&
          institutionSearch.items.length === 0 ? (
          <Text accessibilityLiveRegion="polite" style={styles.meta}>
            No encontramos instituciones con ese nombre.
          </Text>
        ) : null}
        {institutionSearch?.phase === "ready" &&
        institutionSearch.items.length > 0 ? (
          <View style={styles.institutionOptions}>
            {institutionSearch.items.map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Seleccionar institución ${option.name}`}
                key={option.id}
                onPress={() => {
                  if (!sessionKey) return;
                  setFilterInstitutionSelection({
                    sessionKey,
                    institution: { id: option.id, name: option.name },
                  });
                  setFilterInstitutionQuery(option.name);
                  setInstitutionSearchRequest(null);
                  setInstitutionSearchState(null);
                }}
                style={styles.institutionOption}
              >
                <Text style={styles.secondaryButtonText}>{option.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {!current || current.kind === "loading" ? (
        <View style={styles.card}>
          <View style={styles.loading}>
            <ActivityIndicator accessibilityLabel="Cargando organizaciones" />
            <Text style={styles.copy}>Consultando el directorio…</Text>
          </View>
        </View>
      ) : current.kind === "failure" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureMessage(current.failure)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Directorio
            </Text>
            {current.page.items.length === 0 ? (
              <Text style={styles.copy}>
                No encontramos organizaciones con esos filtros.
              </Text>
            ) : (
              current.page.items.map((organization) => (
                <OrganizationRow
                  key={organization.id}
                  organization={organization}
                  followAction={current.followAction}
                  followActionBusy={directoryActionBusy}
                  onOpen={() =>
                    router.push({
                      pathname: "/organizations/[organizationId]",
                      params: { organizationId: organization.id },
                    })
                  }
                  onToggleFollow={() =>
                    void controller.toggleFollow(
                      current.authorityKey,
                      organization.id,
                    )
                  }
                />
              ))
            )}
          </View>

          {current.failure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureMessage(current.failure)}
            </Text>
          ) : null}

          {current.cursorRepeated ? (
            <View style={styles.card}>
              <Text accessibilityRole="alert" style={styles.error}>
                El servidor devolvió un cursor repetido. Actualizá el directorio
                para empezar de nuevo.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={retry}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>
                  Actualizar directorio
                </Text>
              </Pressable>
            </View>
          ) : null}

          {current.page.nextCursor ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: current.loadingMore || directoryActionBusy,
              }}
              disabled={current.loadingMore || directoryActionBusy}
              onPress={() => void controller.loadMore(current.authorityKey)}
              style={[
                styles.secondaryButton,
                current.loadingMore && styles.disabled,
              ]}
            >
              {current.loadingMore ? (
                <ActivityIndicator accessibilityLabel="Cargando más organizaciones" />
              ) : (
                <Text style={styles.secondaryButtonText}>Cargar más</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
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
    color: "#30303a",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d2d2dc",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#20202a",
    backgroundColor: "#ffffff",
  },
  selectedInstitution: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  institutionOptions: {
    gap: 6,
  },
  institutionOption: {
    minHeight: 46,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9cad4",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  filter: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9cad4",
    borderRadius: 21,
    paddingHorizontal: 12,
  },
  filterSelected: {
    borderColor: "#352b55",
    backgroundColor: "#352b55",
  },
  filterText: {
    color: "#383844",
    fontSize: 13,
    fontWeight: "700",
  },
  filterTextSelected: {
    color: "#ffffff",
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: "#20202a",
  },
  row: {
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 12,
  },
  rowOpen: {
    gap: 5,
  },
  rowHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#20202a",
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#eef1ff",
    color: "#3446a2",
    fontSize: 11,
    fontWeight: "800",
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
  following: {
    color: "#17643a",
    fontSize: 12,
    fontWeight: "700",
  },
  followButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#43366a",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  followingButton: {
    borderColor: "#c9cad4",
    backgroundColor: "#f8f8fb",
  },
  followButtonText: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  followingButtonText: {
    color: "#34343f",
  },
  action: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  loading: {
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
    borderColor: "#c9cad4",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: "#292933",
    fontSize: 15,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.48,
  },
  error: {
    color: "#9a1d2d",
    fontSize: 14,
    lineHeight: 21,
  },
});
