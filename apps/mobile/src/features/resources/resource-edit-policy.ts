import type { ResourceView, ResourceVisibility } from "@losapuntes/contracts";

export type ResourceEditDraft = {
  title: string;
  description: string;
  tagsText: string;
  visibility: ResourceVisibility;
};

export type ResourceEditPatch = {
  expectedRevision: number;
  title?: string;
  description?: string | null;
  tags?: string[];
  visibility?: ResourceVisibility;
};

export type ResourceEditValidation =
  | { kind: "valid"; patch: ResourceEditPatch }
  | { kind: "unchanged" }
  | { kind: "invalid"; message: string };

export const RESOURCE_EDIT_TITLE_MAX = 160;
export const RESOURCE_EDIT_DESCRIPTION_MAX = 3000;
export const RESOURCE_EDIT_TAGS_MAX = 12;
export const RESOURCE_EDIT_TAG_MAX = 40;

export function resourceEditDraft(resource: ResourceView): ResourceEditDraft {
  return {
    title: resource.title,
    description: resource.description ?? "",
    tagsText: resource.tags.join(", "),
    visibility: resource.visibility,
  };
}

/**
 * Build a minimal optimistic-concurrency PATCH; the server remains authoritative.
 * Never send academic IDs, the file ID, capabilities, or a client-made revision.
 */
export function validateResourceEdit(
  resource: ResourceView,
  draft: ResourceEditDraft,
): ResourceEditValidation {
  const title = draft.title.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (title.length < 2 || title.length > RESOURCE_EDIT_TITLE_MAX) {
    return { kind: "invalid", message: "El título debe tener entre 2 y 160 caracteres." };
  }

  const description = draft.description.normalize("NFC").trim();
  if (description.length > RESOURCE_EDIT_DESCRIPTION_MAX) {
    return { kind: "invalid", message: "La descripción no puede superar los 3000 caracteres." };
  }

  const tags = draft.tagsText
    .split(",")
    .map((tag) => tag.normalize("NFC").trim().replace(/\s+/gu, " "));
  if (
    (draft.tagsText.trim() && tags.length > RESOURCE_EDIT_TAGS_MAX) ||
    (draft.tagsText.trim() && tags.some((tag) => !tag || tag.length > RESOURCE_EDIT_TAG_MAX)) ||
    (draft.tagsText.trim() && new Set(tags).size !== tags.length)
  ) {
    return {
      kind: "invalid",
      message: "Usá hasta 12 etiquetas distintas, de 1 a 40 caracteres, separadas por coma.",
    };
  }
  // Empty input means no tags, not an invalid empty tag.
  const normalizedTags = draft.tagsText.trim() ? tags : [];
  if (
    draft.visibility !== "private" &&
    draft.visibility !== "shared" &&
    draft.visibility !== "public"
  ) {
    return { kind: "invalid", message: "Seleccioná una visibilidad válida." };
  }

  const patch: ResourceEditPatch = { expectedRevision: resource.revision };
  if (title !== resource.title) patch.title = title;
  if ((description || null) !== resource.description) {
    patch.description = description || null;
  }
  if (JSON.stringify(normalizedTags) !== JSON.stringify(resource.tags)) {
    patch.tags = normalizedTags;
  }
  if (draft.visibility !== resource.visibility) {
    patch.visibility = draft.visibility;
  }

  return Object.keys(patch).length === 1
    ? { kind: "unchanged" }
    : { kind: "valid", patch };
}
