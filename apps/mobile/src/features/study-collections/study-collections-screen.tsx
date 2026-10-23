import type { ResourceView } from "@losapuntes/contracts";
import * as Crypto from "expo-crypto";
import { Redirect, useIsFocused, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";
import { mobileSearchApi } from "@/features/search/search-runtime";
import { MobileResourceShareAction } from "@/features/resources/resource-share-action";
import { ApiRequestError } from "@/services/api/client";

import {
  type CollectionResourceItem,
  type StudyCollection,
} from "./study-collections-api";
import { MOBILE_PERSISTENT_COLLECTIONS_VISIBLE } from "./persistent-collections-flag";
import { mobileStudyCollectionsApi } from "./study-collections-runtime";

type CollectionListState = {
  authorityKey: string;
  items: StudyCollection[];
  nextCursor: string | null;
  busy: boolean;
  error: string | null;
};

type CollectionDetailState = {
  authorityKey: string;
  collection: StudyCollection | null;
  items: CollectionResourceItem[];
  nextCursor: string | null;
  revision: number;
  busy: boolean;
  error: string | null;
};

type CreateAttempt = { signature: string; operationKey: string };

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (
      error.code === "STUDY_COLLECTIONS_NOT_ENABLED" ||
      error.status === 503
    ) {
      return "Las colecciones sincronizadas todavía no están habilitadas.";
    }
    if (error.code === "STUDY_COLLECTION_REVISION_CONFLICT") {
      return "La colección cambió en otro dispositivo. Actualizala antes de editar.";
    }
    if (error.code === "STUDY_COLLECTION_CURSOR_STALE") {
      return "La colección cambió mientras cargábamos los apuntes. Actualizala para continuar.";
    }
    if (error.code === "STUDY_COLLECTION_FULL") {
      return "Esta colección llegó al máximo de 100 apuntes.";
    }
    if (error.kind === "offline") {
      return "No hay conexión. Volvé a intentarlo cuando estés en línea.";
    }
    if (error.kind === "timeout") {
      return "El servidor tardó demasiado en responder.";
    }
    if (error.status === 401)
      return "Tu sesión venció. Iniciá sesión nuevamente.";
    if (error.status === 403 || error.status === 404) {
      return "La colección o el apunte ya no está disponible.";
    }
    return error.message;
  }
  return "No pudimos completar la operación.";
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  return Array.from(
    new Map([...current, ...incoming].map((item) => [item.id, item])).values(),
  );
}

function mergeResources(
  current: CollectionResourceItem[],
  incoming: CollectionResourceItem[],
): CollectionResourceItem[] {
  return Array.from(
    new Map(
      [...current, ...incoming].map((item) => [item.resourceId, item]),
    ).values(),
  );
}

