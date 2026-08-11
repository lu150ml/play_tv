import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { loadRememberedPassword } from "../services/credentialService";
import { connectServerSession } from "../services/sessionService";
import { useLibraryStore } from "../stores/libraryStore";

export function StartupPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Restaurando sessao...");

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      await useLibraryStore.persist.rehydrate();
      const state = useLibraryStore.getState();
      if (!state.rememberConnection || !state.connection) {
        if (!cancelled) void navigate("/login", { replace: true });
        return;
      }
      const password = await loadRememberedPassword();
      if (!password) {
        if (!cancelled)
          void navigate("/login", {
            replace: true,
            state: { error: "A senha lembrada nao esta mais disponivel. Conecte novamente." }
          });
        return;
      }
      try {
        const connection = { ...state.connection, password };
        const session = await connectServerSession({ ...connection, remember: true }, {
          onAuthenticated: (authenticated) => {
            state.activateServerAccount(connection, true);
            state.beginCatalogLoad();
            state.setSessionName(authenticated.displayName);
            state.setServerUrl(authenticated.serverUrl);
            const restored = useLibraryStore.getState();
            if (restored.profiles.length === 1) restored.setActiveProfile(restored.profiles[0].id);
            if (!cancelled) void navigate(restored.profiles.length === 1 ? "/catalog" : "/profiles", { replace: true });
          },
          onSection: (update) => state.setCatalogSection(update.section, update.items, update.status, update.warning)
        });
        state.setCatalog(session.catalog, session.source);
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Nao foi possivel restaurar a conexao.";
        setMessage(text);
        if (!cancelled) void navigate("/login", { replace: true, state: { error: text } });
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center text-on-surface-variant">
      {message}
    </main>
  );
}
