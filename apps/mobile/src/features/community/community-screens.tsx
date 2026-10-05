import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CreateQuestionInput } from "@losapuntes/contracts/social-qa";

import { ProductSurface } from "@/features/navigation/product-surface";

import {
  cancelCommunityComposerSubmission,
  captureOwnedQuestionBaseline,
  communityAnswerDraftConfirmationTransition,
  communityFailure,
  isAmbiguousCommunityMutationFailure,
  MobileCommunityFeedController,
  MobileCommunityQuestionController,
  reconcileQuestionCreation,
  releaseCommunityComposerOperation,
  shouldClearCommunityAnswerDraft,
  shouldResetCommunityAnswerDraft,
  type CommunityFailure,
  type CommunityQuestionDetailSnapshot,
  type CommunityQuestionFeedSnapshot,
} from "./community-controller";
import { mobileCommunityApi } from "./community-runtime";
import {
  useCommunityAuthority,
  type CommunityAuthorityGate,
} from "./use-community-authority";

function gateMessage(gate: CommunityAuthorityGate): string {
  switch (gate) {
    case "auth_required":
      return "Iniciá sesión para ver las preguntas de la comunidad.";
    case "restricted":
      return "La cuenta no puede acceder a esta superficie ahora.";
    case "blurred":
      return "La Red se actualizará cuando vuelvas a esta pantalla.";
    case "suspended":
      return "La Red se pausó mientras la aplicación está en segundo plano.";
    case "revalidating":
      return "Estamos revalidando tu sesión y contexto académico.";
    case "context_loading":
      return "Preparando la Red con tu contexto académico actual…";
    case "context_unavailable":
      return "Todavía no pudimos validar tu contexto académico.";
    case "offline":
      return "No hay conexión para revalidar el contexto académico.";
    case "timeout":
      return "La validación del contexto académico tardó demasiado.";
    case "server_unavailable":
      return "El servicio de contexto académico no está disponible.";
    case "authority_mismatch":
      return "Estamos confirmando el contexto antes de mostrar preguntas.";
    case "error":
      return "No pudimos validar el contexto académico.";
    case "ready":
      return "";
  }
}

function failureMessage(
  failure: CommunityFailure,
  code?: string | null,
): string {
  if (code === "EMAIL_VERIFICATION_REQUIRED") {
    return "Verificá tu email para publicar una respuesta o pregunta.";
  }
  if (code === "QA_PROFILE_REQUIRED") {
    return "Completá tu perfil antes de participar en preguntas y respuestas.";
  }
  if (code === "QUESTION_CLOSED") {
    return "Esta pregunta ya no acepta respuestas.";
  }
  if (code === "QUESTION_NOT_FOUND") {
    return "La pregunta ya no está disponible.";
  }
  switch (failure.kind) {
    case "offline":
      return "No hay conexión. No pudimos actualizar las preguntas.";
    case "timeout":
      return "La solicitud tardó demasiado. Podés volver a intentar.";
    case "server_unavailable":
      return "El servicio de preguntas no está disponible ahora.";
    case "restricted":
      return "La cuenta no puede realizar esta operación.";
    case "auth_required":
      return "La sesión venció. Iniciá sesión para continuar.";
    case "error":
      return "No pudimos completar la operación. Podés volver a intentar.";
  }
}

function GateCard({
  gate,
  onRetry,
}: {
  gate: CommunityAuthorityGate;
  onRetry: () => void;
}) {
  return (
    <View style={styles.card}>
      {gate === "context_loading" || gate === "revalidating" ? (
        <ActivityIndicator accessibilityLabel="Validando contexto académico" />
      ) : null}
      <Text accessibilityRole="alert" style={styles.copy}>
        {gateMessage(gate)}
      </Text>
      {gate !== "ready" &&
        gate !== "auth_required" &&
        gate !== "restricted" &&
        gate !== "blurred" &&
        gate !== "suspended" && (
          <ActionButton label="Reintentar" onPress={onRetry} />
        )}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

function FailureCard({
  failure,
  onRetry,
  code,
}: {
  failure: CommunityFailure;
  onRetry: () => void;
  code?: string | null;
}) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="alert" style={styles.error}>
        {failureMessage(failure, code)}
      </Text>
      <ActionButton label="Reintentar" onPress={onRetry} />
    </View>
  );
}

