import type { SessionCredentialStore } from "@/platform/session-credential-store";

export const createSerializedCredentialStore = (
  store: SessionCredentialStore,
): SessionCredentialStore => {
  let tail: Promise<void> = Promise.resolve();

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    read: () => enqueue(() => store.read()),
    write: (credential) => enqueue(() => store.write(credential)),
    clear: () => enqueue(() => store.clear()),
  };
};
