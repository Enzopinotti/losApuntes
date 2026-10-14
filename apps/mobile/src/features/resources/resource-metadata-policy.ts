import type {
  ResourceView,
  ResourceVisibility,
} from "@losapuntes/contracts";

export const RESOURCE_TITLE_MAX_LENGTH = 160;
export const RESOURCE_DESCRIPTION_MAX_LENGTH = 3000;
export const RESOURCE_TAG_MAX_LENGTH = 40;
export const RESOURCE_TAG_MAX_COUNT = 12;

export const RESOURCE_VISIBILITY_OPTIONS = [
  { value: "private", label: "Privado", detail: "Solo vos podés abrir el apunte." },
  {
    value: "shared",
    label: "Compartido",
    detail: "Solo vos y las personas con permiso explícito pueden abrirlo.",
  },
  {
    value: "public",
    label: "Público",
    detail: "Cualquier persona puede consultar el apunte.",
  },
] as const satisfies ReadonlyArray<{
  value: ResourceVisibility;
  label: string;
  detail: string;
}>;

/**
 * A previously shared resource loses its explicit grants atomically when
 * switching to private/public. Switching *back* does not restore grants.
 */
export function resourceVisibilityWarning(
  before: ResourceVisibility,
  after: ResourceVisibility,
): string | null {
  if (before === after) return null;
  if (before === "shared") {
    return after === "public"
      ? "Al hacerlo público, cualquiera podrá abrir el apunte. Se eliminarán los permisos individuales anteriores y no se recuperarán al volver a Compartido."
      : "Al hacerlo privado, se eliminarán los permisos individuales anteriores. No se recuperarán automáticamente al volver a Compartido.";
  }
  if (after === "public") {
    return "Al hacerlo público, cualquier persona podrá consultar y abrir este apunte.";
  }
  if (after === "shared") {
    return "Compartido no lo publica automáticamente: solo podrán abrirlo las personas con permisos explícitos. Necesitás conceder esos permisos por separado.";
  }
  return "El apunte dejará de estar disponible para otras personas y pasará a ser privado.";
}

export type ResourceMetadataDraft = {
  title: string;
  description: string;
  tagsText: string;
  visibility?: ResourceVisibility;
};

export type ResourceMetadataUpdateInput = {
  expectedRevision: number;
  title?: string;
  description?: string | null;
  tags?: string[];
  visibility?: ResourceVisibility;
};

export type ResourceMetadataValidation =
  | { kind: "invalid"; message: string }
  | { kind: "unchanged" }
  | { kind: "valid"; input: ResourceMetadataUpdateInput };

export function resourceMetadataDraft(resource: ResourceView): ResourceMetadataDraft {
  return {
    title: resource.title,
    description: resource.description ?? "",
    tagsText: resource.tags.join(", "),
    visibility: resource.visibility,
  };
}

/**
 * Server revision is mandatory, so edits never silently overwrite a newer
 * resource. Only changed fields are sent (the backend rejects empty PATCHes).
 */
export function validateResourceMetadata(
  resource: ResourceView,
  draft: ResourceMetadataDraft,
): ResourceMetadataValidation {
  if (!resource.capabilities.edit || !Number.isInteger(resource.revision) || resource.revision < 1) {
    return { kind: "invalid", message: "No tenés permiso para editar este apunte." };
  }

  const visibility = draft.visibility ?? resource.visibility;
  if (
    !RESOURCE_VISIBILITY_OPTIONS.some((option) => option.value === visibility)
  ) {
    return { kind: "invalid", message: "Elegí una visibilidad válida." };
  }

  const title = draft.title.normalize("NFC").trim().replace(/\s+/gu, " ");
  const description = draft.description
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ");
  const tags = draft.tagsText
    .split(",")
    .map((value) => value.normalize("NFC").trim().replace(/\s+/gu, " "))
    .filter(Boolean);

  if (title.length < 2 || title.length > RESOURCE_TITLE_MAX_LENGTH) {
    return { kind: "invalid", message: "El título debe tener entre 2 y 160 caracteres." };
  }
  if (description.length > RESOURCE_DESCRIPTION_MAX_LENGTH) {
    return { kind: "invalid", message: "La descripción puede tener hasta 3000 caracteres." };
  }
  if (tags.length > RESOURCE_TAG_MAX_COUNT) {
    return { kind: "invalid", message: "Podés agregar hasta 12 etiquetas." };
  }
  if (tags.some((tag) => tag.length > RESOURCE_TAG_MAX_LENGTH)) {
    return { kind: "invalid", message: "Cada etiqueta puede tener hasta 40 caracteres." };
  }
  const unique = new Set(
    tags.map((tag) => tag.normalize("NFKC").toLocaleLowerCase("es-AR")),
  );
  if (unique.size !== tags.length) {
    return { kind: "invalid", message: "No repitas etiquetas." };
  }

  const input: ResourceMetadataUpdateInput = {
    expectedRevision: resource.revision,
  };
  if (title !== resource.title) input.title = title;
  if (description !== (resource.description ?? "")) {
    input.description = description.length ? description : null;
  }
  if (
    tags.length !== resource.tags.length ||
    tags.some((tag, index) => tag !== resource.tags[index])
  ) {
    input.tags = tags;
  }
  if (visibility !== resource.visibility) input.visibility = visibility;

  return Object.keys(input).length === 1
    ? { kind: "unchanged" }
    : { kind: "valid", input };
}

/** Checks the server's response without trusting an optimistic local patch. */
export function resourceMetadataMatches(
  updated: ResourceView,
  original: ResourceView,
  input: ResourceMetadataUpdateInput,
): boolean {
  if (updated.id !== original.id || updated.revision <= original.revision) return false;
  if (input.title !== undefined && updated.title !== input.title) return false;
  if (
    input.visibility !== undefined &&
    updated.visibility !== input.visibility
  ) return false;
  if (
    input.description !== undefined &&
    updated.description !== input.description
  ) return false;
  if (input.tags !== undefined && (
    updated.tags.length !== input.tags.length ||
    updated.tags.some((tag, index) => tag !== input.tags?.[index])
  )) return false;
  return true;
}