function FeedLoading() {
  return (
    <View style={styles.card}>
      <View style={styles.inline}>
        <ActivityIndicator accessibilityLabel="Cargando preguntas" />
        <Text style={styles.copy}>Cargando preguntas…</Text>
      </View>
    </View>
  );
}

function QuestionCard({
  title,
  subject,
  author,
  answerCount,
  state,
  onPress,
}: {
  title: string;
  subject: string;
  author: string;
  answerCount: number;
  state: "open" | "closed";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.questionCard,
        pressed ? styles.questionCardPressed : null,
      ]}
    >
      <Text style={styles.questionState}>
        {state === "open" ? "Abierta" : "Cerrada"}
      </Text>
      <Text style={styles.questionTitle}>{title}</Text>
      <Text style={styles.questionMeta}>
        {subject} · {answerCount}{" "}
        {answerCount === 1 ? "respuesta" : "respuestas"}
      </Text>
      <Text style={styles.copy}>Por {author}</Text>
    </Pressable>
  );
}

export function CommunityNetworkScreen() {
  const router = useRouter();
  const authority = useCommunityAuthority();
  const controller = useMemo(
    () => new MobileCommunityFeedController(mobileCommunityApi),
    [],
  );
  const [feed, setFeed] = useState<CommunityQuestionFeedSnapshot>(
    controller.getSnapshot(),
  );

  useEffect(() => controller.subscribe(setFeed), [controller]);

  const subjectId =
    authority.scope.kind === "subject" ? authority.scope.subjectId : null;
  useEffect(() => {
    if (
      authority.gate !== "ready" ||
      !authority.authorityKey ||
      authority.scope.kind === "unresolved"
    ) {
      controller.invalidate();
      return;
    }

    const authorityKey = authority.authorityKey;
    const input = {
      limit: 25,
      ...(subjectId ? { subjectId } : {}),
    };
    void controller.load(authorityKey, input);
    return () => controller.invalidate(authorityKey);
  }, [
    authority.authorityKey,
    authority.gate,
    authority.scope.kind,
    controller,
    subjectId,
  ]);

  const retry = useCallback(() => {
    if (authority.gate !== "ready" || !authority.authorityKey) {
      void authority.retry();
      return;
    }
    if (authority.scope.kind === "unresolved") {
      void authority.retry();
      return;
    }
    void controller.load(authority.authorityKey, {
      limit: 25,
      ...(subjectId ? { subjectId } : {}),
    });
  }, [authority, controller, subjectId]);

  const loadMore = useCallback(() => {
    if (authority.authorityKey)
      void controller.loadMore(authority.authorityKey);
  }, [authority.authorityKey, controller]);

  const visibleFeed =
    "authorityKey" in feed && feed.authorityKey === authority.authorityKey
      ? feed
      : null;
  const refreshing =
    authority.gate === "ready" && visibleFeed?.kind === "loading";

  return (
    <ProductSurface
      title="Red"
      description="Preguntas de la comunidad académica, con visibilidad y permisos resueltos por el servidor."
      onRefresh={authority.gate === "ready" ? retry : undefined}
      refreshing={refreshing}
    >
      {authority.gate !== "ready" ? (
        <GateCard gate={authority.gate} onRetry={retry} />
      ) : authority.scope.kind === "unresolved" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.copy}>
            No pudimos confirmar la materia actual dentro de la lista del
            servidor. Revalidá tu contexto antes de continuar.
          </Text>
          <ActionButton label="Revalidar contexto" onPress={retry} />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Preguntas</Text>
            <Text style={styles.copy}>
              {authority.scope.kind === "subject"
                ? "Mostrando preguntas para tu materia actual."
                : "Mostrando preguntas disponibles de todas las materias."}
            </Text>
            {authority.scope.kind === "subject" ? (
              <ActionButton
                label="Hacer una pregunta"
                onPress={() => router.push("/questions/new")}
              />
            ) : (
              <Text style={styles.note}>
                Para publicar, elegí una materia actual en tu contexto
                académico.
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Organizaciones</Text>
            <Text style={styles.copy}>
              Explorá centros, clubes, laboratorios y comunidades del campus.
            </Text>
            <ActionButton
              label="Explorar organizaciones"
              onPress={() => router.push("/organizations")}
            />
          </View>

          {!visibleFeed || visibleFeed.kind === "loading" ? (
            <FeedLoading />
          ) : visibleFeed.kind === "failure" ? (
            <FailureCard failure={visibleFeed.failure} onRetry={retry} />
          ) : visibleFeed.page.items.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Todavía no hay preguntas</Text>
              <Text style={styles.copy}>
                Cuando alguien publique una pregunta disponible, va a aparecer
                acá.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {visibleFeed.page.items.map((question) => (
                <QuestionCard
                  key={question.id}
                  title={question.title}
                  subject={question.academic.subject.name}
                  author={
                    question.author?.displayName ?? "Persona de la comunidad"
                  }
                  answerCount={question.answerCount}
                  state={question.state}
                  onPress={() =>
                    router.push({
                      pathname: "/questions/[questionId]",
                      params: { questionId: question.id },
                    })
                  }
                />
              ))}
              {visibleFeed.loadMoreFailure ? (
                <FailureCard
                  failure={visibleFeed.loadMoreFailure}
                  onRetry={loadMore}
                />
              ) : null}
              {visibleFeed.page.nextCursor ? (
                <ActionButton
                  label={visibleFeed.loadingMore ? "Cargando…" : "Cargar más"}
                  disabled={visibleFeed.loadingMore}
                  onPress={loadMore}
                />
              ) : null}
            </View>
          )}
        </>
      )}
    </ProductSurface>
  );
}

