import { LogOut, X } from "lucide-react";

interface SwitchAccountDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SwitchAccountDialog({ isOpen, onCancel, onConfirm }: SwitchAccountDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-account-title"
        className="glass-panel w-full max-w-md rounded-xl border border-white/10 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-error-container/40 text-error">
            <LogOut aria-hidden="true" size={22} />
          </div>
          <button
            type="button"
            aria-label="Cancelar troca de conta"
            onClick={onCancel}
            className="focus-card flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <h2
          id="switch-account-title"
          className="mt-5 font-display text-2xl font-bold text-on-surface"
        >
          Trocar conta?
        </h2>
        <p className="mt-3 leading-6 text-on-surface-variant">
          A conexão atual será encerrada. Seus perfis, favoritos e histórico ficarão salvos para
          este servidor.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="focus-card rounded-lg border border-white/10 px-4 py-2.5 font-semibold text-on-surface-variant hover:text-on-surface"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="focus-card rounded-lg bg-error px-4 py-2.5 font-semibold text-white"
          >
            Sair e trocar conta
          </button>
        </div>
      </section>
    </div>
  );
}
