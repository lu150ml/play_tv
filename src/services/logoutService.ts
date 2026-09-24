import { credentialVault } from "../platform/credentialVault";
import { useLibraryStore } from "../stores/libraryStore";

export async function logoutSession(): Promise<void> {
  try {
    await credentialVault.clear();
  } finally {
    useLibraryStore.getState().clearSession();
  }
}