function detailFailure(
  snapshot: CommunityQuestionDetailSnapshot,
): CommunityFailure | null {
  return snapshot.kind === "failure" ? snapshot.failure : null;
}

export function CommunityQuestionScreen({
  questionId,
}: {
  questionId: string;
}) {
  const router = useRouter();
  const authority = useCommunityAuthority();
  const controller = useMemo(
    () => new MobileCommunityQuestionController(mobileCommunityApi),
    [],
  );
  const [detail, setDetail] = useState<CommunityQuestionDetailSnapshot>(
    controller.getSnapshot(),
  );
  const [answerBody, setAnswerBody] = useState("");
  const answerDraftScopeRef = useRef({
    questionId,
    authorityKey: authority.authorityKey,
  });
  const answerConfirmationVisibleRef = useRef(false);

  useEffect(() => controller.subscribe(setDetail), [controller]);

  useEffect(() => {
    const transition = communityAnswerDraftConfirmationTransition(
      answerConfirmationVisibleRef.current,
      detail,
      answerBody,
    );
    if (transition.clearDraft) {
      setAnswerBody("");
    }
    answerConfirmationVisibleRef.current = transition.visible;
  }, [answerBody, detail]);

  useEffect(() => {
    const previous = answerDraftScopeRef.current;
    const next = {
      questionId,
      authorityKey: authority.authorityKey,
    };
    if (shouldResetCommunityAnswerDraft(previous, next)) {
      setAnswerBody("");
    }
    answerDraftScopeRef.current = {
      questionId,
      authorityKey: authority.authorityKey ?? previous.authorityKey,
    };
  }, [authority.authorityKey, questionId]);

  useEffect(() => {
    if (authority.gate !== "ready" || !authority.authorityKey) {
      controller.invalidate();
      return;
    }
    const authorityKey = authority.authorityKey;
    void controller.load(authorityKey, questionId);
    return () => controller.invalidate(authorityKey);
  }, [authority.authorityKey, authority.gate, controller, questionId]);

  const retry = useCallback(() => {
    if (authority.gate !== "ready" || !authority.authorityKey) {
      void authority.retry();
      return;
    }
    void controller.load(authority.authorityKey, questionId);
  }, [authority, controller, questionId]);

  const submitAnswer = useCallback(async () => {
    if (
      detail.kind !== "ready" ||
      !authority.authorityKey ||
      !answerBody.trim()
    ) {
      return;
    }
    await controller.createAnswer(
      authority.authorityKey,
      questionId,
      answerBody.trim(),
    );
  }, [answerBody, authority.authorityKey, controller, detail.kind, questionId]);

  const visibleDetail =
    "authorityKey" in detail &&
    detail.authorityKey === authority.authorityKey &&
    (detail.kind === "loading" || detail.questionId === questionId)
      ? detail
      : null;
  const snapshotFailure = visibleDetail ? detailFailure(visibleDetail) : null;
  const refreshing =
    authority.gate === "ready" && visibleDetail?.kind === "loading";

  return (
    <ProductSurface
      title="Pregunta"
      description="Leé la conversación y respondé si el servidor habilita tu cuenta para hacerlo."
      onRefresh={authority.gate === "ready" ? retry : undefined}
      refreshing={refreshing}
    >
      <ActionButton label="Volver a la Red" onPress={() => router.back()} />
      {authority.gate !== "ready" ? (
        <GateCard gate={authority.gate} onRetry={retry} />
      ) : !visibleDetail || visibleDetail.kind === "loading" ? (
        <FeedLoading />
      ) : snapshotFailure ? (
        <FailureCard
          failure={snapshotFailure}
          code={
            visibleDetail.kind === "failure" ? visibleDetail.failure.code : null
          }
          onRetry={retry}
        />
      ) : visibleDetail.kind === "ready" ? (
        <QuestionDetailContent
          snapshot={visibleDetail}
          answerBody={answerBody}
          onAnswerBodyChange={setAnswerBody}
          onSubmitAnswer={() => void submitAnswer()}
          onRefresh={retry}
          onLoadMore={() =>
            void controller.loadMoreAnswers(visibleDetail.authorityKey)
          }
        />
      ) : null}
    </ProductSurface>
  );
}

