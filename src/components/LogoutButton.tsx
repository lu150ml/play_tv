import { LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { logoutSession } from "../services/logoutService";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutSession();
    } catch {
      // A sessão em memória já é limpa pelo serviço mesmo se o cofre falhar.
    } finally {
      void navigate("/login", { replace: true });
    }
  }

  return (
    <button
      type="button"
      aria-label="Sair da conta"
      disabled={isLoggingOut}
      onClick={() => {
        void handleLogout();
      }}
      className={[
        "focus-card flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/10 bg-surface-container text-on-surface-variant transition hover:border-error/40 hover:text-error disabled:opacity-60",
        compact ? "min-w-12 px-3" : "mt-3 w-full px-4 py-3 text-sm font-semibold"
      ].join(" ")}
    >
      <LogOut aria-hidden="true" size={18} />
      {compact ? <span className="sr-only">Sair</span> : isLoggingOut ? "Saindo..." : "Sair"}
    </button>
  );
}
