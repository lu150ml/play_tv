import { ArrowRight, Link as LinkIcon, Lock, Server, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent, Ref } from "react";
import { useNavigate } from "react-router-dom";

import { BrandWordmark } from "../components/BrandWordmark";
import { startServerSession } from "../services/sessionService";
import { credentialVault } from "../platform/credentialVault";
import { hideNativeKeyboard } from "../platform/keyboardControl";
import { useLibraryStore } from "../stores/libraryStore";

export function LoginPage() {
  const navigate = useNavigate();
  const setSessionName = useLibraryStore((state) => state.setSessionName);
  const setServerUrlInStore = useLibraryStore((state) => state.setServerUrl);
  const beginCatalogLoad = useLibraryStore((state) => state.beginCatalogLoad);
  const setCatalogSection = useLibraryStore((state) => state.setCatalogSection);
  const setCatalogStatus = useLibraryStore((state) => state.setCatalogStatus);
  const setConnection = useLibraryStore((state) => state.setConnection);
  const profiles = useLibraryStore((state) => state.profiles);
  const setActiveProfile = useLibraryStore((state) => state.setActiveProfile);
  const [remember, setRemember] = useState(true);
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isConnecting, setIsConnecting] = useState(false);
  const [focusedField, setFocusedField] = useState<InputFieldName | undefined>();
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);

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
    beginCatalogLoad();

    try {
      const session = await startServerSession(
        { serverUrl: submittedServerUrl, username: submittedUsername, password: submittedPassword, remember },
        (update) => setCatalogSection(update.section, update.items, update.status, update.error)
      );
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
      if (profiles.length === 1 && profiles[0]) {
        setActiveProfile(profiles[0].id);
        void navigate("/home");
      } else {
        void navigate("/profiles");
      }
      void session.catalogReady;
    } catch (connectionError) {
      setCatalogStatus("error");
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
    <main className={`auth-screen login-screen flex min-h-screen items-center justify-center px-4 py-10 text-on-surface ${focusedField ? "login-screen--typing" : ""}`}>
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="glass-panel login-form w-full max-w-md rounded-2xl p-8 shadow-2xl"
      >
        <header className="login-brand mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary shadow-glow">
            <Server aria-hidden="true" size={34} />
          </div>
          <div className="flex justify-center">
            <BrandWordmark />
          </div>
          <p className="mt-2 text-on-surface-variant">Sua programação em um só lugar</p>
        </header>

        <div className="space-y-5">
          <InputField
            name="serverUrl"
            label="Endereço do servidor"
            value={serverUrl}
            onChange={setServerUrl}
            placeholder="http://host:port"
            icon={<LinkIcon aria-hidden="true" size={20} />}
            enterKeyHint="next"
            onEnter={() => usernameRef.current?.focus()}
            onFocus={() => setFocusedField("serverUrl")}
            onBlur={() => setFocusedField(undefined)}
          />
          <InputField
            name="username"
            label="Usuário"
            value={username}
            onChange={setUsername}
            placeholder="Seu usuário Xtream"
            icon={<UserRound aria-hidden="true" size={20} />}
            inputRef={usernameRef}
            enterKeyHint="next"
            onEnter={() => passwordRef.current?.focus()}
            onFocus={() => setFocusedField("username")}
            onBlur={() => setFocusedField(undefined)}
          />
          <InputField
            name="password"
            label="Senha"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="Sua senha Xtream"
            icon={<Lock aria-hidden="true" size={20} />}
            inputRef={passwordRef}
            enterKeyHint="done"
            onEnter={() => {
              passwordRef.current?.blur();
              void hideNativeKeyboard();
              submitRef.current?.focus();
              submitRef.current?.click();
            }}
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(undefined)}
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
            Lembrar acesso
          </label>
          <a className="font-mono text-xs uppercase text-primary" href="mailto:support@example.com">
            Ajuda
          </a>
        </div>

        <button
          ref={submitRef}
          type="submit"
          disabled={isConnecting}
          className="focus-card flex w-full items-center justify-center gap-3 rounded-lg border border-primary-container/40 bg-primary px-6 py-4 font-display text-lg font-bold text-on-primary shadow-glow disabled:cursor-wait disabled:opacity-70"
        >
          {isConnecting ? "Conectando..." : "Entrar"}
          <ArrowRight aria-hidden="true" size={24} />
        </button>
      </form>
      {focusedField ? (
        <TypingPreview
          label={getInputLabel(focusedField)}
          value={focusedField === "serverUrl" ? serverUrl : focusedField === "username" ? username : password}
          protectedValue={focusedField === "password"}
        />
      ) : null}
    </main>
  );
}

function readFormText(formData: FormData, name: string, fallback: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : fallback;
}

type InputFieldName = "serverUrl" | "username" | "password";

interface InputFieldProps {
  name: InputFieldName;
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
  type?: string;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  enterKeyHint?: "next" | "done";
  onEnter?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

function InputField({
  name,
  label,
  value,
  onChange,
  icon,
  type = "text",
  placeholder,
  inputRef,
  enterKeyHint,
  onEnter,
  onFocus,
  onBlur
}: InputFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-normal text-on-surface-variant">
        {label}
      </span>
      <span className="focus-card flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface-variant">
        {icon}
        <input
          ref={inputRef}
          data-focusable="true"
          name={name}
          type={type}
          enterKeyHint={enterKeyHint}
          inputMode={name === "serverUrl" ? "url" : "text"}
          autoComplete={
            name === "password" ? "current-password" : name === "username" ? "username" : "url"
          }
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onEnter?.();
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant"
        />
      </span>
    </label>
  );
}

function TypingPreview({
  label,
  value,
  protectedValue
}: {
  label: string;
  value: string;
  protectedValue?: boolean;
}) {
  const visibleValue = protectedValue && value ? "•".repeat(Math.min(value.length, 18)) : value;

  return (
    <div className="login-typing-preview fixed inset-x-4 bottom-5 z-[100] rounded-xl border border-primary/35 bg-black/95 px-4 py-3 shadow-2xl">
      <p className="font-mono text-[11px] uppercase text-primary">Digitando {label}</p>
      <p className="mt-1 truncate font-display text-lg font-semibold text-on-surface">
        {visibleValue || "Use o teclado para digitar"}
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">Voltar fecha o teclado antes de sair da tela.</p>
    </div>
  );
}

function getInputLabel(name: InputFieldName): string {
  if (name === "serverUrl") return "servidor";
  if (name === "username") return "usuário";
  return "senha";
}