function QuestionDetailContent({
  snapshot,
  answerBody,
  onAnswerBodyChange,
  onSubmitAnswer,
  onRefresh,
  onLoadMore,
}: {
  snapshot: Extract<CommunityQuestionDetailSnapshot, { kind: "ready" }>;
  answerBody: string;
  onAnswerBodyChange(value: string): void;
  onSubmitAnswer(): void;
  onRefresh(): void;
  onLoadMore(): void;
}) {
  const { detail } = snapshot;
  const { question, answers } = detail;
  return (
    <View style={styles.list}>
      <View style={styles.card}>
        <Text style={styles.questionState}>
          {question.state === "open" ? "Abierta" : "Cerrada"}
        </Text>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          {question.title}
        </Text>
        <Text style={styles.questionMeta}>
          {question.academic.subject.name}
          {question.academic.courseOffering
            ? ` · ${question.academic.courseOffering.name}`
            : ""}
        </Text>
        <Text style={styles.copy}>
          Por {question.author?.displayName ?? "Persona de la comunidad"}
        </Text>
        <Text style={styles.body}>{question.body}</Text>
      </View>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Respuestas ({question.answerCount})
        </Text>
        {answers.length === 0 ? (
          <Text style={styles.copy}>Todavía no hay respuestas.</Text>
        ) : (
          answers.map((answer) => (
            <View key={answer.id} style={styles.answer}>
              {question.acceptedAnswerId === answer.id ? (
                <Text style={styles.accepted}>Respuesta aceptada</Text>
              ) : null}
              <Text style={styles.copy}>
                {answer.author?.displayName ?? "Persona de la comunidad"}
              </Text>
              <Text style={styles.body}>{answer.body}</Text>
            </View>
          ))
        )}
        {snapshot.answersFailure ? (
          <FailureCard failure={snapshot.answersFailure} onRetry={onLoadMore} />
        ) : null}
        {detail.answersNextCursor ? (
          <ActionButton
            label={
              snapshot.loadingMoreAnswers ? "Cargando…" : "Ver más respuestas"
            }
            disabled={snapshot.loadingMoreAnswers || snapshot.submittingAnswer}
            onPress={onLoadMore}
          />
        ) : null}
      </View>

      {snapshot.notice ? (
        <Text accessibilityRole="alert" style={styles.success}>
          {snapshot.notice}
        </Text>
      ) : null}
      {snapshot.refreshFailure ? (
        <FailureCard failure={snapshot.refreshFailure} onRetry={onRefresh} />
      ) : null}
      {snapshot.actionFailure ? (
        <FailureCard
          failure={snapshot.actionFailure}
          code={snapshot.actionFailureCode}
          onRetry={snapshot.answerRetryBlocked ? onRefresh : onSubmitAnswer}
        />
      ) : null}
      {question.viewer.canAnswer ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Tu respuesta
          </Text>
          <TextInput
            accessibilityLabel="Escribí tu respuesta"
            multiline
            maxLength={5000}
            onChangeText={onAnswerBodyChange}
            placeholder="Compartí una explicación o una pista útil."
            style={[styles.input, styles.multiline]}
            textAlignVertical="top"
            value={answerBody}
          />
          <ActionButton
            label={
              snapshot.submittingAnswer ? "Publicando…" : "Publicar respuesta"
            }
            disabled={
              snapshot.submittingAnswer ||
              snapshot.loadingMoreAnswers ||
              snapshot.answerRetryBlocked ||
              answerBody.trim().length < 2
            }
            onPress={onSubmitAnswer}
          />
        </View>
      ) : null}
    </View>
  );
}