export function StudyCollectionsScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { snapshot: session } = useSession();
  const [appState, setAppState] = useState(AppState.currentState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listState, setListState] = useState<CollectionListState | null>(null);
  const [detailState, setDetailState] = useState<CollectionDetailState | null>(
    null,
  );
  const [listRefresh, setListRefresh] = useState(0);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ResourceView[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const createAttempt = useRef<CreateAttempt | null>(null);
  const mutationLock = useRef(false);
  const mutationAbort = useRef<AbortController | null>(null);
  const authorityRef = useRef<string | null>(null);

  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey =
    focused && appState === "active" ? sessionAuthority : null;
  authorityRef.current = authorityKey;
  const currentList =
    listState?.authorityKey === authorityKey ? listState : null;
  const currentDetail =
    detailState?.authorityKey === authorityKey &&
    selectedId !== null &&
    (detailState.collection?.id ?? selectedId) === selectedId
      ? detailState
      : null;
  const selectedCollection = currentDetail?.collection ?? null;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setTitle("");
    setDescription("");
    setSearchQuery("");
    setSearchResults([]);
    setEditing(false);
    createAttempt.current = null;
  }, [sessionAuthority]);

  useEffect(() => {
    if (!authorityKey || !MOBILE_PERSISTENT_COLLECTIONS_VISIBLE) return;
    const controller = new AbortController();
    const scope = authorityKey;
    setListState({
      authorityKey: scope,
      items: [],
      nextCursor: null,
      busy: true,
      error: null,
    });
    void mobileStudyCollectionsApi.list(undefined, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted && authorityRef.current === scope) {
          setListState({
            authorityKey: scope,
            items: page.items,
            nextCursor: page.nextCursor,
            busy: false,
            error: null,
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted && authorityRef.current === scope) {
          setListState({
            authorityKey: scope,
            items: [],
            nextCursor: null,
            busy: false,
            error: errorMessage(error),
          });
        }
      },
    );
    return () => controller.abort();
  }, [authorityKey, listRefresh]);

  useEffect(() => {
    setDetailState(null);
    setEditing(false);
    setSearchQuery("");
    setSearchResults([]);
  }, [selectedId, authorityKey]);

  useEffect(() => {
    if (
      !authorityKey ||
      !selectedId ||
      !MOBILE_PERSISTENT_COLLECTIONS_VISIBLE
    ) {
      return;
    }
    const controller = new AbortController();
    const scope = authorityKey;
    setDetailState(null);
    void Promise.all([
      mobileStudyCollectionsApi.get(selectedId, controller.signal),
      mobileStudyCollectionsApi.resources(
        selectedId,
        undefined,
        controller.signal,
      ),
    ]).then(
      ([header, page]) => {
        if (controller.signal.aborted || authorityRef.current !== scope) return;
        if (header.collection.revision !== page.revision) {
          setDetailState({
            authorityKey: scope,
            collection: header.collection,
            items: [],
            nextCursor: null,
            revision: page.revision,
            busy: false,
            error:
              "La colección cambió durante la consulta. Actualizala para ver sus apuntes.",
          });
          return;
        }
        setDetailState({
          authorityKey: scope,
          collection: header.collection,
          items: page.items,
          nextCursor: page.nextCursor,
          revision: page.revision,
          busy: false,
          error: null,
        });
      },
      (error: unknown) => {
        if (!controller.signal.aborted && authorityRef.current === scope) {
          setDetailState({
            authorityKey: scope,
            collection: null,
            items: [],
            nextCursor: null,
            revision: 0,
            busy: false,
            error: errorMessage(error),
          });
        }
      },
    );
    return () => controller.abort();
  }, [authorityKey, selectedId, detailRefresh]);

  useEffect(() => {
    const query = searchQuery.trim().replace(/\s+/gu, " ");
    if (
      !authorityKey ||
      !selectedId ||
      query.length < 2 ||
      !MOBILE_PERSISTENT_COLLECTIONS_VISIBLE
    ) {
      setSearchResults([]);
      setSearchBusy(false);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    const scope = authorityKey;
    const timeout = setTimeout(() => {
      setSearchBusy(true);
      setSearchError(null);
      void mobileSearchApi
        .search({ q: query, scope: "resources" }, controller.signal)
        .then(
          (result) => {
            if (!controller.signal.aborted && authorityRef.current === scope) {
              setSearchResults(result.results.resources);
              setSearchBusy(false);
            }
          },
          (error: unknown) => {
            if (!controller.signal.aborted && authorityRef.current === scope) {
              setSearchResults([]);
              setSearchError(errorMessage(error));
              setSearchBusy(false);
            }
          },
        );
    }, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [authorityKey, selectedId, searchQuery]);

  useEffect(() => {
    return () => mutationAbort.current?.abort();
  }, []);

  useEffect(() => {
    if (!authorityKey) mutationAbort.current?.abort();
  }, [authorityKey]);

  const refresh = () => {
    setListRefresh((value) => value + 1);
    setDetailRefresh((value) => value + 1);
  };

  const mutate = async (
    operation: (signal: AbortSignal) => Promise<void>,
    successMessage: string,
  ) => {
    const scope = authorityKey;
    if (!scope || mutationLock.current) return;
    mutationLock.current = true;
    const controller = new AbortController();
    mutationAbort.current = controller;
    setMutating(true);
    setActionError(null);
    setNotice(null);
    try {
      await operation(controller.signal);
      if (controller.signal.aborted || authorityRef.current !== scope) return;
      setNotice(successMessage);
      setListRefresh((value) => value + 1);
      if (selectedId) setDetailRefresh((value) => value + 1);
    } catch (error) {
      if (!controller.signal.aborted && authorityRef.current === scope) {
        setActionError(errorMessage(error));
      }
    } finally {
      if (mutationAbort.current === controller) mutationAbort.current = null;
      mutationLock.current = false;
      if (authorityRef.current === scope) setMutating(false);
    }
  };

  const createCollection = () => {
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (
      !cleanTitle ||
      cleanTitle.length > 100 ||
      cleanDescription.length > 500
    ) {
      setActionError(
        "El nombre debe tener hasta 100 caracteres y la descripción hasta 500.",
      );
      return;
    }
    const signature = `${cleanTitle}\u0000${cleanDescription}`;
    const attempt =
      createAttempt.current?.signature === signature
        ? createAttempt.current
        : { signature, operationKey: Crypto.randomUUID() };
    createAttempt.current = attempt;
    void mutate(async (signal) => {
      const result = await mobileStudyCollectionsApi.create(
        {
          operationKey: attempt.operationKey,
          title: cleanTitle,
          ...(cleanDescription ? { description: cleanDescription } : {}),
        },
        signal,
      );
      if (!signal.aborted) {
        createAttempt.current = null;
        setSelectedId(result.collection.id);
        setTitle("");
        setDescription("");
      }
    }, "Colección creada.");
  };

  const updateCollection = () => {
    const collection = currentDetail?.collection;
    if (!collection) return;
    const cleanTitle = editTitle.trim();
    const cleanDescription = editDescription.trim();
    if (
      !cleanTitle ||
      cleanTitle.length > 100 ||
      cleanDescription.length > 500
    ) {
      setActionError(
        "El nombre debe tener hasta 100 caracteres y la descripción hasta 500.",
      );
      return;
    }
    void mutate(async (signal) => {
      await mobileStudyCollectionsApi.update(
        collection.id,
        {
          expectedRevision: collection.revision,
          title: cleanTitle,
          description: cleanDescription,
        },
        signal,
      );
      if (!signal.aborted) setEditing(false);
    }, "Cambios guardados.");
  };

  const deleteCollection = (collection: StudyCollection) => {
    Alert.alert(
      "Eliminar colección",
      `¿Eliminar “${collection.title}”? Los apuntes originales se conservan.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            void mutate(async (signal) => {
              await mobileStudyCollectionsApi.delete(collection.id, signal);
              if (!signal.aborted) setSelectedId(null);
            }, "Colección eliminada."),
        },
      ],
    );
  };

  const addResource = (resourceId: string) => {
    if (!selectedId) return;
    void mutate(async (signal) => {
      await mobileStudyCollectionsApi.add(selectedId, resourceId, signal);
    }, "Apunte agregado a la colección.");
  };

  const removeResource = (resourceId: string) => {
    const collection = currentDetail?.collection;
    if (!currentDetail || !collection) return;
    void mutate(async (signal) => {
      await mobileStudyCollectionsApi.remove(
        collection.id,
        resourceId,
        currentDetail.revision,
        signal,
      );
    }, "Apunte quitado de la colección.");
  };

  const loadMoreCollections = async () => {
    if (!currentList?.nextCursor || !authorityKey) return;
    const scope = authorityKey;
    setListState({ ...currentList, busy: true, error: null });
    try {
      const page = await mobileStudyCollectionsApi.list(currentList.nextCursor);
      if (authorityRef.current !== scope) return;
      setListState({
        authorityKey: scope,
        items: mergeById(currentList.items, page.items),
        nextCursor: page.nextCursor,
        busy: false,
        error: null,
      });
    } catch (error) {
      if (authorityRef.current === scope) {
        setListState({
          ...currentList,
          busy: false,
          error: errorMessage(error),
        });
      }
    }
  };

  const loadMoreResources = async () => {
    const collection = currentDetail?.collection;
    if (
      !currentDetail ||
      !collection ||
      !currentDetail.nextCursor ||
      !authorityKey
    )
      return;
    const scope = authorityKey;
    const selectedCollectionId = collection.id;
    setDetailState({ ...currentDetail, busy: true, error: null });
    try {
      const page = await mobileStudyCollectionsApi.resources(
        selectedCollectionId,
        currentDetail.nextCursor,
      );
      if (authorityRef.current !== scope || selectedId !== selectedCollectionId)
        return;
      if (page.revision !== currentDetail.revision) {
        throw new ApiRequestError(
          "conflict",
          409,
          "STUDY_COLLECTION_CURSOR_STALE",
          "Collection changed while paging",
        );
      }
      setDetailState({
        ...currentDetail,
        items: mergeResources(currentDetail.items, page.items),
        nextCursor: page.nextCursor,
        busy: false,
        error: null,
      });
    } catch (error) {
      if (
        authorityRef.current === scope &&
        selectedId === selectedCollectionId
      ) {
        setDetailState({
          ...currentDetail,
          busy: false,
          error: errorMessage(error),
        });
      }
    }
  };

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  if (!MOBILE_PERSISTENT_COLLECTIONS_VISIBLE) {
    return (
      <ProductSurface
        title="Colecciones de estudio"
        description="Organizá apuntes por materia, parcial o tema."
      >
        <View style={styles.card}>
          <Text style={styles.copy}>
            Las colecciones sincronizadas todavía no están habilitadas en esta
            versión.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonText}>Volver</Text>
          </Pressable>
        </View>
      </ProductSurface>
    );
  }

  return (
    <ProductSurface
      title="Colecciones de estudio"
      description="Armá listas sincronizadas de apuntes. Los permisos originales de cada recurso se mantienen."
      onRefresh={refresh}
      refreshing={Boolean(currentList?.busy || currentDetail?.busy)}
    >
      {actionError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {actionError}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          {notice}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Mis colecciones
        </Text>
        <TextInput
          accessibilityLabel="Nombre de la nueva colección"
          maxLength={100}
          placeholder="Ej.: Segundo parcial de Física"
          value={title}
          onChangeText={setTitle}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Descripción de la nueva colección"
          maxLength={500}
          multiline
          placeholder="Descripción (opcional)"
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.multiline]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: mutating || !title.trim() }}
          disabled={mutating || !title.trim()}
          onPress={createCollection}
          style={[
            styles.primaryButton,
            (mutating || !title.trim()) && styles.disabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>Crear colección</Text>
        </Pressable>
        {!currentList || currentList.busy ? (
          <ActivityIndicator accessibilityLabel="Cargando colecciones" />
        ) : null}
        {currentList?.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {currentList.error}
          </Text>
        ) : null}
        {currentList && !currentList.busy && !currentList.items.length ? (
          <Text style={styles.copy}>
            Todavía no hay colecciones. Creá una para empezar.
          </Text>
        ) : null}
        <View style={styles.collectionList}>
          {currentList?.items.map((collection) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === collection.id }}
              key={collection.id}
              onPress={() => setSelectedId(collection.id)}
              style={[
                styles.collectionRow,
                selectedId === collection.id && styles.selectedRow,
              ]}
            >
              <Text style={styles.collectionTitle}>{collection.title}</Text>
              <Text style={styles.meta}>
                {collection.resourceCount} apuntes
              </Text>
            </Pressable>
          ))}
        </View>
        {currentList?.nextCursor ? (
          <Pressable
            accessibilityRole="button"
            disabled={currentList.busy}
            onPress={() => void loadMoreCollections()}
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonText}>Mostrar más colecciones</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.card}>
        {!selectedId ? (
          <>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Elegí una colección
            </Text>
            <Text style={styles.copy}>
              Podés buscar apuntes y agregarlos sin cambiar su privacidad.
            </Text>
          </>
        ) : currentDetail?.busy || !currentDetail ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator accessibilityLabel="Cargando colección" />
            <Text style={styles.copy}>Cargando colección…</Text>
          </View>
        ) : !selectedCollection ? (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.error}>
              {currentDetail.error ?? "No pudimos abrir esta colección."}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDetailRefresh((value) => value + 1)}
              style={styles.secondaryButton}
            >
              <Text style={styles.buttonText}>Actualizar colección</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {selectedCollection.title}
            </Text>
            {selectedCollection.description ? (
              <Text style={styles.copy}>{selectedCollection.description}</Text>
            ) : null}
            <Text style={styles.meta}>
              {selectedCollection.resourceCount} apuntes
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                disabled={mutating}
                onPress={() => {
                  setEditTitle(selectedCollection.title);
                  setEditDescription(selectedCollection.description ?? "");
                  setEditing((value) => !value);
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>
                  {editing ? "Cancelar edición" : "Editar"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={mutating}
                onPress={() => deleteCollection(selectedCollection)}
                style={styles.dangerButton}
              >
                <Text style={styles.dangerButtonText}>Eliminar</Text>
              </Pressable>
            </View>
            {editing ? (
              <View style={styles.form}>
                <TextInput
                  accessibilityLabel="Nombre de la colección"
                  maxLength={100}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  style={styles.input}
                />
                <TextInput
                  accessibilityLabel="Descripción de la colección"
                  maxLength={500}
                  multiline
                  value={editDescription}
                  onChangeText={setEditDescription}
                  style={[styles.input, styles.multiline]}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={mutating || !editTitle.trim()}
                  onPress={updateCollection}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Guardar cambios</Text>
                </Pressable>
              </View>
            ) : null}
            {currentDetail.error ? (
              <View>
                <Text accessibilityRole="alert" style={styles.error}>
                  {currentDetail.error}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDetailRefresh((value) => value + 1)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.buttonText}>Actualizar colección</Text>
                </Pressable>
              </View>
            ) : null}
            <Text accessibilityRole="header" style={styles.subheading}>
              Apuntes de esta colección
            </Text>
            {!currentDetail.items.length && !currentDetail.error ? (
              <Text style={styles.copy}>Todavía no agregaste apuntes.</Text>
            ) : null}
            {currentDetail.items.map((item) => (
              <View key={item.resourceId} style={styles.resourceRow}>
                {item.resource && item.resource.id === item.resourceId ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      router.push({
                        pathname: "/resources/[id]",
                        params: { id: item.resourceId },
                      })
                    }
                    style={styles.resourceLink}
                  >
                    <Text style={styles.collectionTitle}>
                      {item.resource.title}
                    </Text>
                    <Text style={styles.meta}>
                      {item.resource.academic.subject.name}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.copy}>
                    Apunte no disponible o sin permiso.
                  </Text>
                )}
                <View style={styles.resourceActions}>
                  {item.resource && item.resource.id === item.resourceId ? (
                    <MobileResourceShareAction
                      resourceId={item.resource.id}
                      resourceTitle={item.resource.title}
                    />
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={mutating}
                    onPress={() => removeResource(item.resourceId)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.buttonText}>Quitar</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {currentDetail.nextCursor ? (
              <Pressable
                accessibilityRole="button"
                disabled={currentDetail.busy}
                onPress={() => void loadMoreResources()}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Mostrar más apuntes</Text>
              </Pressable>
            ) : null}

            <Text accessibilityRole="header" style={styles.subheading}>
              Agregar apuntes
            </Text>
            <TextInput
              accessibilityLabel="Buscar apuntes para agregar"
              autoCapitalize="none"
              onChangeText={setSearchQuery}
              placeholder="Buscar por título o tema"
              value={searchQuery}
              style={styles.input}
            />
            {searchQuery.trim().length === 1 ? (
              <Text style={styles.meta}>Escribí al menos 2 caracteres.</Text>
            ) : null}
            {searchBusy ? (
              <ActivityIndicator accessibilityLabel="Buscando apuntes" />
            ) : null}
            {searchError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {searchError}
              </Text>
            ) : null}
            {searchResults.map((resource) => {
              const included = currentDetail.items.some(
                (item) => item.resourceId === resource.id,
              );
              return (
                <View key={resource.id} style={styles.resourceRow}>
                  <View style={styles.resourceLink}>
                    <Text style={styles.collectionTitle}>{resource.title}</Text>
                    <Text style={styles.meta}>
                      {resource.academic.subject.name}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={mutating || included}
                    onPress={() => addResource(resource.id)}
                    style={[
                      styles.secondaryButton,
                      included && styles.disabled,
                    ]}
                  >
                    <Text style={styles.buttonText}>
                      {included ? "Agregado" : "Agregar"}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}
      </View>
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderRadius: 18, padding: 18, backgroundColor: "#ffffff" },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: "#20202a",
  },
  subheading: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: { fontSize: 14, lineHeight: 21, color: "#55555f" },
  meta: { fontSize: 12, lineHeight: 18, color: "#686875" },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 11,
    paddingHorizontal: 12,
    color: "#20202a",
    fontSize: 15,
  },
  multiline: { minHeight: 76, paddingTop: 11, textAlignVertical: "top" },
  primaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#3446a2",
  },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  secondaryButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  buttonText: { color: "#43366a", fontSize: 14, fontWeight: "700" },
  dangerButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d6a6ad",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  dangerButtonText: { color: "#8a1f2f", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.48 },
  error: { color: "#9f1d1d", fontSize: 14, lineHeight: 20 },
  success: { color: "#17643a", fontSize: 14, lineHeight: 20 },
  collectionList: { gap: 8 },
  collectionRow: {
    minHeight: 54,
    gap: 4,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e2e8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedRow: { borderColor: "#43366a", backgroundColor: "#f1eff8" },
  collectionTitle: {
    color: "#20202a",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  actionRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  form: { gap: 10 },
  resourceRow: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 10,
  },
  resourceLink: { gap: 4, minHeight: 44, justifyContent: "center" },
  resourceActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  loadingRow: { flexDirection: "row", gap: 10, alignItems: "center" },
});
