import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  AcademicSubjectOption,
  ResourceView,
  ResourceVisibility,
} from "../features/resources/interfaces";
import {
  isResourcesApiError,
  resourcesApi,
} from "../features/resources/services/resourcesService";
import {
  useAsyncAuthorityFence,
  type AsyncAuthorityTicket,
} from "../shared/useAsyncAuthorityFence";
import "./Resources.scss";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function messageFor(error: unknown): string {
  if (!isResourcesApiError(error)) {
    return "No pudimos completar la operación.";
  }

  if (error.code === "EMAIL_VERIFICATION_REQUIRED") {
    return "Verificá tu email antes de subir o descargar apuntes.";
  }

  if (error.code === "RESOURCE_REVISION_CONFLICT") {
    return "El apunte cambió en otra pestaña. Recargá la lista antes de editar.";
  }

  return error.message;
}

function appendResources(
  current: ResourceView[],
  next: ResourceView[],
): ResourceView[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

function listFrom(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

type ResourcesListState = {
  scopeKey: string;
  items: ResourceView[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
};

type ScopedMessage = {
  scopeKey: string;
  message: string;
  isCurrent?: () => boolean;
};

type ScopedBusyResource = {
  scopeKey: string;
  resourceId: string;
  ticket: AsyncAuthorityTicket;
};

type UploadPhase = "intent" | "transfer" | "finalize" | "create";

type ActiveUploadPhase = {
  ticket: AsyncAuthorityTicket;
  phase: UploadPhase;
};

type UncertainResourceCreate = {
  userId: string;
  fileIdentity: string;
  filename: string;
};

const UNCERTAIN_RESOURCE_CREATE_SESSION_KEY =
  "__losApuntesUncertainResourceCreateUsers";
const MAX_UNCERTAIN_RESOURCE_CREATE_STORAGE_BYTES = 8 * 1024;
const MAX_STORED_USER_ID_LENGTH = 128;
const retainedUncertainResourceCreates = new Map<
  string,
  UncertainResourceCreate
>();

function uncertainResourceCreateKey(
  userId: string,
  fileIdentity: string,
): string {
  return JSON.stringify([userId, fileIdentity]);
}

function readUncertainResourceCreateUsers(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(
      UNCERTAIN_RESOURCE_CREATE_SESSION_KEY,
    );
    if (!raw || raw.length > MAX_UNCERTAIN_RESOURCE_CREATE_STORAGE_BYTES) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return [
      ...new Set(
        parsed.filter(
          (userId): userId is string =>
            typeof userId === "string" &&
            userId.length > 0 &&
            userId.length <= MAX_STORED_USER_ID_LENGTH,
        ),
      ),
    ];
  } catch {
    return [];
  }
}

type UncertainResourceCreateUsersUpdate = {
  userIds: string[];
  persisted: boolean;
};

function updateUncertainResourceCreateUsers(
  userId: string,
  isUncertain: boolean,
): UncertainResourceCreateUsersUpdate {
  const currentUsers = readUncertainResourceCreateUsers();
  if (
    userId.length === 0 ||
    userId.length > MAX_STORED_USER_ID_LENGTH ||
    typeof window === "undefined"
  ) {
    return { userIds: currentUsers, persisted: false };
  }

  const nextUsers = isUncertain
    ? [...new Set([...currentUsers, userId])]
    : currentUsers.filter((currentUserId) => currentUserId !== userId);
  if (
    currentUsers.length === nextUsers.length &&
    currentUsers.every(
      (currentUserId, index) => currentUserId === nextUsers[index],
    )
  ) {
    return { userIds: nextUsers, persisted: true };
  }

  try {
    if (nextUsers.length > 0) {
      window.sessionStorage.setItem(
        UNCERTAIN_RESOURCE_CREATE_SESSION_KEY,
        JSON.stringify(nextUsers),
      );
    } else {
      window.sessionStorage.removeItem(UNCERTAIN_RESOURCE_CREATE_SESSION_KEY);
    }
  } catch {
    return { userIds: currentUsers, persisted: false };
  }

  return { userIds: nextUsers, persisted: true };
}

function retainedUncertainResourceCreateValues(): UncertainResourceCreate[] {
  return [...retainedUncertainResourceCreates.values()];
}

function fileIdentity(file: File): string {
  return JSON.stringify([file.name, file.size, file.type, file.lastModified]);
}

function isUncertainResourceCreateOutcome(error: unknown): boolean {
  if (!isResourcesApiError(error)) return true;
  return (
    error.code === "NETWORK_UNAVAILABLE" ||
    error.status === 0 ||
    error.status === 408 ||
    error.status >= 500 ||
    (error.status >= 200 && error.status < 300)
  );
}

const Resources = () => {
  const { status, user, session } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeQuery = searchParams.get("q") ?? "";
  const subjectIdFilter = searchParams.get("subjectId") ?? undefined;
  const authenticated = status === "authenticated";
  const [syncedRouteQuery, setSyncedRouteQuery] = useState({
    locationKey: location.key,
    query: routeQuery,
  });
  const routeQueryIsSynchronized =
    syncedRouteQuery.locationKey === location.key &&
    syncedRouteQuery.query === routeQuery;
  const authScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const [query, setQuery] = useState(routeQuery);
  const [queryGeneration, setQueryGeneration] = useState(0);
  const [visibilityFilter, setVisibilityFilter] = useState<
    ResourceVisibility | ""
  >("");
  const [savedMode, setSavedMode] = useState(false);
  const savedView = authenticated && savedMode;
  const listScopeKey = [
    "resources-list",
    authScopeKey,
    location.key,
    subjectIdFilter ?? "all-subjects",
    visibilityFilter || "all-visibility",
    savedView ? "saved" : "discovery",
    queryGeneration,
  ].join(":");
  const listScopeKeyRef = useRef(listScopeKey);
  listScopeKeyRef.current = listScopeKey;
  const {
    begin: beginListRequest,
    isCurrent: isListRequestCurrent,
    finish: finishListRequest,
    invalidate: invalidateListRequest,
  } = useAsyncAuthorityFence(listScopeKey);
  const {
    begin: beginResourceAction,
    isCurrent: isResourceActionCurrent,
    finish: finishResourceAction,
  } = useAsyncAuthorityFence(`resources-actions:${listScopeKey}`);
  const [listState, setListState] = useState<ResourcesListState | null>(null);
  const currentListState =
    listState?.scopeKey === listScopeKey ? listState : null;
  const items = currentListState?.items ?? [];
  const loading = currentListState?.loading ?? true;
  const loadingMore = currentListState?.loadingMore ?? false;
  const nextCursor = currentListState?.nextCursor ?? null;
  const [errorState, setErrorState] = useState<ScopedMessage | null>(null);
  const error =
    errorState?.scopeKey === listScopeKey && (errorState.isCurrent?.() ?? true)
      ? errorState.message
      : null;
  const [feedbackState, setFeedbackState] = useState<ScopedMessage | null>(
    null,
  );
  const feedback =
    feedbackState?.scopeKey === listScopeKey &&
    (feedbackState.isCurrent?.() ?? true)
      ? feedbackState.message
      : null;
  const [busyResource, setBusyResource] = useState<ScopedBusyResource | null>(
    null,
  );
  const busyId =
    busyResource?.scopeKey === listScopeKey &&
    isResourceActionCurrent(busyResource.ticket)
      ? busyResource.resourceId
      : null;

  const [fileSelection, setFileSelection] = useState<{
    authScopeKey: string;
    file: File;
  } | null>(null);
  const file =
    fileSelection?.authScopeKey === authScopeKey ? fileSelection.file : null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<ResourceVisibility>("private");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [subjectQueryGeneration, setSubjectQueryGeneration] = useState(0);
  const subjectSearchScopeKey = `resources-subjects:${authScopeKey}:${subjectQueryGeneration}`;
  const [subjectOptionsState, setSubjectOptionsState] = useState<{
    scopeKey: string;
    options: AcademicSubjectOption[];
  } | null>(null);
  const subjectOptions =
    subjectOptionsState?.scopeKey === subjectSearchScopeKey
      ? subjectOptionsState.options
      : [];
  const [subjectSelection, setSubjectSelection] = useState<{
    authScopeKey: string;
    subject: AcademicSubjectOption;
  } | null>(null);
  const selectedSubject =
    subjectSelection?.authScopeKey === authScopeKey
      ? subjectSelection.subject
      : null;
  const subject = selectedSubject;
  const uploadOperationKey = useRef<string | null>(null);
  const activeUploadPhase = useRef<ActiveUploadPhase | null>(null);
  const uploadOperationAuthScope = useRef(authScopeKey);
  if (uploadOperationAuthScope.current !== authScopeKey) {
    uploadOperationAuthScope.current = authScopeKey;
    uploadOperationKey.current = null;
  }
  const [uploadGeneration, setUploadGeneration] = useState(0);
  const uploadScopeKey = `resources-upload:${authScopeKey}:${selectedSubject?.id ?? "no-subject"}:${uploadGeneration}`;
  const [uploadingState, setUploadingState] = useState<{
    scopeKey: string;
    value: boolean;
  } | null>(null);
  const uploading =
    uploadingState?.scopeKey === uploadScopeKey && uploadingState.value;
  const [uploadProgressState, setUploadProgressState] = useState<{
    scopeKey: string;
    value: number;
  } | null>(null);
  const uploadProgress =
    uploadProgressState?.scopeKey === uploadScopeKey
      ? uploadProgressState.value
      : 0;
  const [uncertainResourceCreates, setUncertainResourceCreates] = useState<
    UncertainResourceCreate[]
  >(() => retainedUncertainResourceCreateValues());
  const [uncertainResourceCreateUsers, setUncertainResourceCreateUsers] =
    useState<string[]>(() => [
      ...new Set([
        ...readUncertainResourceCreateUsers(),
        ...retainedUncertainResourceCreateValues().map(
          (uncertain) => uncertain.userId,
        ),
      ]),
    ]);
  const {
    begin: beginSubjectSearch,
    isCurrent: isSubjectSearchCurrent,
    finish: finishSubjectSearch,
    invalidate: invalidateSubjectSearch,
  } = useAsyncAuthorityFence(subjectSearchScopeKey);
  const {
    begin: beginUpload,
    isCurrent: isUploadCurrent,
    finish: finishUpload,
    invalidate: invalidateUpload,
  } = useAsyncAuthorityFence(uploadScopeKey);
  const selectedFileIdentity = file ? fileIdentity(file) : null;
  const currentUncertainResourceCreate = uncertainResourceCreates.find(
    (uncertain) =>
      uncertain.userId === user?.id &&
      uncertain.fileIdentity === selectedFileIdentity,
  );
  const hasRecoveredUncertainResourceCreate = Boolean(
    user?.id &&
    uncertainResourceCreateUsers.includes(user.id) &&
    !uncertainResourceCreates.some((uncertain) => uncertain.userId === user.id),
  );
  const hasUncertainResourceCreate =
    Boolean(currentUncertainResourceCreate) ||
    hasRecoveredUncertainResourceCreate;
  const rememberUncertainResourceCreate = (
    next: UncertainResourceCreate,
  ): boolean => {
    retainedUncertainResourceCreates.set(
      uncertainResourceCreateKey(next.userId, next.fileIdentity),
      next,
    );
    setUncertainResourceCreates(retainedUncertainResourceCreateValues());
    const update = updateUncertainResourceCreateUsers(next.userId, true);
    setUncertainResourceCreateUsers(update.userIds);
    return update.persisted;
  };
  const forgetUncertainResourceCreate = (userId: string, identity?: string) => {
    if (identity) {
      retainedUncertainResourceCreates.delete(
        uncertainResourceCreateKey(userId, identity),
      );
    } else {
      for (const [key, uncertain] of retainedUncertainResourceCreates) {
        if (uncertain.userId === userId) {
          retainedUncertainResourceCreates.delete(key);
        }
      }
    }
    setUncertainResourceCreates(retainedUncertainResourceCreateValues());
    const stillUncertain = retainedUncertainResourceCreateValues().some(
      (uncertain) => uncertain.userId === userId,
    );
    const update = updateUncertainResourceCreateUsers(userId, stillUncertain);
    setUncertainResourceCreateUsers(update.userIds);
  };
  const setUploadPhase = (ticket: AsyncAuthorityTicket, phase: UploadPhase) => {
    if (!isUploadCurrent(ticket)) return;
    const next = { ticket, phase };
    activeUploadPhase.current = next;
  };
  const clearUploadPhase = (ticket: AsyncAuthorityTicket) => {
    if (activeUploadPhase.current?.ticket === ticket) {
      activeUploadPhase.current = null;
    }
  };
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!routeQueryIsSynchronized) return;
      const ticket = beginListRequest();
      if (!isListRequestCurrent(ticket)) return;
      setListState((current) => {
        if (!isListRequestCurrent(ticket)) return current;
        const currentScope =
          current?.scopeKey === listScopeKey ? current : null;
        return {
          scopeKey: listScopeKey,
          items: currentScope?.items ?? [],
          nextCursor: currentScope?.nextCursor ?? null,
          loading: !append,
          loadingMore: append,
        };
      });
      if (isListRequestCurrent(ticket)) setErrorState(null);

      try {
        const result = savedView
          ? await resourcesApi.saved(cursor, ticket.signal)
          : await resourcesApi.search(
              {
                q: query.trim() || undefined,
                visibility: visibilityFilter || undefined,
                subjectId: subjectIdFilter,
                cursor,
              },
              ticket.signal,
            );

        if (!isListRequestCurrent(ticket)) return;
        setListState((current) => {
          if (!isListRequestCurrent(ticket)) return current;
          const currentScope =
            current?.scopeKey === listScopeKey ? current : null;
          return {
            scopeKey: listScopeKey,
            items: append
              ? appendResources(currentScope?.items ?? [], result.items)
              : result.items,
            nextCursor: result.nextCursor,
            loading: false,
            loadingMore: false,
          };
        });
      } catch (nextError) {
        if (isListRequestCurrent(ticket)) {
          setErrorState({
            scopeKey: listScopeKey,
            message: messageFor(nextError),
            isCurrent: () => isListRequestCurrent(ticket),
          });
        }
      } finally {
        if (finishListRequest(ticket)) {
          setListState((current) => {
            if (!isListRequestCurrent(ticket)) return current;
            if (current?.scopeKey !== listScopeKey) return current;
            return { ...current, loading: false, loadingMore: false };
          });
        }
      }
    },
    [
      beginListRequest,
      finishListRequest,
      isListRequestCurrent,
      listScopeKey,
      query,
      routeQueryIsSynchronized,
      savedView,
      subjectIdFilter,
      visibilityFilter,
    ],
  );
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (routeQueryIsSynchronized) return;
    invalidateListRequest();
    setQuery(routeQuery);
    setQueryGeneration((current) => current + 1);
    setSyncedRouteQuery({ locationKey: location.key, query: routeQuery });
  }, [
    invalidateListRequest,
    location.key,
    routeQuery,
    routeQueryIsSynchronized,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const setResourceActionBusy = (
    ticket: AsyncAuthorityTicket,
    resourceId: string,
  ) => {
    setBusyResource((current) =>
      isResourceActionCurrent(ticket)
        ? { scopeKey: listScopeKey, resourceId, ticket }
        : current,
    );
  };

  const setResourceActionError = (
    ticket: AsyncAuthorityTicket,
    message: string,
  ) => {
    setErrorState((current) =>
      isResourceActionCurrent(ticket)
        ? {
            scopeKey: listScopeKey,
            message,
            isCurrent: () => isResourceActionCurrent(ticket),
          }
        : current,
    );
  };

  const setResourceActionFeedback = (
    ticket: AsyncAuthorityTicket,
    message: string,
  ) => {
    setFeedbackState((current) =>
      isResourceActionCurrent(ticket)
        ? {
            scopeKey: listScopeKey,
            message,
            isCurrent: () => isResourceActionCurrent(ticket),
          }
        : current,
    );
  };

  const finishResourceActionUi = (ticket: AsyncAuthorityTicket) => {
    if (!finishResourceAction(ticket)) return;
    setBusyResource((current) => (current?.ticket === ticket ? null : current));
  };

  const handleResourceActionFailure = async (
    ticket: AsyncAuthorityTicket,
    nextError: unknown,
    canReconcile = false,
  ) => {
    if (
      isResourcesApiError(nextError) &&
      nextError.code === "NETWORK_UNAVAILABLE"
    ) {
      if (canReconcile) await loadRef.current();
      if (isResourceActionCurrent(ticket)) {
        setResourceActionError(
          ticket,
          "No pudimos confirmar el resultado. Revisá el estado antes de volver a intentarlo.",
        );
      }
      return canReconcile;
    }

    if (isResourceActionCurrent(ticket)) {
      setResourceActionError(ticket, messageFor(nextError));
    }
    return false;
  };

  const searchSubjects = async () => {
    if (subjectQuery.trim().length < 2) return;

    const ticket = beginSubjectSearch();
    if (!isSubjectSearchCurrent(ticket)) return;
    setErrorState(null);
    try {
      const options = await resourcesApi.searchSubjects(
        subjectQuery.trim(),
        ticket.signal,
      );
      if (!isSubjectSearchCurrent(ticket)) return;
      setSubjectOptionsState((current) =>
        isSubjectSearchCurrent(ticket)
          ? { scopeKey: subjectSearchScopeKey, options }
          : current,
      );
    } catch (nextError) {
      if (isSubjectSearchCurrent(ticket)) {
        setErrorState({
          scopeKey: listScopeKey,
          message: messageFor(nextError),
          isCurrent: () => isSubjectSearchCurrent(ticket),
        });
      }
    } finally {
      finishSubjectSearch(ticket);
    }
  };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !subject) return;
    if (hasUncertainResourceCreate) return;

    if (!SUPPORTED_TYPES.has(file.type)) {
      setErrorState({
        scopeKey: listScopeKey,
        message: "Usá PDF, JPG, PNG o WebP.",
      });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorState({
        scopeKey: listScopeKey,
        message: "El archivo supera el máximo de 50 MiB.",
      });
      return;
    }

    const ticket = beginUpload();
    if (!isUploadCurrent(ticket)) return;
    setUploadingState({ scopeKey: ticket.scopeKey, value: true });
    setUploadProgressState({ scopeKey: ticket.scopeKey, value: 0 });
    setErrorState(null);
    setFeedbackState(null);

    const operationKey = uploadOperationKey.current ?? crypto.randomUUID();
    uploadOperationKey.current = operationKey;
    let resourceCreateStarted = false;
    let reconciliationAttempted = false;
    let pendingResourceCreate: UncertainResourceCreate | null = null;
    setUploadPhase(ticket, "intent");

    try {
      const intent = await resourcesApi.createUploadIntent(
        file,
        operationKey,
        ticket.signal,
      );
      if (!isUploadCurrent(ticket)) return;
      setUploadPhase(ticket, "transfer");
      await resourcesApi.uploadDirect(
        intent.upload,
        file,
        (progress) => {
          setUploadProgressState((current) =>
            isUploadCurrent(ticket)
              ? { scopeKey: ticket.scopeKey, value: progress }
              : current,
          );
        },
        ticket.signal,
      );
      if (!isUploadCurrent(ticket)) return;
      setUploadPhase(ticket, "finalize");
      await resourcesApi.finalize(intent.file.id, ticket.signal);
      if (!isUploadCurrent(ticket)) return;
      setUploadPhase(ticket, "create");
      if (!user?.id) {
        setErrorState({
          scopeKey: listScopeKeyRef.current,
          message: "Iniciá sesión nuevamente antes de publicar el recurso.",
          isCurrent: () => isUploadCurrent(ticket),
        });
        return;
      }
      pendingResourceCreate = {
        userId: user.id,
        fileIdentity: fileIdentity(file),
        filename: file.name,
      };
      if (!rememberUncertainResourceCreate(pendingResourceCreate)) {
        forgetUncertainResourceCreate(
          pendingResourceCreate.userId,
          pendingResourceCreate.fileIdentity,
        );
        setErrorState({
          scopeKey: listScopeKeyRef.current,
          message:
            "No pudimos guardar el estado de la publicación. No se envió el recurso; volvé a intentarlo.",
          isCurrent: () => isUploadCurrent(ticket),
        });
        return;
      }
      resourceCreateStarted = true;
      const created = await resourcesApi.create(
        {
          assetId: intent.file.id,
          title,
          description: description.trim() || undefined,
          tags: listFrom(tags),
          subjectId: subject.id,
          visibility,
        },
        ticket.signal,
      );
      forgetUncertainResourceCreate(
        pendingResourceCreate.userId,
        pendingResourceCreate.fileIdentity,
      );
      pendingResourceCreate = null;
      if (!isUploadCurrent(ticket)) return;

      setFileSelection(null);
      uploadOperationKey.current = null;
      setUploadGeneration((current) => current + 1);
      setTitle("");
      setDescription("");
      setTags("");
      setSubjectSelection(null);
      setSubjectOptionsState(null);
      setSubjectQuery("");
      setUploadProgressState({ scopeKey: ticket.scopeKey, value: 0 });
      setFeedbackState({
        scopeKey: listScopeKeyRef.current,
        message: `Publicado: ${created.resource.title}`,
      });
      reconciliationAttempted = true;
      void loadRef.current();
    } catch (nextError) {
      if (
        resourceCreateStarted &&
        isUncertainResourceCreateOutcome(nextError)
      ) {
        if (!pendingResourceCreate && user?.id) {
          pendingResourceCreate = {
            userId: user.id,
            fileIdentity: fileIdentity(file),
            filename: file.name,
          };
          rememberUncertainResourceCreate(pendingResourceCreate);
        }
        if (isUploadCurrent(ticket)) {
          setErrorState({
            scopeKey: listScopeKeyRef.current,
            message:
              "No pudimos confirmar si se publicó el recurso. Revisá tus recursos antes de volver a intentarlo.",
            isCurrent: () => isUploadCurrent(ticket),
          });
        }
        reconciliationAttempted = true;
        await loadRef.current();
        return;
      }

      if (resourceCreateStarted && pendingResourceCreate) {
        forgetUncertainResourceCreate(
          pendingResourceCreate.userId,
          pendingResourceCreate.fileIdentity,
        );
      }
      if (isUploadCurrent(ticket)) {
        setErrorState({
          scopeKey: listScopeKeyRef.current,
          message: messageFor(nextError),
          isCurrent: () => isUploadCurrent(ticket),
        });
      }
    } finally {
      clearUploadPhase(ticket);
      if (finishUpload(ticket)) {
        setUploadingState({ scopeKey: ticket.scopeKey, value: false });
        setUploadProgressState({ scopeKey: ticket.scopeKey, value: 0 });
      } else if (
        ticket.signal.aborted &&
        resourceCreateStarted &&
        !reconciliationAttempted
      ) {
        void loadRef.current();
      }
    }
  };

  const openAccess = async (
    resource: ResourceView,
    disposition: "inline" | "attachment",
  ) => {
    const target = window.open("about:blank", "_blank");
    if (target) target.opener = null;

    const ticket = beginResourceAction();
    if (!isResourceActionCurrent(ticket)) {
      target?.close();
      return;
    }
    setResourceActionBusy(ticket, resource.id);
    setErrorState(null);
    setFeedbackState(null);

    try {
      const result = await resourcesApi.access(
        resource.id,
        disposition,
        ticket.signal,
      );
      if (!isResourceActionCurrent(ticket)) {
        target?.close();
        return;
      }
      if (target) {
        target.location.href = result.access.url;
      } else {
        window.location.assign(result.access.url);
      }
    } catch (nextError) {
      target?.close();
      if (isResourceActionCurrent(ticket)) {
        setResourceActionError(ticket, messageFor(nextError));
      }
    } finally {
      finishResourceActionUi(ticket);
    }
  };

  const updateVisibility = async (
    resource: ResourceView,
    next: ResourceVisibility,
  ) => {
    const ticket = beginResourceAction();
    if (!isResourceActionCurrent(ticket)) return;
    setResourceActionBusy(ticket, resource.id);
    setErrorState(null);
    setFeedbackState(null);
    let reconciliationAttempted = false;

    try {
      await resourcesApi.update(resource, { visibility: next }, ticket.signal);
      if (!isResourceActionCurrent(ticket)) return;
      await load();
      if (isResourceActionCurrent(ticket)) {
        setResourceActionFeedback(ticket, "Privacidad actualizada.");
      }
    } catch (nextError) {
      reconciliationAttempted = await handleResourceActionFailure(
        ticket,
        nextError,
        true,
      );
    } finally {
      if (ticket.signal.aborted && !reconciliationAttempted) {
        void loadRef.current();
      }
      finishResourceActionUi(ticket);
    }
  };

  const save = async (resource: ResourceView) => {
    const ticket = beginResourceAction();
    if (!isResourceActionCurrent(ticket)) return;
    setResourceActionBusy(ticket, resource.id);
    setErrorState(null);
    setFeedbackState(null);
    let reconciliationAttempted = false;

    try {
      await resourcesApi.save(resource.id, ticket.signal);
      if (isResourceActionCurrent(ticket)) {
        setResourceActionFeedback(ticket, "Apunte guardado.");
      }
    } catch (nextError) {
      reconciliationAttempted = await handleResourceActionFailure(
        ticket,
        nextError,
      );
    } finally {
      if (ticket.signal.aborted && !reconciliationAttempted) {
        void loadRef.current();
      }
      finishResourceActionUi(ticket);
    }
  };

  const unsave = async (resource: ResourceView) => {
    const ticket = beginResourceAction();
    if (!isResourceActionCurrent(ticket)) return;
    setResourceActionBusy(ticket, resource.id);
    setErrorState(null);
    setFeedbackState(null);
    let reconciliationAttempted = false;

    try {
      await resourcesApi.unsave(resource.id, ticket.signal);
      if (!isResourceActionCurrent(ticket)) return;
      setResourceActionFeedback(ticket, "Apunte quitado de guardados.");
      await load();
    } catch (nextError) {
      reconciliationAttempted = await handleResourceActionFailure(
        ticket,
        nextError,
        savedView,
      );
    } finally {
      if (ticket.signal.aborted && !reconciliationAttempted) {
        void loadRef.current();
      }
      finishResourceActionUi(ticket);
    }
  };

  const report = async (resource: ResourceView) => {
    const ticket = beginResourceAction();
    if (!isResourceActionCurrent(ticket)) return;
    setResourceActionBusy(ticket, resource.id);
    setErrorState(null);
    setFeedbackState(null);
    let reconciliationAttempted = false;

    try {
      await resourcesApi.report(resource.id, ticket.signal);
      if (isResourceActionCurrent(ticket)) {
        setResourceActionFeedback(ticket, "Reporte recibido para revisión.");
      }
    } catch (nextError) {
      reconciliationAttempted = await handleResourceActionFailure(
        ticket,
        nextError,
      );
    } finally {
      if (ticket.signal.aborted && !reconciliationAttempted) {
        void loadRef.current();
      }
      finishResourceActionUi(ticket);
    }
  };

  const share = async (resource: ResourceView, revoke = false) => {
    const profileId = shareInputs[resource.id]?.trim();
    if (!profileId) {
      setErrorState({
        scopeKey: listScopeKey,
        message: "Ingresá el UUID público del perfil.",
      });
      return;
    }

    const ticket = beginResourceAction();
    if (!isResourceActionCurrent(ticket)) return;
    setResourceActionBusy(ticket, resource.id);
    setErrorState(null);
    setFeedbackState(null);
    let reconciliationAttempted = false;

    try {
      if (revoke) {
        await resourcesApi.unshare(resource.id, profileId, ticket.signal);
        if (!isResourceActionCurrent(ticket)) return;
        setResourceActionFeedback(ticket, "Acceso compartido revocado.");
      } else {
        await resourcesApi.share(resource.id, profileId, ticket.signal);
        if (!isResourceActionCurrent(ticket)) return;
        setResourceActionFeedback(ticket, "Acceso compartido otorgado.");
      }
    } catch (nextError) {
      reconciliationAttempted = await handleResourceActionFailure(
        ticket,
        nextError,
      );
    } finally {
      if (ticket.signal.aborted && !reconciliationAttempted) {
        void loadRef.current();
      }
      finishResourceActionUi(ticket);
    }
  };

  return (
    <section className="resources-page">
      <header className="resources-hero">
        <div>
          <p className="resources-eyebrow">Apuntes y recursos</p>
          <h1>Encontrá material útil sin perder el contexto académico</h1>
          <p>
            Cada recurso conserva su materia canónica y su privacidad se
            revalida antes de cada descarga.
          </p>
        </div>
        {authenticated && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              invalidateListRequest();
              setSavedMode((current) => !current);
            }}
          >
            {savedMode ? "Ver descubrimiento" : "Ver guardados"}
          </button>
        )}
      </header>

      {feedback && (
        <p className="resources-success" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="resources-error" role="alert">
          {error}
        </p>
      )}

      {subjectIdFilter && (
        <p className="resources-login-note">
          Filtrando por la materia seleccionada desde búsqueda.{" "}
          <Link to="/resources">Quitar filtro de materia</Link>
        </p>
      )}

      <form
        className="resources-search"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <input
          aria-label="Buscar apuntes"
          placeholder="Buscar por título, descripción o etiqueta"
          value={query}
          onChange={(event) => {
            invalidateListRequest();
            setQueryGeneration((current) => current + 1);
            setQuery(event.target.value);
          }}
          disabled={savedView}
        />
        <select
          aria-label="Filtrar privacidad"
          value={visibilityFilter}
          onChange={(event) => {
            invalidateListRequest();
            setVisibilityFilter(event.target.value as ResourceVisibility | "");
          }}
          disabled={savedView}
        >
          <option value="">Todas las visibles</option>
          <option value="public">Públicas</option>
          {authenticated && <option value="shared">Compartidas</option>}
          {authenticated && <option value="private">Privadas propias</option>}
        </select>
        <button type="submit" disabled={loading}>
          Buscar
        </button>
      </form>

      {authenticated ? (
        <details className="resources-publish">
          <summary>Subir un apunte</summary>
          <form onSubmit={publish} className="resources-form">
            <label>
              Archivo
              <input
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  invalidateUpload();
                  setUploadGeneration((current) => current + 1);
                  setFileSelection(
                    selected ? { authScopeKey, file: selected } : null,
                  );
                  uploadOperationKey.current = selected
                    ? crypto.randomUUID()
                    : null;
                }}
              />
              <small>PDF, JPG, PNG o WebP · máximo 50 MiB.</small>
            </label>

            <label>
              Título
              <input
                required
                minLength={2}
                maxLength={160}
                disabled={uploading}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <label className="resources-wide">
              Descripción
              <textarea
                rows={3}
                maxLength={3000}
                disabled={uploading}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label>
              Etiquetas separadas por coma
              <input
                disabled={uploading}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </label>

            <label>
              Privacidad
              <select
                disabled={uploading}
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as ResourceVisibility)
                }
              >
                <option value="private">Privado</option>
                <option value="shared">Compartido explícitamente</option>
                <option value="public">Público</option>
              </select>
            </label>

            <div className="resources-wide subject-picker">
              <label>
                Buscar materia canónica
                <div className="inline-control">
                  <input
                    minLength={2}
                    value={subjectQuery}
                    disabled={uploading}
                    onChange={(event) => {
                      invalidateSubjectSearch();
                      setSubjectQueryGeneration((current) => current + 1);
                      setSubjectQuery(event.target.value);
                    }}
                    placeholder="Ej. Base de Datos"
                  />
                  <button
                    type="button"
                    disabled={uploading || subjectQuery.trim().length < 2}
                    onClick={() => void searchSubjects()}
                  >
                    Buscar materia
                  </button>
                </div>
              </label>

              {selectedSubject && (
                <p className="subject-selected">
                  Materia seleccionada: <strong>{selectedSubject.name}</strong>
                </p>
              )}

              {subjectOptions.length > 0 && (
                <ul className="subject-results">
                  {subjectOptions.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => {
                          invalidateUpload();
                          setUploadGeneration((current) => current + 1);
                          setSubjectSelection({
                            authScopeKey,
                            subject: option,
                          });
                        }}
                      >
                        {option.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {uploading && (
              <div className="resources-wide upload-progress" role="status">
                <progress max={100} value={uploadProgress} />
                <span>{uploadProgress}%</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const phase = activeUploadPhase.current;
                    const resourceCreationMayHaveCommitted =
                      phase?.phase === "create" &&
                      isUploadCurrent(phase.ticket);
                    if (phase) clearUploadPhase(phase.ticket);
                    invalidateUpload();
                    if (resourceCreationMayHaveCommitted) {
                      if (user?.id && file) {
                        rememberUncertainResourceCreate({
                          userId: user.id,
                          fileIdentity: fileIdentity(file),
                          filename: file.name,
                        });
                      } else {
                        setErrorState({
                          scopeKey: listScopeKey,
                          message:
                            "No pudimos confirmar si se publicó el recurso. Revisá tus recursos antes de volver a intentarlo.",
                        });
                      }
                    } else {
                      uploadOperationKey.current = null;
                    }
                    setUploadGeneration((current) => current + 1);
                    setUploadingState({
                      scopeKey: uploadScopeKey,
                      value: false,
                    });
                    setUploadProgressState({
                      scopeKey: uploadScopeKey,
                      value: 0,
                    });
                    if (!resourceCreationMayHaveCommitted) {
                      setErrorState({
                        scopeKey: listScopeKey,
                        message: "La subida fue cancelada.",
                      });
                    }
                  }}
                >
                  Cancelar subida
                </button>
              </div>
            )}

            {(currentUncertainResourceCreate ||
              hasRecoveredUncertainResourceCreate) && (
              <div className="resources-wide resources-error" role="alert">
                <p>
                  {currentUncertainResourceCreate
                    ? `No pudimos confirmar si se publicó “${currentUncertainResourceCreate.filename}”. Revisá tus recursos antes de habilitar otro intento para evitar duplicados.`
                    : "No pudimos confirmar el resultado de una publicación anterior. Revisá tus recursos antes de volver a publicar para evitar duplicados."}
                </p>
                <button
                  type="button"
                  className="secondary"
                  disabled={uploading}
                  onClick={() => {
                    if (!user?.id) return;
                    if (
                      currentUncertainResourceCreate &&
                      selectedFileIdentity
                    ) {
                      forgetUncertainResourceCreate(
                        user.id,
                        selectedFileIdentity,
                      );
                    } else {
                      forgetUncertainResourceCreate(user.id);
                    }
                    uploadOperationKey.current = crypto.randomUUID();
                    setUploadGeneration((current) => current + 1);
                  }}
                >
                  Ya revisé Recursos; permitir otro intento
                </button>
              </div>
            )}

            <div className="resources-wide">
              <button
                type="submit"
                disabled={
                  uploading ||
                  !file ||
                  !selectedSubject ||
                  hasUncertainResourceCreate
                }
              >
                {uploading ? "Subiendo…" : "Publicar recurso"}
              </button>
            </div>
          </form>
        </details>
      ) : (
        <p className="resources-login-note">
          <Link to="/login">Iniciá sesión</Link> para subir, guardar o descargar
          recursos.
        </p>
      )}

      <section className="resources-list" aria-live="polite">
        {loading ? (
          <p>Cargando recursos…</p>
        ) : items.length === 0 ? (
          <p>No encontramos recursos con esos filtros.</p>
        ) : (
          items.map((resource) => (
            <article className="resource-card" key={resource.id}>
              <header>
                <div>
                  <span className="resource-visibility">
                    {resource.visibility}
                  </span>
                  <h2>{resource.title}</h2>
                  <p>
                    {resource.author?.displayName ?? "Usuario de Los Apuntes"} ·{" "}
                    {resource.academic.subject.name}
                  </p>
                </div>
                <span>{Math.ceil(resource.file.byteSize / 1024)} KiB</span>
              </header>

              {resource.description && <p>{resource.description}</p>}
              {resource.tags.length > 0 && (
                <div className="resource-tags">
                  {resource.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}

              <div className="resource-actions">
                {authenticated ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void openAccess(resource, "inline")}
                    >
                      Vista previa
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busyId !== null}
                      onClick={() => void openAccess(resource, "attachment")}
                    >
                      Descargar
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busyId !== null}
                      onClick={() =>
                        void (savedView ? unsave(resource) : save(resource))
                      }
                    >
                      {savedView ? "Quitar de guardados" : "Guardar"}
                    </button>
                    {!resource.capabilities.edit && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyId !== null}
                        onClick={() => void report(resource)}
                      >
                        Reportar
                      </button>
                    )}
                  </>
                ) : (
                  <Link to="/login">Iniciar sesión para abrir</Link>
                )}
              </div>

              {resource.capabilities.edit && (
                <div className="resource-owner-controls">
                  <label>
                    Privacidad
                    <select
                      value={resource.visibility}
                      disabled={busyId !== null}
                      onChange={(event) =>
                        void updateVisibility(
                          resource,
                          event.target.value as ResourceVisibility,
                        )
                      }
                    >
                      <option value="private">Privado</option>
                      <option value="shared">Compartido</option>
                      <option value="public">Público</option>
                    </select>
                  </label>

                  {resource.capabilities.manageShares &&
                    resource.visibility === "shared" && (
                      <div>
                        <label>
                          Profile UUID
                          <input
                            placeholder="UUID público del perfil"
                            value={shareInputs[resource.id] ?? ""}
                            onChange={(event) =>
                              setShareInputs((current) => ({
                                ...current,
                                [resource.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="resource-actions">
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => void share(resource)}
                          >
                            Compartir
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busyId !== null}
                            onClick={() => void share(resource, true)}
                          >
                            Revocar
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              )}
            </article>
          ))
        )}

        {nextCursor && (
          <button
            type="button"
            className="secondary"
            disabled={loading || loadingMore}
            onClick={() => void load(nextCursor, true)}
          >
            {loadingMore ? "Cargando…" : "Cargar más"}
          </button>
        )}
      </section>
    </section>
  );
};

export default Resources;
