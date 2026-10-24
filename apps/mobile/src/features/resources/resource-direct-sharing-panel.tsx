import type { ResourceView } from "@losapuntes/contracts";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  MobileResourceDirectSharingController,
  RESOURCE_SHARE_PEOPLE_QUERY_MAX,
  validSharePeopleQuery,
  type ResourceDirectSharingSnapshot,
} from "./resource-direct-sharing-controller";

const failureCopy = {
  offline: "No hay conexión para completar esta operación.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "El servicio no está disponible ahora.",
  forbidden: "No tenés permiso para compartir este apunte.",
  not_found: "La persona o el apunte ya no están disponibles.",
  restricted: "La cuenta no puede administrar permisos.",
  error: "No pudimos verificar el resultado de esta operación.",
  cursor_cycle:
    "La lista volvió a una página anterior. Actualizá los accesos para iniciar una tanda nueva.",
} as const;

export function ResourceDirectSharingPanel({
  authorityKey,
  resource,
  snapshot,
  controller,
  onRefresh,
}: {
  authorityKey: string | null;
  resource: ResourceView;
  snapshot: ResourceDirectSharingSnapshot;
  controller: MobileResourceDirectSharingController;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const current =
    snapshot.kind === "ready" &&
    snapshot.authorityKey === authorityKey &&
    snapshot.resourceId === resource.id &&
    snapshot.revision === resource.revision &&
    snapshot.visibility === resource.visibility
      ? snapshot
      : null;
  const selected = current?.selected ?? null;
  const busy = current?.busy !== null && current?.busy !== undefined;
  const canSearch =
    Boolean(authorityKey && current) &&
    !busy &&
    current?.outcome !== "visibility_changed" &&
    validSharePeopleQuery(query);
  const selectedHasAccess = Boolean(
    selected &&
    current?.grants.some((grant) => grant.profileId === selected.profileId),
  );

  useEffect(() => {
    if (
      authorityKey &&
      current &&
      resource.visibility === "shared" &&
      current.grantsState === "idle" &&
      current.outcome !== "visibility_changed" &&
      !current.busy
    ) {
      void controller.loadGrants(authorityKey, resource.id);
    }
  }, [
    authorityKey,
    controller,
    current?.busy,
    current?.grantsState,
    current?.outcome,
    resource.id,
    resource.visibility,
    resource.revision,
  ]);

  useEffect(() => {
    setQuery("");
    setConfirmRevoke(false);
  }, [authorityKey, resource.id, resource.revision, resource.visibility]);

  if (!resource.capabilities.manageShares) return null;

  const changeQuery = (value: string) => {
    setQuery(value);
    setConfirmRevoke(false);
    if (authorityKey) {
      controller.clearSearch(authorityKey, resource.id);
    }
  };

  const search = () => {
    if (!authorityKey || !canSearch) return;
    void controller.search(authorityKey, resource.id, query);
  };

  const mutate = (action: "grant" | "revoke") => {
    if (!authorityKey || !selected || busy) return;
    if (action === "revoke" && !confirmRevoke) return;
    void controller.mutate(authorityKey, resource.id, action).then(() => {
      setConfirmRevoke(false);
    });
  };

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Compartir con personas
      </Text>
      {resource.visibility !== "shared" ? (
        <Text style={styles.info}>
          Para conceder acceso a personas específicas, primero elegí
          “Compartido” en Editar mi apunte. Este estado no concede permisos
          automáticamente.
        </Text>
      ) : (
        <>
          <Text style={styles.info}>
            Consultá las personas que tienen acceso vigente y revocá permisos
            desde la lista. También podés buscar otro destinatario y concederle
            acceso.
          </Text>
          <Text accessibilityRole="header" style={styles.heading}>
            Personas con acceso
          </Text>
          {current?.grantsState === "loading" ? (
            <View style={styles.row}>
              <ActivityIndicator accessibilityLabel="Cargando accesos" />
              <Text style={styles.info}>Consultando permisos…</Text>
            </View>
          ) : null}
          {current?.grantsState === "error" ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureCopy[current.grantsFailure ?? "error"]}
            </Text>
          ) : null}
          {current?.grantsState === "ready" && current.grantsFailure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureCopy[current.grantsFailure]}
            </Text>
          ) : null}
          {current?.grantsState === "ready" ? (
            <>
              <Text style={styles.info}>
                {current.grants.length === 0
                  ? "Todavía no se encontraron personas con acceso."
                  : `${current.grants.length} personas con acceso cargadas.`}
                {current.grantsNextCursor
                  ? " Quedan más permisos por consultar."
                  : ""}
              </Text>
              <View style={styles.people}>
                {current.grants.map((grant) => (
                  <Pressable
                    key={grant.profileId}
                    accessibilityRole="button"
                    accessibilityLabel={`Administrar acceso de ${grant.displayName}`}
                    disabled={busy}
                    onPress={() => {
                      if (!authorityKey) return;
                      controller.selectGrant(
                        authorityKey,
                        resource.id,
                        grant.profileId,
                      );
                      setConfirmRevoke(false);
                    }}
                    style={[
                      styles.person,
                      selected?.profileId === grant.profileId &&
                        styles.selected,
                    ]}
                  >
                    <Text style={styles.personName}>{grant.displayName}</Text>
                    <Text style={styles.info}>
                      Permiso concedido:{" "}
                      {new Date(grant.grantedAt).toLocaleDateString("es-AR")}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {current.grantsNextCursor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    current.grantsFailure
                      ? "Reintentar carga de personas con acceso"
                      : "Cargar más personas con acceso"
                  }
                  disabled={!authorityKey || busy}
                  onPress={() => {
                    if (authorityKey) {
                      void controller.loadGrants(
                        authorityKey,
                        resource.id,
                        true,
                      );
                    }
                  }}
                  style={[
                    styles.secondaryButton,
                    (!authorityKey || busy) && styles.disabled,
                  ]}
                >
                  <Text style={styles.buttonLabel}>
                    {current.grantsFailure
                      ? "Reintentar carga"
                      : "Cargar más accesos"}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Actualizar personas con acceso"
            disabled={
              !authorityKey || busy || current?.grantsState === "loading"
            }
            onPress={() => {
              if (authorityKey) {
                void controller.loadGrants(authorityKey, resource.id);
              }
            }}
            style={[
              styles.secondaryButton,
              (!authorityKey || busy || current?.grantsState === "loading") &&
                styles.disabled,
            ]}
          >
            <Text style={styles.buttonLabel}>Actualizar accesos</Text>
          </Pressable>
          <Text style={styles.label}>Buscar personas</Text>
          <TextInput
            accessibilityLabel="Buscar destinatarios para compartir"
            accessibilityHint="Escribí entre 2 y 120 caracteres y ejecutá la búsqueda."
            autoCapitalize="words"
            autoCorrect={false}
            editable={current?.outcome !== "visibility_changed" && !busy}
            maxLength={RESOURCE_SHARE_PEOPLE_QUERY_MAX}
            onChangeText={changeQuery}
            onSubmitEditing={search}
            placeholder="Nombre de la persona"
            returnKeyType="search"
            style={styles.input}
            value={query}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buscar personas para compartir"
            accessibilityState={{ disabled: !canSearch }}
            disabled={!canSearch}
            onPress={search}
            style={[styles.secondaryButton, !canSearch && styles.disabled]}
          >
            <Text style={styles.buttonLabel}>Buscar personas</Text>
          </Pressable>

          {current?.searchState === "loading" ? (
            <View style={styles.row}>
              <ActivityIndicator accessibilityLabel="Buscando personas" />
              <Text style={styles.info}>Buscando personas…</Text>
            </View>
          ) : null}
          {current?.searchState === "error" ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureCopy[current.failure ?? "error"]}
            </Text>
          ) : null}
          {current?.searchState === "ready" ? (
            <>
              <Text style={styles.info}>
                {current.people.length === 0
                  ? "No se encontraron personas. Probá con otro nombre."
                  : "Elegí la persona correcta antes de modificar su acceso."}
              </Text>
              <View accessibilityRole="radiogroup" style={styles.people}>
                {current.people.map((person) => (
                  <Pressable
                    key={person.profileId}
                    accessibilityRole="radio"
                    accessibilityLabel={`Seleccionar ${person.displayName}`}
                    accessibilityState={{
                      checked: selected?.profileId === person.profileId,
                      disabled: busy,
                    }}
                    disabled={busy}
                    onPress={() => {
                      if (!authorityKey) return;
                      controller.select(
                        authorityKey,
                        resource.id,
                        person.profileId,
                      );
                      setConfirmRevoke(false);
                    }}
                    style={[
                      styles.person,
                      selected?.profileId === person.profileId &&
                        styles.selected,
                    ]}
                  >
                    <Text style={styles.personName}>{person.displayName}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {selected ? (
            <View style={styles.actions}>
              <Text style={styles.label}>
                Persona seleccionada: {selected.displayName}
              </Text>
              <Text style={styles.info}>
                Conceder acceso permite abrir el apunte mientras siga
                Compartido. Revocar acceso elimina el permiso de esta persona si
                lo tenía.
              </Text>
              {current?.outcome === "granted" ? (
                <Text accessibilityRole="alert" style={styles.success}>
                  El servidor confirmó acceso para {selected.displayName}.
                </Text>
              ) : null}
              {current?.outcome === "revoked" ? (
                <Text accessibilityRole="alert" style={styles.success}>
                  El servidor confirmó la revocación para {selected.displayName}
                  .
                </Text>
              ) : null}
              {current?.outcome === "uncertain" ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  No pudimos confirmar el cambio de permiso. Esta pantalla no
                  permite consultar los permisos históricos; verificá el acceso
                  antes de repetir una operación.
                </Text>
              ) : null}
              {current?.outcome === "error" && current.failure ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {failureCopy[current.failure]}
                </Text>
              ) : null}

              {selectedHasAccess ? (
                <Text style={styles.success}>
                  Esta persona figura entre los permisos cargados.
                </Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Conceder acceso a ${selected.displayName}`}
                  disabled={!authorityKey || busy}
                  onPress={() => mutate("grant")}
                  style={[
                    styles.primaryButton,
                    (!authorityKey || busy) && styles.disabled,
                  ]}
                >
                  {current?.busy === "grant" ? (
                    <ActivityIndicator accessibilityLabel="Concediendo acceso" />
                  ) : (
                    <Text style={styles.primaryLabel}>Conceder acceso</Text>
                  )}
                </Pressable>
              )}

              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={`Confirmo revocar acceso a ${selected.displayName}`}
                accessibilityState={{
                  checked: confirmRevoke,
                  disabled: busy,
                }}
                disabled={busy}
                onPress={() => setConfirmRevoke((previous) => !previous)}
                style={styles.confirm}
              >
                <Text style={styles.buttonLabel}>
                  {confirmRevoke ? "☑" : "☐"} Confirmar revocación de acceso
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Revocar acceso a ${selected.displayName}`}
                accessibilityState={{
                  disabled: !authorityKey || busy || !confirmRevoke,
                }}
                disabled={!authorityKey || busy || !confirmRevoke}
                onPress={() => mutate("revoke")}
                style={[
                  styles.secondaryButton,
                  (!authorityKey || busy || !confirmRevoke) && styles.disabled,
                ]}
              >
                {current?.busy === "revoke" ? (
                  <ActivityIndicator accessibilityLabel="Revocando acceso" />
                ) : (
                  <Text style={styles.buttonLabel}>Revocar acceso</Text>
                )}
              </Pressable>
            </View>
          ) : current?.outcome === "visibility_changed" ? (
            <>
              <Text accessibilityRole="alert" style={styles.error}>
                Cambió la visibilidad o la versión del apunte. Actualizá el
                detalle y elegí nuevamente a la persona.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Actualizar apunte antes de administrar permisos"
                onPress={onRefresh}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonLabel}>Actualizar apunte</Text>
              </Pressable>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  heading: { fontSize: 17, fontWeight: "700", color: "#20202a" },
  label: { color: "#20202a", fontSize: 14, fontWeight: "700" },
  info: { color: "#686875", fontSize: 13, lineHeight: 20 },
  error: { color: "#9f1d1d", fontSize: 14, lineHeight: 20 },
  success: { color: "#17643a", fontSize: 14, lineHeight: 20 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#20202a",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  people: { gap: 8 },
  person: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    borderRadius: 11,
  },
  selected: { borderColor: "#43366a", backgroundColor: "#f1eff8" },
  personName: { fontSize: 14, fontWeight: "700", color: "#20202a" },
  actions: { gap: 10 },
  confirm: { minHeight: 44, justifyContent: "center" },
  secondaryButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonLabel: { color: "#24243a", fontWeight: "700", fontSize: 14 },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#3446a2",
  },
  primaryLabel: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.48 },
});
