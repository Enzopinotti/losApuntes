export function isNotificationReadConfirmed(value: unknown): value is { read: true };

export function isNotificationReadAllConfirmed(value: unknown): value is { updated: number };

export function isNotificationMutationUncertain(error: unknown): boolean;
