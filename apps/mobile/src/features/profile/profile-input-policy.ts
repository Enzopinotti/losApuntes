export type ProfileListField =
  "languages" | "skills" | "interests" | "helpTopics" | "learningTopics";

type ProfileListRule = {
  label: string;
  maxItems: number;
  minLength: number;
  maxLength: number;
};

export const PROFILE_LIST_RULES: Record<ProfileListField, ProfileListRule> = {
  languages: {
    label: "Idiomas",
    maxItems: 10,
    minLength: 2,
    maxLength: 35,
  },
  skills: {
    label: "Habilidades",
    maxItems: 30,
    minLength: 1,
    maxLength: 60,
  },
  interests: {
    label: "Intereses",
    maxItems: 30,
    minLength: 1,
    maxLength: 60,
  },
  helpTopics: {
    label: "Temas en los que podés ayudar",
    maxItems: 20,
    minLength: 1,
    maxLength: 100,
  },
  learningTopics: {
    label: "Temas que querés aprender",
    maxItems: 20,
    minLength: 1,
    maxLength: 100,
  },
};

export type ProfileListParseResult =
  { ok: true; values: string[] } | { ok: false; message: string };

export function parseProfileListInput(
  field: ProfileListField,
  value: string,
): ProfileListParseResult {
  const rule = PROFILE_LIST_RULES[field];
  const seen = new Set<string>();
  const values: string[] = [];

  for (const raw of value.split(",")) {
    const item = raw.normalize("NFC").trim();
    if (!item) continue;

    const key = item.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(item);
  }

  if (values.length > rule.maxItems) {
    return {
      ok: false,
      message: `${rule.label}: máximo ${rule.maxItems} valores.`,
    };
  }

  const invalid = values.find((item) => {
    const length = unicodeCodePointLength(item);
    return length < rule.minLength || length > rule.maxLength;
  });
  if (invalid) {
    return {
      ok: false,
      message:
        rule.minLength === rule.maxLength
          ? `${rule.label}: cada valor debe tener ${rule.maxLength} caracteres.`
          : `${rule.label}: cada valor debe tener entre ${rule.minLength} y ${rule.maxLength} caracteres.`,
    };
  }

  return { ok: true, values };
}

export function profileListInputCapacity(field: ProfileListField): number {
  const rule = PROFILE_LIST_RULES[field];
  const separators = Math.max(0, rule.maxItems - 1) * 2;
  return rule.maxItems * rule.maxLength * 2 + separators;
}

export type ProfileHeadlineParseResult =
  { ok: true; value: string | null } | { ok: false; message: string };

export function parseProfileHeadline(
  value: string,
): ProfileHeadlineParseResult {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) return { ok: true, value: null };

  const length = unicodeCodePointLength(normalized);\n\n  if (length < 2 || length > 140) {
    return {
      ok: false,
      message: "El titular debe tener entre 2 y 140 caracteres.",
    };
  }

  return { ok: true, value: normalized };
}

export function unicodeCodePointLength(value: string): number {
  return [...value].length;
}

export function unicodeTextInputCapacity(maxCodePoints: number): number {
  return maxCodePoints * 2;
}
