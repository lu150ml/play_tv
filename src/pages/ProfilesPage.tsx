import { MonitorPlay, Plus, Trash2, UserRound, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { BrandWordmark } from "../components/BrandWordmark";
import { LogoutButton } from "../components/LogoutButton";
import { useLibraryStore } from "../stores/libraryStore";
import type { Profile } from "../types/catalog";

const AVATAR_COLORS = [
  "bg-orange-700",
  "bg-red-800",
  "bg-amber-700",
  "bg-stone-600",
  "bg-yellow-800",
  "bg-rose-900",
  "bg-neutral-600",
  "bg-orange-900"
];

export function ProfilesPage() {
  const navigate = useNavigate();
  const profiles = useLibraryStore((state) => state.profiles);
  const setActiveProfile = useLibraryStore((state) => state.setActiveProfile);
  const createProfile = useLibraryStore((state) => state.createProfile);
  const deleteProfile = useLibraryStore((state) => state.deleteProfile);
  const sessionName = useLibraryStore((state) => state.sessionName);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleSelectProfile(profile: Profile) {
    setActiveProfile(profile.id);
    void navigate("/catalog");
  }

  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const profile = createProfile(trimmed, selectedColor);
    setActiveProfile(profile.id);
    void navigate("/catalog");
  }

  function handleDelete(profileId: string) {
    deleteProfile(profileId);
    setConfirmDeleteId(null);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12 text-on-surface">
      <div className="absolute right-4 top-4">
        <LogoutButton compact />
      </div>
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary shadow-glow">
          <MonitorPlay aria-hidden="true" size={22} />
        </div>
        <BrandWordmark compact />
      </div>
      <p className="mb-2 font-mono text-xs uppercase text-on-surface-variant">{sessionName}</p>
      <h1 className="mb-10 font-display text-3xl font-bold text-on-surface">Quem vai assistir?</h1>

      {/* Profile grid */}
      <div className="mb-8 flex flex-wrap justify-center gap-5">
        {profiles.map((profile) => (
          <div key={profile.id} className="relative">
            <button
              type="button"
              onClick={() => handleSelectProfile(profile)}
              className="focus-card group flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-surface-container/70 p-5 transition hover:border-primary-container/50 hover:bg-surface-container"
            >
              <ProfileAvatar name={profile.name} color={profile.avatarColor} size="lg" />
              <span className="font-display text-base font-semibold text-on-surface">
                {profile.name}
              </span>
            </button>
            {/* Delete button */}
            {confirmDeleteId === profile.id ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-error/40 bg-surface/95 backdrop-blur-sm">
                <p className="px-4 text-center text-sm text-on-surface">Excluir perfil?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDelete(profile.id)}
                    className="rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-on-surface-variant"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                aria-label={`Excluir perfil ${profile.name}`}
                onClick={() => setConfirmDeleteId(profile.id)}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-surface-container text-on-surface-variant opacity-0 transition hover:text-error focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}

        {/* Add profile card */}
        {!isCreating ? (
          <button
            type="button"
            onClick={() => {
              setIsCreating(true);
              setNewName("");
              setSelectedColor(AVATAR_COLORS[profiles.length % AVATAR_COLORS.length]);
            }}
            className="focus-card flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/20 bg-surface-container/30 p-5 text-on-surface-variant transition hover:border-primary-container/40 hover:text-on-surface"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-white/20">
              <Plus size={28} />
            </div>
            <span className="font-display text-base font-semibold">Criar perfil</span>
          </button>
        ) : null}
      </div>

      {/* Create profile form */}
      {isCreating ? (
        <div className="glass-panel w-full max-w-sm rounded-xl p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-on-surface">Novo perfil</h2>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              <X size={20} />
            </button>
          </div>

          {/* Preview */}
          <div className="mb-5 flex flex-col items-center gap-2">
            <ProfileAvatar name={newName || "?"} color={selectedColor} size="lg" />
            <p className="font-display text-base font-semibold text-on-surface">
              {newName.trim() || "Nome do perfil"}
            </p>
          </div>

          {/* Name input */}
          <label className="mb-4 block">
            <span className="mb-2 block font-mono text-xs uppercase text-on-surface-variant">
              Nome
            </span>
            <span className="focus-card flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3">
              <UserRound size={18} className="text-on-surface-variant" />
              <input
                autoFocus
                type="text"
                value={newName}
                maxLength={20}
                placeholder="Ex: Kaworu"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant"
              />
            </span>
          </label>

          {/* Color picker */}
          <div className="mb-5">
            <p className="mb-2 font-mono text-xs uppercase text-on-surface-variant">
              Cor do avatar
            </p>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={[
                    "h-8 w-8 rounded-full transition",
                    color,
                    selectedColor === color
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                      : "opacity-70 hover:opacity-100"
                  ].join(" ")}
                  aria-label={`Cor ${color}`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!newName.trim()}
            onClick={handleCreate}
            className="focus-card w-full rounded-lg border border-primary-container/40 bg-primary px-6 py-3 font-display text-base font-bold text-on-primary shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
          >
            Criar e entrar
          </button>
        </div>
      ) : null}

      {profiles.length === 0 && !isCreating ? (
        <p className="text-sm text-on-surface-variant">Crie seu primeiro perfil para começar.</p>
      ) : null}
    </main>
  );
}

function ProfileAvatar({
  name,
  color,
  size = "md"
}: {
  name: string;
  color: string;
  size?: "md" | "lg";
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const sizeClass = size === "lg" ? "h-20 w-20 text-3xl" : "h-10 w-10 text-base";

  return (
    <div
      className={[
        "flex items-center justify-center rounded-full font-display font-bold text-white",
        sizeClass,
        color
      ].join(" ")}
    >
      {initial}
    </div>
  );
}
