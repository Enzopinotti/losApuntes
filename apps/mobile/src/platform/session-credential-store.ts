import * as SecureStore from "expo-secure-store";

export interface SessionCredentialStore {
  read(): Promise<string | null>;
  write(credential: string): Promise<void>;
  clear(): Promise<void>;
}

const SESSION_CREDENTIAL_KEY = "losapuntes.mobile.session.credential.v1";

export const secureSessionCredentialStore: SessionCredentialStore = {
  read: () => SecureStore.getItemAsync(SESSION_CREDENTIAL_KEY),
  write: (credential) =>
    SecureStore.setItemAsync(SESSION_CREDENTIAL_KEY, credential, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(SESSION_CREDENTIAL_KEY),
};
