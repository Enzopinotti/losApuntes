export function isSaveConfirmed(
  response: unknown,
): response is { saved: true };

export function saveFailureMessage(error: unknown): string;
