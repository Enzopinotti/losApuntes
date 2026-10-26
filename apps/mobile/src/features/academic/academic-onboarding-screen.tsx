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

import type {
  AcademicCatalogNode,
  AcademicNodeKind,
  AcademicSubjectParticipation,
  SubjectParticipationState,
} from "@losapuntes/contracts";
import type { ApiFailureKind } from "@/services/api/client";

import {
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import { useAcademicContext } from "./academic-context-provider";
import { AcademicCatalogSearchController } from "./academic-onboarding-controller";

const searchFailureCopy: Record<ApiFailureKind, string> = {
  unauthorized: "Tu sesión venció. Iniciá sesión para continuar.",
  forbidden: "La cuenta no puede completar este paso ahora.",
  validation:
    "No pudimos validar la búsqueda. Revisá el nombre e intentá otra vez.",
  conflict: "El catálogo cambió mientras buscábamos. Volvé a buscar.",
  gone: "La búsqueda ya no está disponible. Volvé a intentarlo.",
  offline: "No hay conexión. Cuando vuelva, podés buscar en el catálogo.",
  timeout: "La búsqueda tardó demasiado.",
  server_unavailable: "El catálogo académico no está disponible ahora.",
  unexpected: "No pudimos realizar la búsqueda.",
};

const activationFailureCopy: Record<ApiFailureKind, string> = {
  unauthorized: "Tu sesión venció. Iniciá sesión y volvé a intentarlo.",
  forbidden: "La cuenta no puede agregar una afiliación ahora.",
  validation:
    "El servidor no pudo validar esta afiliación. Actualizá el catálogo e intentá otra vez.",
  conflict:
    "La afiliación o el contexto cambió mientras guardábamos. Revalidalo.",
  gone: "La institución o carrera ya no está disponible en el catálogo.",
  offline:
    "No hay conexión. Revisá el estado de la afiliación antes de volver a enviarla.",
  timeout:
    "La respuesta tardó demasiado. Revisá el estado antes de volver a enviarla.",
  server_unavailable:
    "El servicio académico no respondió. Revisá el estado antes de volver a enviarla.",
  unexpected: "No pudimos completar la afiliación.",
};

const subjectFailureCopy: Record<ApiFailureKind, string> = {
  unauthorized: "Tu sesión venció. Iniciá sesión y volvé a intentarlo.",
  forbidden: "La cuenta no puede agregar materias ahora.",
  validation:
    "El servidor no pudo validar la materia. Actualizá el catálogo e intentá otra vez.",
  conflict: "El contexto académico cambió mientras guardábamos. Revalidalo.",
  gone: "La materia ya no está disponible en el catálogo.",
  offline:
    "No hay conexión. Revisá si la materia quedó guardada antes de volver a enviarla.",
  timeout: "La respuesta tardó demasiado. Revisá si la materia quedó guardada.",
  server_unavailable:
    "El servicio académico no respondió. Revisá si la materia quedó guardada.",
  unexpected: "No pudimos agregar esta materia.",
};

type OnboardingStep = "institution" | "program" | "subjects";

type OnboardingNotice =
  | { authorityKey: string; stage: "affiliation"; kind: "reconcile" }
  | {
      authorityKey: string;
      stage: "affiliation";
      kind: "failure";
      failure: ApiFailureKind;
    }
  | {
      authorityKey: string;
      stage: "subject";
      kind: "complete";
      state: Extract<SubjectParticipationState, "planned" | "current">;
    }
  | {
      authorityKey: string;
      stage: "subject";
      kind: "reconcile";
      state: Extract<SubjectParticipationState, "planned" | "current">;
    }
  | {
      authorityKey: string;
      stage: "subject";
      kind: "failure";
      failure: ApiFailureKind;
      state: Extract<SubjectParticipationState, "planned" | "current">;
    };

const stepCopy: Record<OnboardingStep, { title: string; description: string }> =
  {
    institution: {
      title: "Elegí tu institución",
      description:
        "Buscá una institución del catálogo. Después podés agregar tu carrera y las materias que estás cursando.",
    },
    program: {
      title: "Elegí tu carrera",
      description:
        "La carrera es opcional. Si no aparece en el catálogo, podés continuar solo con tu institución.",
    },
    subjects: {
      title: "Sumá tus materias",
      description:
        "Buscá materias relacionadas con tu institución o carrera. El servidor valida la materia actual y el contexto; una planificada no cambia tu contexto.",
    },
  };

const labels: Record<
  OnboardingStep,
  { input: string; placeholder: string; empty: string; more: string }
> = {
  institution: {
    input: "Nombre de la institución",
    placeholder: "Ej.: Universidad Nacional…",
    empty:
      "No encontramos instituciones activas con ese nombre. Probá con el nombre oficial o una abreviatura.",
    more: "Ver más instituciones",
  },
  program: {
    input: "Nombre de la carrera",
    placeholder: "Ej.: Medicina, Ingeniería…",
    empty:
      "No encontramos carreras activas en esta institución. Podés probar otra búsqueda o continuar sin carrera.",
    more: "Ver más carreras",
  },
  subjects: {
    input: "Nombre de la materia",
    placeholder: "Ej.: Álgebra, Anatomía…",
    empty:
      "No encontramos materias activas en esta selección. Probá con otra búsqueda.",
    more: "Ver más materias",
  },
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
    addSubjectParticipation,
  } = useAcademicContext();
  const [appState, setAppState] = useState(AppState.currentState);
  const [step, setStep] = useState<OnboardingStep>("institution");
  const [query, setQuery] = useState("");
  const [selectedInstitution, setSelectedInstitution] =
    useState<AcademicCatalogNode | null>(null);
  const [selectedProgram, setSelectedProgram] =
    useState<AcademicCatalogNode | null>(null);
  const [selectedAffiliationId, setSelectedAffiliationId] = useState<
    string | null
  >(null);
  const [selectedItem, setSelectedItem] = useState<AcademicCatalogNode | null>(
    null,
  );
  const [addedSubjects, setAddedSubjects] = useState<
    AcademicSubjectParticipation[]
  >([]);
  const [notice, setNotice] = useState<OnboardingNotice | null>(null);
  const [submittingAuthority, setSubmittingAuthority] = useState<string | null>(
    null,
  );
  const activeAuthorityRef = useRef<string | null>(null);

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

  const searchKind: Extract<
    AcademicNodeKind,
    "institution" | "program" | "subject"
  > =
    step === "institution"
      ? "institution"
      : step === "program"
        ? "program"
        : "subject";
  const parentId =
    step === "program"
      ? selectedInstitution?.id
      : step === "subjects"
        ? (selectedProgram?.id ?? selectedInstitution?.id)
        : undefined;
  const searchController = useMemo(
    () =>
      new AcademicCatalogSearchController(
        { catalogSearch },
        searchKind,
        parentId,
      ),
    [catalogSearch, parentId, searchKind],
  );
  const [search, setSearch] = useState(searchController.getSnapshot());

  useEffect(() => searchController.subscribe(setSearch), [searchController]);

  useEffect(() => {
    searchController.setAuthority(authorityKey);
    return () => searchController.invalidate(authorityKey ?? undefined);
  }, [authorityKey, searchController]);

  useEffect(() => {
    setStep("institution");
    setQuery("");
    setSelectedInstitution(null);
    setSelectedProgram(null);
    setSelectedAffiliationId(null);
    setSelectedItem(null);
    setAddedSubjects([]);
    setNotice(null);
  }, [authorityKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  const searchCatalog = useCallback(() => {
    if (!authorityKey || (step !== "institution" && !parentId)) return;
    setSelectedItem(null);
    setNotice(null);
    void searchController.search(authorityKey, query);
  }, [authorityKey, parentId, query, searchController, step]);

  const selectCatalogItem = useCallback(
    (item: AcademicCatalogNode) => {
      setNotice(null);
      if (step === "institution") {
        setSelectedInstitution(item);
        setSelectedProgram(null);
        setSelectedItem(null);
        setQuery("");
        setStep("program");
        return;
      }
      setSelectedItem(item);
      if (item.kind === "program") setSelectedProgram(item);
    },
    [step],
  );

  const activateAffiliation = useCallback(
    async (program: AcademicCatalogNode | null) => {
      const institution = selectedInstitution;
      if (!authorityKey || !institution || submittingAuthority) return;
      setSubmittingAuthority(authorityKey);
      setNotice(null);
      try {
        const result = await addInstitutionAffiliation(
          institution.id,
          program?.id,
        );
        if (activeAuthorityRef.current !== authorityKey) return;

        if (result.kind === "selected") {
          const resolvedProgram =
            program ??
            (result.affiliation.programId
              ? {
                  id: result.affiliation.programId,
                  kind: "program" as const,
                  name: "Carrera ya asociada",
                  parentIds: [institution.id],
                  status: "active" as const,
                }
              : null);
          setSelectedProgram(resolvedProgram);
          setSelectedAffiliationId(result.affiliation.id);
          setSelectedItem(null);
          setQuery("");
          setNotice(null);
          setStep("subjects");
        } else if (result.kind === "reconcile") {
          setNotice({ authorityKey, stage: "affiliation", kind: "reconcile" });
        } else if (result.kind === "failed") {
          setNotice({
            authorityKey,
            stage: "affiliation",
            kind: "failure",
            failure: result.failure,
          });
        }
      } catch {
        if (activeAuthorityRef.current === authorityKey) {
          setNotice({
            authorityKey,
            stage: "affiliation",
            kind: "failure",
            failure: "unexpected",
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
      selectedInstitution,
      submittingAuthority,
    ],
  );

  const addSubject = useCallback(
    async (
      subject: AcademicCatalogNode,
      state: Extract<SubjectParticipationState, "planned" | "current">,
    ) => {
      if (
        !authorityKey ||
        !selectedInstitution ||
        !selectedAffiliationId ||
        submittingAuthority ||
        (academic.kind !== "ready" && academic.kind !== "no_context")
      ) {
        return;
      }
      setSubmittingAuthority(authorityKey);
      setNotice(null);
      try {
        const result = await addSubjectParticipation(
          selectedAffiliationId,
          subject.id,
          state,
        );
        if (activeAuthorityRef.current !== authorityKey) return;

        if (result.kind === "added") {
          setAddedSubjects((current) =>
            current.some(
              (item) => item.subjectId === result.participation.subjectId,
            )
              ? current
              : [...current, result.participation],
          );
          setNotice({
            authorityKey,
            stage: "subject",
            kind: "complete",
            state,
          });
          setSelectedItem(null);
        } else if (result.kind === "reconcile") {
          setNotice({
            authorityKey,
            stage: "subject",
            kind: "reconcile",
            state,
          });
        } else if (result.kind === "failed") {
          setNotice({
            authorityKey,
            stage: "subject",
            kind: "failure",
            failure: result.failure,
            state,
          });
        }
      } catch {
        if (activeAuthorityRef.current === authorityKey) {
          setNotice({
            authorityKey,
            stage: "subject",
            kind: "failure",
            failure: "unexpected",
            state,
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
      addSubjectParticipation,
      academic,
      authorityKey,
      selectedAffiliationId,
      selectedInstitution,
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
  const stageCopy = stepCopy[step];
  const stageLabels = labels[step];
  const visibleSubjects = new Map<string, AcademicSubjectParticipation>();
  if (academic.kind === "ready" || academic.kind === "no_context") {
    for (const participation of academic.data.participations) {
      visibleSubjects.set(participation.subjectId, participation);
    }
  }
  for (const participation of addedSubjects) {
    visibleSubjects.set(participation.subjectId, participation);
  }

  const goBack = () => {
    if (step === "program") {
      setStep("institution");
      setQuery("");
      setSelectedInstitution(null);
      setSelectedProgram(null);
      setSelectedItem(null);
      setNotice(null);
      return;
    }
    if (step === "subjects") {
      router.replace("/(tabs)/home");
      return;
    }
    router.back();
  };

  const retryAffiliation = () => {
    if (selectedInstitution) {
      void activateAffiliation(selectedProgram);
    } else {
      void retryAcademic();
    }
  };

  const retrySubject = () => {
    const currentNotice = notice?.authorityKey === authorityKey ? notice : null;
    if (
      selectedItem?.kind === "subject" &&
      currentNotice?.stage === "subject" &&
      currentNotice.kind !== "complete"
    ) {
      void addSubject(selectedItem, currentNotice.state);
    } else void retryAcademic();
  };

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  return (
    <ProductSurface
      title="Configurar contexto académico"
      description={stageCopy.description}
      onRefresh={authorityKey ? () => void retryAcademic() : undefined}
      refreshing={academic.kind === "loading"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={step === "subjects" ? "Ir al inicio" : "Volver"}
        onPress={goBack}
        style={styles.secondaryButton}
      >
        <Text style={styles.buttonLabel}>
          {step === "subjects" ? "Ir al inicio" : "Volver"}
        </Text>
      </Pressable>

      {!authorityKey ? (
        <View style={styles.card}>
          <Text style={styles.copy}>
            Revalidá tu sesión para continuar con tu contexto académico.
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
                No pudimos validar tus afiliaciones. Reintentá antes de
                continuar.
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

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          {stageCopy.title}
        </Text>

        {step === "program" && selectedInstitution ? (
          <View style={styles.selection}>
            <Text style={styles.note}>Institución elegida</Text>
            <Text style={styles.institutionName}>
              {selectedInstitution.name}
            </Text>
          </View>
        ) : null}

        {step === "subjects" && selectedInstitution ? (
          <View style={styles.selection}>
            <Text style={styles.note}>
              Afiliación confirmada por el servidor
            </Text>
            <Text style={styles.institutionName}>
              {selectedInstitution.name}
            </Text>
            {selectedProgram ? (
              <Text style={styles.copy}>Carrera: {selectedProgram.name}</Text>
            ) : (
              <Text style={styles.copy}>Sin carrera asociada todavía</Text>
            )}
          </View>
        ) : null}

        {step === "program" && selectedInstitution ? (
          <Pressable
            accessibilityRole="button"
            disabled={!authorityKey || !academicReady || submitting}
            onPress={() => void activateAffiliation(null)}
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonLabel}>
              {submitting ? "Guardando afiliación…" : "Continuar sin carrera"}
            </Text>
          </Pressable>
        ) : null}

        <TextInput
          accessibilityLabel={stageLabels.input}
          autoCapitalize="words"
          autoCorrect={false}
          editable={
            Boolean(authorityKey) &&
            academicReady &&
            !submitting &&
            (step === "institution" || Boolean(parentId))
          }
          maxLength={120}
          onChangeText={(value) => {
            setQuery(value);
            setSelectedItem(null);
            setNotice(null);
          }}
          onSubmitEditing={searchCatalog}
          placeholder={stageLabels.placeholder}
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
            (step !== "institution" && !parentId) ||
            query.trim().length < 2 ||
            activeSearch?.kind === "loading"
          }
          onPress={searchCatalog}
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
              onPress={searchCatalog}
              style={styles.secondaryButton}
            >
              <Text style={styles.buttonLabel}>Reintentar búsqueda</Text>
            </Pressable>
          </View>
        ) : null}

        {activeSearch?.kind === "ready" ? (
          <View style={styles.results}>
            {activeSearch.items.length === 0 ? (
              <Text style={styles.copy}>{stageLabels.empty}</Text>
            ) : (
              activeSearch.items.map((item) => {
                const selected = selectedItem?.id === item.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Seleccionar ${kindLabel(item.kind)} ${item.name}`}
                    accessibilityState={{ selected }}
                    onPress={() => selectCatalogItem(item)}
                    style={[
                      styles.institution,
                      selected ? styles.institutionSelected : null,
                    ]}
                  >
                    <Text style={styles.institutionName}>{item.name}</Text>
                    <Text style={styles.institutionHint}>
                      {step === "institution"
                        ? "Tocá para continuar con esta institución"
                        : selected
                          ? `${kindLabel(item.kind)} elegida`
                          : `Tocá para elegir ${kindLabel(item.kind)}`}
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

            {activeSearch.cursorRepeated ? (
              <View style={styles.inlineMessage}>
                <Text accessibilityRole="alert" style={styles.error}>
                  El servidor devolvió un cursor repetido. Volvé a buscar para
                  actualizar el catálogo.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={!authorityKey || submitting}
                  onPress={searchCatalog}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.buttonLabel}>Volver a buscar</Text>
                </Pressable>
              </View>
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
                      : stageLabels.more}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {step === "program" && selectedItem?.kind === "program" ? (
          <View style={styles.selection}>
            <Text style={styles.copy}>Vas a agregar esta carrera:</Text>
            <Text style={styles.institutionName}>{selectedItem.name}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!authorityKey || !academicReady || submitting}
              onPress={() => void activateAffiliation(selectedItem)}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonLabel}>
                {submitting ? "Validando…" : "Agregar carrera y continuar"}
              </Text>
            </Pressable>
            <Text style={styles.note}>
              Si ya tenés otra afiliación en esta institución, se conserva como
              una relación separada.
            </Text>
          </View>
        ) : null}

        {step === "subjects" && selectedItem?.kind === "subject" ? (
          <View style={styles.selection}>
            <Text style={styles.copy}>
              Elegí el estado que describe esta materia:
            </Text>
            <Text style={styles.institutionName}>{selectedItem.name}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!authorityKey || !academicReady || submitting}
              onPress={() => void addSubject(selectedItem, "current")}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonLabel}>
                {submitting ? "Guardando materia…" : "La estoy cursando"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!authorityKey || !academicReady || submitting}
              onPress={() => void addSubject(selectedItem, "planned")}
              style={styles.secondaryButton}
            >
              <Text style={styles.buttonLabel}>
                {submitting ? "Guardando materia…" : "La tengo planificada"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {visibleNotice?.stage === "affiliation" ? (
          <View style={styles.inlineMessage}>
            <Text accessibilityRole="alert" style={styles.error}>
              {visibleNotice.kind === "reconcile"
                ? "No pudimos confirmar si la afiliación quedó guardada. Revalidá el estado antes de volver a enviarla."
                : activationFailureCopy[visibleNotice.failure]}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={submitting || !academicReady || !selectedInstitution}
              onPress={retryAffiliation}
              style={styles.secondaryButton}
            >
              <Text style={styles.buttonLabel}>
                {submitting
                  ? "Revisando…"
                  : visibleNotice.kind === "reconcile"
                    ? "Revisar estado"
                    : "Reintentar"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {visibleNotice?.stage === "subject" ? (
          <View style={styles.inlineMessage}>
            {visibleNotice.kind === "complete" ? (
              <Text accessibilityRole="alert" style={styles.success}>
                {visibleNotice.state === "current"
                  ? "La materia quedó confirmada y seleccionada en tu contexto actual."
                  : "La materia quedó guardada como planificada."}
              </Text>
            ) : (
              <Text accessibilityRole="alert" style={styles.error}>
                {visibleNotice.kind === "reconcile"
                  ? "No pudimos confirmar el alta o el cambio de contexto. Revalidá antes de volver a enviarlo."
                  : subjectFailureCopy[visibleNotice.failure]}
              </Text>
            )}
            {visibleNotice.kind !== "complete" ? (
              <Pressable
                accessibilityRole="button"
                disabled={submitting || !academicReady}
                onPress={retrySubject}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonLabel}>
                  {submitting
                    ? "Revisando…"
                    : visibleNotice.kind === "reconcile"
                      ? "Revisar estado"
                      : "Reintentar"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {step === "subjects" && visibleSubjects.size > 0 ? (
          <View style={styles.addedList}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Materias declaradas ({visibleSubjects.size})
            </Text>
            {[...visibleSubjects.values()].map((participation) => (
              <Text key={participation.subjectId} style={styles.copy}>
                • {participation.subjectName} ·{" "}
                {participation.state === "current" ? "Cursando" : "Planificada"}
              </Text>
            ))}
          </View>
        ) : null}

        {step === "subjects" ? (
          <View style={styles.selection}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/(tabs)/home")}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonLabel}>Ir a Home</Text>
            </Pressable>
            <Text style={styles.note}>
              Podés volver a este paso y sumar más materias cuando quieras.
            </Text>
          </View>
        ) : null}
      </View>
    </ProductSurface>
  );
}

function kindLabel(kind: AcademicNodeKind): string {
  if (kind === "institution") return "institución";
  if (kind === "program") return "carrera";
  if (kind === "subject") return "materia";
  return "opción académica";
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
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5b5b66",
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
  success: {
    fontSize: 14,
    lineHeight: 20,
    color: "#17613d",
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
  addedList: {
    gap: 8,
    borderTopWidth: 1,
    borderColor: "#e5e5eb",
    paddingTop: 14,
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
