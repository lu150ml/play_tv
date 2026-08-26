import { ArrowRight, Link as LinkIcon, Lock, Server, UserRound } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { connectServerSession } from "../services/sessionService";
import { credentialVault } from "../platform/credentialVault";
import { useLibraryStore } from "../stores/libraryStore";

export function LoginPage() {
  const navigate = useNavigate();
  const setSessionName = useLibraryStore((state) => state.setSessionName);
  const setServerUrlInStore = useLibraryStore((state) => state.setServerUrl);
  const setCatalog = useLibraryStore((state) => state.setCatalog);
  const setConnection = useLibraryStore((state) => state.setConnection);
  const [remember, setRemember] = useState(true);
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedServerUrl = readFormText(formData, "serverUrl", serverUrl);
    const submittedUsername = readFormText(formData, "username", username);
    const submittedPassword = readFormText(formData, "password", password);

    // Alguns teclados e gerenciadores de senha do Android alteram o valor
    // visível sem disparar o evento que atualiza o estado do React. Sincronizar
    // com FormData evita enviar campos vazios e preserva tudo em caso de erro.
    setServerUrl(submittedServerUrl);
    setUsername(submittedUsername);
    setPassword(submittedPassword);
    setError(undefined);
    setIsConnecting(true);

    try {
      const session = await connectServerSession({
        serverUrl: submittedServerUrl,
        username: submittedUsername,
        password: submittedPassword,
        remember
      });
      setSessionName(session.displayName);
      setServerUrlInStore(session.serverUrl);
      const connection = session.connection;
      setServerUrl(connection.serverUrl);
      setUsername(connection.username);
      setPassword(connection.password);
      setConnection(connection);
      if (remember) {
        await credentialVault.save(connection);
      } else {
        await credentialVault.clear();
      }
      setCatalog(session.catalog, session.source);
      void navigate("/profiles");
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
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-primary-container/40 bg-surface-container-low text-primary shadow-glow">
            <Server aria-hidden="true" size={34} />
          </div>
          <h1 className="font-display text-3xl font-bold text-primary">Play TV</h1>
          <p className="mt-2 text-on-surface-variant">Play TV · conexão Xtream</p>
        </header>

        <div className="space-y-5">
          <InputField
            name="serverUrl"
            label="Server URL"
            value={serverUrl}
            onChange={setServerUrl}
            placeholder="http://host:port"
            icon={<LinkIcon aria-hidden="true" size={20} />}
          />
          <InputField
            name="username"
            label="Username"
            value={username}
            onChange={setUsername}
            placeholder="Your Xtream username"
            icon={<UserRound aria-hidden="true" size={20} />}
          />
          <InputField
            name="password"
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="Your Xtream password"
            icon={<Lock aria-hidden="true" size={20} />}
          />
        </div>

        {error ? (
          <div className="mt-5 rounded-lg border border-error/30 bg-error-container/30 px-4 py-3 text-sm leading-6 text-error">
            {error}
          </div>
        ) : null}

        {serverUrl.trim().toLowerCase().startsWith("http://") ? (
          <div className="mt-5 rounded-lg border border-tertiary-container/40 bg-tertiary-container/10 px-4 py-3 text-sm leading-6 text-tertiary">
            Este servidor usa HTTP. Usuário, senha e conteúdo podem trafegar sem criptografia.
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
            Remember Me
          </label>
          <a className="font-mono text-xs uppercase text-primary" href="mailto:support@example.com">
            Get Help
          </a>
        </div>

        <button
          type="submit"
          disabled={isConnecting}
          className="focus-card flex w-full items-center justify-center gap-3 rounded-lg border border-primary-container/40 bg-primary px-6 py-4 font-display text-lg font-bold text-on-primary shadow-glow disabled:cursor-wait disabled:opacity-70"
        >
          {isConnecting ? "Connecting..." : "Connect"}
          <ArrowRight aria-hidden="true" size={24} />
        </button>

      </form>
    </main>
  );
}

function readFormText(formData: FormData, name: string, fallback: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : fallback;
}

interface InputFieldProps {
  name: "serverUrl" | "username" | "password";
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
  type?: string;
  placeholder?: string;
}

function InputField({ name, label, value, onChange, icon, type = "text", placeholder }: InputFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-normal text-on-surface-variant">
        {label}
      </span>
      <span className="focus-card flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface-variant">
        {icon}
        <input
          data-focusable="true"
          name={name}
          type={type}
          autoComplete={name === "password" ? "current-password" : name === "username" ? "username" : "url"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant"
        />
      </span>
    </label>
  );
}