export function CommunityQuestionComposerScreen() {
  const router = useRouter();
  const authority = useCommunityAuthority();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [questionRetryBlocked, setQuestionRetryBlocked] = useState(false);
  const [failure, setFailure] = useState<CommunityFailure | null>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);

  const participation =
    authority.scope.kind === "subject" ? authority.scope.participation : null;
  const authorityKey = authority.authorityKey;
  const authorityKeyRef = useRef(authorityKey);
  const activeOperation = useRef<AbortController | null>(null);
  const pendingQuestion = useRef<{
    authorityKey: string;
    input: CreateQuestionInput;
    baselineIds: ReadonlySet<string>;
    failure: CommunityFailure;
  } | null>(null);
  authorityKeyRef.current = authorityKey;

  useEffect(() => {
    const hadActiveOperation = activeOperation.current !== null;
    activeOperation.current = cancelCommunityComposerSubmission(
      activeOperation.current,
      () => setSubmitting(false),
    );
    if (hadActiveOperation && pendingQuestion.current) {
      setQuestionRetryBlocked(true);
    }
    if (
      authorityKey &&
      pendingQuestion.current &&
      pendingQuestion.current.authorityKey !== authorityKey
    ) {
      pendingQuestion.current = null;
      setQuestionRetryBlocked(false);
      setFailure(null);
      setFailureCode(null);
      setTitle("");
      setBody("");
    }
  }, [authority.gate, authorityKey]);

  const reconcilePendingQuestion = useCallback(async () => {
    const pending = pendingQuestion.current;
    if (
      !pending ||
      authority.gate !== "ready" ||
      !authorityKey ||
      authorityKey !== pending.authorityKey ||
      submitting
    ) {
      return;
    }

    const operation = new AbortController();
    activeOperation.current = operation;
    setSubmitting(true);
    try {
      const reconciled = await reconcileQuestionCreation(
        mobileCommunityApi,
        pending.input,
        pending.baselineIds,
        operation.signal,
      );
      if (
        authorityKey !== authorityKeyRef.current ||
        pendingQuestion.current !== pending
      ) {
        return;
      }
      if (reconciled) {
        pendingQuestion.current = null;
        setQuestionRetryBlocked(false);
        router.replace({
          pathname: "/questions/[questionId]",
          params: { questionId: reconciled.id },
        });
        return;
      }

      pendingQuestion.current = null;
      setQuestionRetryBlocked(false);
      setFailure(pending.failure);
      setFailureCode(pending.failure.code);
    } catch (error) {
      if (
        authorityKey !== authorityKeyRef.current ||
        pendingQuestion.current !== pending
      ) {
        return;
      }
      const nextFailure = communityFailure(error);
      setQuestionRetryBlocked(true);
      setFailure(nextFailure);
      setFailureCode(nextFailure.code);
    } finally {
      if (activeOperation.current === operation) activeOperation.current = null;
      if (authorityKey === authorityKeyRef.current) setSubmitting(false);
    }
  }, [authority.gate, authorityKey, router, submitting]);

  const submit = useCallback(async () => {
    if (
      authority.gate !== "ready" ||
      !authorityKey ||
      !participation ||
      title.trim().length < 5 ||
      body.trim().length < 10 ||
      submitting ||
      questionRetryBlocked
    ) {
      return;
    }

    const input: CreateQuestionInput = {
      subjectId: participation.subjectId,
      ...(participation.courseOfferingId
        ? { courseOfferingId: participation.courseOfferingId }
        : {}),
      title: title.trim(),
      body: body.trim(),
    };
    const operation = new AbortController();
    activeOperation.current = operation;
    setFailure(null);
    setFailureCode(null);
    setSubmitting(true);
    let baselineIds: ReadonlySet<string>;
    try {
      baselineIds = await captureOwnedQuestionBaseline(
        mobileCommunityApi,
        input,
        operation.signal,
      );
    } catch (error) {
      if (authorityKey !== authorityKeyRef.current) return;
      const nextFailure = communityFailure(error);
      setFailure(nextFailure);
      setFailureCode(nextFailure.code);
      activeOperation.current = releaseCommunityComposerOperation(
        activeOperation.current,
        operation,
        () => setSubmitting(false),
      );
      return;
    }

    pendingQuestion.current = {
      authorityKey,
      input,
      baselineIds,
      failure: { kind: "error", code: null },
    };

    try {
      const result = await mobileCommunityApi.createQuestion(
        input,
        operation.signal,
      );
      if (authorityKey !== authorityKeyRef.current) return;
      pendingQuestion.current = null;
      setQuestionRetryBlocked(false);
      router.replace({
        pathname: "/questions/[questionId]",
        params: { questionId: result.question.id },
      });
    } catch (error) {
      if (authorityKey !== authorityKeyRef.current) return;
      const nextFailure = communityFailure(error);
      if (!isAmbiguousCommunityMutationFailure(nextFailure)) {
        pendingQuestion.current = null;
        setQuestionRetryBlocked(false);
        setFailure(nextFailure);
        setFailureCode(nextFailure.code);
        return;
      }

      pendingQuestion.current = {
        authorityKey,
        input,
        baselineIds,
        failure: nextFailure,
      };
      setQuestionRetryBlocked(true);
      try {
        const reconciled = await reconcileQuestionCreation(
          mobileCommunityApi,
          input,
          baselineIds,
          operation.signal,
        );
        if (authorityKey !== authorityKeyRef.current) return;
        if (reconciled) {
          pendingQuestion.current = null;
          setQuestionRetryBlocked(false);
          router.replace({
            pathname: "/questions/[questionId]",
            params: { questionId: reconciled.id },
          });
          return;
        }

        pendingQuestion.current = null;
        setQuestionRetryBlocked(false);
        setFailure(nextFailure);
        setFailureCode(nextFailure.code);
      } catch (reconcileError) {
        if (authorityKey !== authorityKeyRef.current) return;
        const reconciliationFailure = communityFailure(reconcileError);
        setQuestionRetryBlocked(true);
        setFailure(reconciliationFailure);
        setFailureCode(reconciliationFailure.code);
      }
    } finally {
      if (activeOperation.current === operation) activeOperation.current = null;
      if (authorityKey === authorityKeyRef.current) setSubmitting(false);
    }
  }, [
    authority.authorityKey,
    authority.gate,
    authorityKey,
    body,
    participation,
    questionRetryBlocked,
    router,
    submitting,
    title,
  ]);

  return (
    <ProductSurface
      title="Hacer una pregunta"
      description="La pregunta se publica en tu materia actual y el servidor confirma si tu cuenta puede participar."
    >
      <ActionButton label="Volver a la Red" onPress={() => router.back()} />
      {authority.gate !== "ready" ? (
        <GateCard
          gate={authority.gate}
          onRetry={() => void authority.retry()}
        />
      ) : !participation ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Elegí una materia actual</Text>
          <Text style={styles.copy}>
            Para publicar, el contexto académico necesita una materia
            seleccionada. La Red no elige ni infiere una materia por su cuenta.
          </Text>
          <ActionButton label="Volver a la Red" onPress={() => router.back()} />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.note}>Materia actual</Text>
          <Text style={styles.copy}>
            La API resolverá y validará la materia antes de publicar.
          </Text>
          <TextInput
            accessibilityLabel="Título de la pregunta"
            maxLength={180}
            onChangeText={setTitle}
            placeholder="¿Qué necesitás entender?"
            style={styles.input}
            value={title}
          />
          <TextInput
            accessibilityLabel="Detalle de la pregunta"
            multiline
            maxLength={5000}
            onChangeText={setBody}
            placeholder="Contá qué intentaste y dónde te trabaste."
            style={[styles.input, styles.multiline]}
            textAlignVertical="top"
            value={body}
          />
          {questionRetryBlocked ? (
            <View style={styles.card}>
              <Text accessibilityRole="alert" style={styles.copy}>
                No pudimos confirmar si la pregunta se publicó. Antes de
                intentar otro POST, comprobá el estado del servidor.
              </Text>
              <ActionButton
                label={submitting ? "Comprobando…" : "Comprobar publicación"}
                disabled={submitting}
                onPress={() => void reconcilePendingQuestion()}
              />
            </View>
          ) : failure ? (
            <FailureCard
              failure={failure}
              code={failureCode}
              onRetry={() => void submit()}
            />
          ) : null}
          <ActionButton
            label={submitting ? "Publicando…" : "Publicar pregunta"}
            disabled={
              submitting ||
              questionRetryBlocked ||
              title.trim().length < 5 ||
              body.trim().length < 10
            }
            onPress={() => void submit()}
          />
        </View>
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
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: "#5b5b66",
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5b5b66",
  },
  error: {
    fontSize: 14,
    lineHeight: 21,
    color: "#9f1d1d",
  },
  success: {
    fontSize: 14,
    lineHeight: 20,
    color: "#176b43",
  },
  inline: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  list: {
    gap: 12,
  },
  questionCard: {
    gap: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0e0e8",
    padding: 16,
    backgroundColor: "#ffffff",
  },
  questionCardPressed: {
    backgroundColor: "#f0eff8",
  },
  questionState: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6c5b91",
    textTransform: "uppercase",
  },
  questionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#20202a",
  },
  questionMeta: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5b5b66",
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: "#292934",
  },
  answer: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 14,
  },
  accepted: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "#e7f4ec",
    color: "#176b43",
    fontSize: 12,
    fontWeight: "700",
  },
  button: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  buttonPressed: {
    backgroundColor: "#f0eff8",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: "#24243a",
    fontSize: 15,
    fontWeight: "700",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#20202a",
    fontSize: 15,
  },
  multiline: {
    minHeight: 132,
  },
});
