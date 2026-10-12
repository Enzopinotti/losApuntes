import type { ResourceView } from "@losapuntes/contracts";

export const RESOURCE_TITLE_MAX_LENGTH = 160;
export const RESOURCE_DESCRIPTION_MAX_LENGTH = 3000;
export const RESOURCE_TAG_MAX_LENGTH = 40;
export const RESOURCE_TAG_MAX_COUNT = 12;

export type ResourceMetadataDraft = {
  title: string;
  description: string;
  tagsText: string;
};

export type ResourceMetadataUpdateInput = {
  expectedRevision: number;
  title?: string;
  description?: string | null;
  tags?: string[];
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
    input.description !== undefined &&
    updated.description !== input.description
  ) return false;
  if (input.tags !== undefined && (
    updated.tags.length !== input.tags.length ||
    updated.tags.some((tag, index) => tag !== input.tags?.[index])
  )) return false;
  return true;
}
