import type { OrganizationCard, OrganizationType } from "@losapuntes/contracts";
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
import { useSession } from "@/features/session/session-provider";

import {
  MobileOrganizationsDirectoryController,
  type MobileOrganizationsDirectorySnapshot,
  type MobileOrganizationsFailure,
} from "./organizations-controller";
import { normalizeOrganizationQuery } from "./organizations-input-policy";
import { mobileOrganizationsApi } from "./organizations-runtime";

const types: Array<{ value: OrganizationType | null; label: string }> = [
  { value: null, label: "Todas" },
  { value: "student_center", label: "Centros" },
  { value: "club", label: "Clubes" },
  { value: "lab", label: "Laboratorios" },
  { value: "research_group", label: "Investigación" },
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
  onOpen,
}: {
  organization: OrganizationCard;
  onOpen: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir organización ${organization.name}`}
      onPress={onOpen}
      style={styles.row}
    >
      <View style={styles.rowHeading}>
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
      {organization.viewer?.following ? (
        <Text style={styles.following}>La seguís</Text>
      ) : null}
      <Text style={styles.action}>Ver organización</Text>
    </Pressable>
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

  const sessionKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey =
    sessionKey && isFocused && appState === "active"
      ? [sessionKey, "organizations", query || "all", type ?? "all"].join(":")
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
    });
    return () => controller.suspend(authorityKey);
  }, [authorityKey, controller, query, sessionKey, type]);

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
                  onOpen={() =>
                    router.push({
                      pathname: "/organizations/[organizationId]",
                      params: { organizationId: organization.id },
                    })
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

          {current.page.nextCursor ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: current.loadingMore }}
              disabled={current.loadingMore}
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
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
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
