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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AcademicCatalogNode } from "@losapuntes/contracts";
import type { ApiFailureKind } from "@/services/api/client";

import {
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import { useAcademicContext } from "./academic-context-provider";
import { AcademicInstitutionSearchController } from "./academic-onboarding-controller";

const searchFailureCopy: Record<ApiFailureKind, string> = {
  unauthorized: "Tu sesión venció. Iniciá sesión para continuar.",
  forbidden: "La cuenta no puede completar este paso ahora.",
  validation:
    "No pudimos validar la búsqueda. Revisá el nombre e intentá otra vez.",
  conflict: "El catálogo cambió mientras buscábamos. Volvé a buscar.",
  gone: "La búsqueda ya no está disponible. Volvé a intentarlo.",
  offline: "No hay conexión. Cuando vuelva, podés buscar la institución.",
  timeout: "La búsqueda tardó demasiado.",
  server_unavailable: "El catálogo académico no está disponible ahora.",
  unexpected: "No pudimos buscar instituciones.",
};

const activationFailureCopy: Record<ApiFailureKind, string> = {
  unauthorized: "Tu sesión venció. Iniciá sesión y volvé a intentarlo.",
  forbidden: "La cuenta no puede agregar una afiliación ahora.",
  validation:
    "El servidor no pudo validar esta afiliación. Actualizá el catálogo e intentá otra vez.",
  conflict:
    "La afiliación cambió mientras la guardábamos. Revalidá el contexto.",
  gone: "La institución ya no está disponible en el catálogo.",
  offline:
    "No hay conexión. Revisá el estado de la afiliación antes de volver a enviarla.",
  timeout:
    "La respuesta tardó demasiado. Revisá el estado antes de volver a enviarla.",
  server_unavailable:
    "El servicio académico no respondió. Revisá el estado antes de volver a enviarla.",
  unexpected: "No pudimos completar la afiliación.",
};

type ActivationNotice =
  | { authorityKey: string; kind: "complete" }
  | { authorityKey: string; kind: "reconcile" }
  | {
      authorityKey: string;
      kind: "failure";
      failure: ApiFailureKind;
    };

export function AcademicOnboardingScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { snapshot: session } = useSession();
  const {
    snapshot: academic,
    retry: retryAcademic,
    catalogSearch,
    addInstitutionAffiliation,
  } = useAcademicContext();
  const [appState, setAppState] = useState(AppState.currentState);
  const [query, setQuery] = useState("");
  const [selectedInstitution, setSelectedInstitution] =
    useState<AcademicCatalogNode | null>(null);
  const [notice, setNotice] = useState<ActivationNotice | null>(null);
  const [submittingAuthority, setSubmittingAuthority] = useState<string | null>(
    null,
  );
  const activeAuthorityRef = useRef<string | null>(null);

  const searchController = useMemo(
    () => new AcademicInstitutionSearchController({ catalogSearch }),
    [catalogSearch],
  );
  const [search, setSearch] = useState(searchController.getSnapshot());

  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey = activeNavigationAuthorityKey(
    sessionAuthority,
    isFocused,
    appState,
  );
  activeAuthorityRef.current = authorityKey;

  useEffect(() => searchController.subscribe(setSearch), [searchController]);

  useEffect(() => {
    searchController.setAuthority(authorityKey);
    return () => searchController.invalidate(authorityKey ?? undefined);
  }, [authorityKey, searchController]);

  useEffect(() => {
    setQuery("");
    setSelectedInstitution(null);
    setNotice(null);
  }, [authorityKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  const searchInstitutions = useCallback(() => {
    if (!authorityKey) return;
    setSelectedInstitution(null);
    setNotice(null);
    void searchController.search(authorityKey, query);
  }, [authorityKey, query, searchController]);

  const activateInstitution = useCallback(
    async (institution: AcademicCatalogNode) => {
      if (!authorityKey || submittingAuthority) return;
      setSubmittingAuthority(authorityKey);
      setNotice(null);
      try {
        const result = await addInstitutionAffiliation(institution.id);
        if (activeAuthorityRef.current !== authorityKey) return;

        if (result.kind === "selected") {
          setNotice({ authorityKey, kind: "complete" });
        } else if (result.kind === "reconcile") {
          setNotice({ authorityKey, kind: "reconcile" });
        } else if (result.kind === "failed") {
          setNotice({
            authorityKey,
            kind: "failure",
            failure: result.failure,
          });
        }
      } finally {
        setSubmittingAuthority((current) =>
          current === authorityKey ? null : current,
        );
      }
    },
    [
      activeAuthorityRef,
      addInstitutionAffiliation,
      authorityKey,
      submittingAuthority,
    ],
  );

  const authoritySearch =
    authorityKey &&
    search.kind !== "idle" &&
    search.authorityKey === authorityKey
      ? search
      : null;
  const activeSearch =
    authoritySearch?.query === query.trim() ? authoritySearch : null;
  const visibleNotice = notice?.authorityKey === authorityKey ? notice : null;
  const academicReady =
    academic.kind === "ready" || academic.kind === "no_context";
  const submitting = submittingAuthority === authorityKey;

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  return (
    <ProductSurface
      title="Agregar institución"
      description="Elegí una institución del catálogo académico para iniciar tu contexto. El servidor valida y conserva la afiliación."
      onRefresh={authorityKey ? () => void retryAcademic() : undefined}
      refreshing={academic.kind === "loading"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => router.back()}
        style={styles.secondaryButton}
      >
        <Text style={styles.buttonLabel}>Volver</Text>
      </Pressable>

      {!authorityKey ? (
        <View style={styles.card}>
          <Text style={styles.copy}>
            Revalidá tu sesión para buscar una institución.
          </Text>
        </View>
      ) : null}

      {!academicReady ? (
        <View style={styles.card}>
          {academic.kind === "loading" || academic.kind === "unavailable" ? (
            <View style={styles.inline}>
              <ActivityIndicator accessibilityLabel="Validando contexto académico" />
              <Text style={styles.copy}>Validando tus afiliaciones…</Text>
            </View>
          ) : (
            <>
              <Text accessibilityRole="alert" style={styles.error}>
                No pudimos validar tus afiliaciones. Reintentá antes de agregar
                otra institución.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void retryAcademic()}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonLabel}>Reintentar</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {visibleNotice?.kind === "complete" ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Contexto académico listo
          </Text>
          <Text style={styles.copy}>
            Tu afiliación a {selectedInstitution?.name ?? "la institución"}{" "}
            quedó confirmada como contexto actual. Podés sumar carrera y
            materias después.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(tabs)/home")}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonLabel}>Volver al inicio</Text>
          </Pressable>
        </View>
      ) : null}

      {visibleNotice?.kind === "reconcile" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            No pudimos confirmar si ya existe una afiliación o si la solicitud
            quedó guardada. Revalidá el estado antes de volver a enviarla.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={submitting || !academicReady}
            onPress={() =>
              selectedInstitution
                ? void activateInstitution(selectedInstitution)
                : void retryAcademic()
            }
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonLabel}>
              {submitting ? "Revisando…" : "Revisar estado"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {visibleNotice?.kind === "failure" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {activationFailureCopy[visibleNotice.failure]}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={submitting || !academicReady || !selectedInstitution}
            onPress={() =>
              selectedInstitution
                ? void activateInstitution(selectedInstitution)
                : undefined
            }
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonLabel}>
              {submitting ? "Guardando…" : "Reintentar"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {visibleNotice?.kind !== "complete" ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Buscar universidad o institución
          </Text>
          <Text style={styles.copy}>
            Buscá por el nombre oficial o una abreviatura. Solo aparecen
            instituciones activas del catálogo.
          </Text>
          <TextInput
            accessibilityLabel="Nombre de la institución"
            autoCapitalize="words"
            autoCorrect={false}
            editable={Boolean(authorityKey) && academicReady && !submitting}
            maxLength={120}
            onChangeText={(value) => {
              setQuery(value);
              setSelectedInstitution(null);
              setNotice(null);
            }}
            onSubmitEditing={searchInstitutions}
            placeholder="Ej.: Universidad Nacional…"
            returnKeyType="search"
            style={styles.input}
            value={query}
          />
          <Pressable
            accessibilityRole="button"
            disabled={
              !authorityKey ||
              !academicReady ||
              submitting ||
              query.trim().length < 2 ||
              activeSearch?.kind === "loading"
            }
            onPress={searchInstitutions}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonLabel}>
              {activeSearch?.kind === "loading" ? "Buscando…" : "Buscar"}
            </Text>
          </Pressable>

          {activeSearch?.kind === "failure" ? (
            <View style={styles.inlineMessage}>
              <Text accessibilityRole="alert" style={styles.error}>
                {searchFailureCopy[activeSearch.failure]}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={!authorityKey || submitting}
                onPress={searchInstitutions}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonLabel}>Reintentar búsqueda</Text>
              </Pressable>
            </View>
          ) : null}

          {activeSearch?.kind === "ready" ? (
            <View style={styles.results}>
              {activeSearch.items.length === 0 ? (
                <Text style={styles.copy}>
                  No encontramos instituciones activas con ese nombre. Probá con
                  el nombre oficial o una abreviatura.
                </Text>
              ) : (
                activeSearch.items.map((item) => {
                  const selected = selectedInstitution?.id === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Seleccionar institución ${item.name}`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setSelectedInstitution(item);
                        setNotice(null);
                      }}
                      style={[
                        styles.institution,
                        selected ? styles.institutionSelected : null,
                      ]}
                    >
                      <Text style={styles.institutionName}>{item.name}</Text>
                      <Text style={styles.institutionHint}>
                        {selected
                          ? "Institución elegida"
                          : "Tocá para elegir esta institución"}
                      </Text>
                    </Pressable>
                  );
                })
              )}

              {activeSearch.failure ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {searchFailureCopy[activeSearch.failure]}
                </Text>
              ) : null}

              {activeSearch.nextCursor ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={activeSearch.loadingMore || submitting}
                  onPress={() =>
                    authorityKey
                      ? void searchController.loadMore(authorityKey)
                      : undefined
                  }
                  style={styles.secondaryButton}
                >
                  <Text style={styles.buttonLabel}>
                    {activeSearch.loadingMore
                      ? "Cargando…"
                      : activeSearch.failure
                        ? "Reintentar más resultados"
                        : "Ver más instituciones"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {selectedInstitution ? (
            <View style={styles.selection}>
              <Text style={styles.copy}>
                Vas a agregar una afiliación activa para:
              </Text>
              <Text style={styles.institutionName}>
                {selectedInstitution.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={!authorityKey || !academicReady || submitting}
                onPress={() => void activateInstitution(selectedInstitution)}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonLabel}>
                  {submitting ? "Validando…" : "Agregar y usar institución"}
                </Text>
              </Pressable>
              <Text style={styles.note}>
                La institución se agrega a tu perfil académico. Podés configurar
                carrera y materias después.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5b5b66",
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inlineMessage: {
    gap: 10,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#20202a",
    fontSize: 16,
  },
  results: {
    gap: 10,
  },
  institution: {
    minHeight: 58,
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#d6d6df",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  institutionSelected: {
    borderColor: "#24243a",
    backgroundColor: "#f2f2f7",
  },
  institutionName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#20202a",
  },
  institutionHint: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5b5b66",
  },
  selection: {
    gap: 10,
    borderTopWidth: 1,
    borderColor: "#e5e5eb",
    paddingTop: 14,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5b5b66",
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#24243a",
  },
  primaryButtonLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#24243a",
  },
});
