import { ArrowRight, Eye, EyeOff, Link as LinkIcon, Lock, UserRound } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { connectServerSession } from "../services/sessionService";
import { clearRememberedPassword, saveRememberedPassword } from "../services/credentialService";
import { useLibraryStore } from "../stores/libraryStore";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSessionName = useLibraryStore((state) => state.setSessionName);
  const setServerUrlInStore = useLibraryStore((state) => state.setServerUrl);
  const setCatalog = useLibraryStore((state) => state.setCatalog);
  const beginCatalogLoad = useLibraryStore((state) => state.beginCatalogLoad);
  const setCatalogSection = useLibraryStore((state) => state.setCatalogSection);
  const activateServerAccount = useLibraryStore((state) => state.activateServerAccount);
  const [remember, setRemember] = useState(true);
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | undefined>(
    (location.state as { error?: string } | null)?.error
  );
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsConnecting(true);

    try {
      const session = await connectServerSession({ serverUrl, username, password, remember }, {
        onAuthenticated: async (authenticated) => {
          if (remember) await saveRememberedPassword(password);
          else await clearRememberedPassword();
          activateServerAccount({ serverUrl, username, password }, remember);
          beginCatalogLoad();
          setSessionName(authenticated.displayName);
          setServerUrlInStore(authenticated.serverUrl);
          const account = useLibraryStore.getState();
          if (account.profiles.length === 1) {
            account.setActiveProfile(account.profiles[0].id);
            void navigate("/catalog");
          } else {
            void navigate("/profiles");
          }
        },
        onSection: (update) => setCatalogSection(update.section, update.items, update.status, update.warning)
      });
      setCatalog(session.catalog, session.source);
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : "Could not connect to the IPTV server."
      );
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 text-on-surface">
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="glass-panel w-full max-w-md rounded-xl p-8 shadow-2xl"
      >
        <header className="mb-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-lg bg-primary text-on-primary">
            <span className="font-display text-3xl font-bold">X</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-on-surface">
            PLAY TV <span className="text-primary">X</span>
          </h1>
          <p className="mt-2 text-on-surface-variant">Sua programação começa aqui</p>
        </header>

        <div className="space-y-5">
          <InputField
            label="Endereço do servidor"
            value={serverUrl}
            onChange={setServerUrl}
            placeholder="http://host:port"
            icon={<LinkIcon aria-hidden="true" size={20} />}
          />
          <InputField
            label="Usuário"
            value={username}
            onChange={setUsername}
            placeholder="Seu usuário Xtream"
            icon={<UserRound aria-hidden="true" size={20} />}
          />
          <InputField
            id="server-password"
            label="Senha"
            value={password}
            onChange={setPassword}
            type={isPasswordVisible ? "text" : "password"}
            placeholder="Sua senha"
            icon={<Lock aria-hidden="true" size={20} />}
            endAction={
              <button
                type="button"
                data-focusable="true"
                aria-label={isPasswordVisible ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={isPasswordVisible}
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                className="focus-card flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
              >
                {isPasswordVisible ? (
                  <EyeOff aria-hidden="true" size={20} />
                ) : (
                  <Eye aria-hidden="true" size={20} />
                )}
              </button>
            }
          />
        </div>

        {error ? (
          <div className="mt-5 rounded-lg border border-error/30 bg-error-container/30 px-4 py-3 text-sm leading-6 text-error">
            {error}
          </div>
        ) : null}

        <div className="my-6 flex items-center justify-between gap-4">
          <label className="flex items-center gap-3 text-sm text-on-surface-variant">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-5 w-5 accent-primary-container"
            />
            Lembrar acesso
          </label>
        </div>

        <button
          type="submit"
          disabled={isConnecting}
          className="focus-card flex w-full items-center justify-center gap-3 rounded-lg border border-primary-container/40 bg-primary px-6 py-4 font-display text-lg font-bold text-on-primary shadow-glow disabled:cursor-wait disabled:opacity-70"
        >
          {isConnecting ? "Conectando..." : "Entrar"}
          <ArrowRight aria-hidden="true" size={24} />
        </button>
      </form>
    </main>
  );
}

interface InputFieldProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
  type?: string;
  placeholder?: string;
  endAction?: React.ReactNode;
}

function InputField({
  id,
  label,
  value,
  onChange,
  icon,
  type = "text",
  placeholder,
  endAction
}: InputFieldProps) {
  const inputId = id ?? `login-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="block">
      <label
        htmlFor={inputId}
        className="mb-2 block font-mono text-xs uppercase tracking-normal text-on-surface-variant"
      >
        {label}
      </label>
      <span className="focus-card flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface-variant">
        {icon}
        <input
          id={inputId}
          data-focusable="true"
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant"
        />
        {endAction}
      </span>
    </div>
  );
}
