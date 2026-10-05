import { useLibraryStore } from "../stores/libraryStore";
import { beginXtreamCatalogLoad, type XtreamCatalogSectionUpdate } from "./xtreamService";

// A lista de conteúdo é renovada sozinha a cada 3 dias (e pelo botão
// "Atualizar lista" no menu Opções).
export const CATALOG_REFRESH_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

let inFlight: Promise<void> | undefined;

export function isCatalogRefreshing(): boolean {
  return inFlight !== undefined;
}

export function isCatalogStale(cachedAt: string | undefined, now = Date.now()): boolean {
  if (!cachedAt) return true;
  const time = new Date(cachedAt).getTime();
  return !Number.isFinite(time) || now - time >= CATALOG_REFRESH_INTERVAL_MS;
}

// Atualiza em segundo plano: a lista atual continua na tela e cada seção só é
// trocada quando chega completa. Seção que falhar mantém os itens antigos.
export function refreshCatalog(): Promise<void> {
  if (inFlight) return inFlight;
  const connection = useLibraryStore.getState().connection;
  if (!connection) return Promise.reject(new Error("Entre na sua conta para atualizar a lista."));

  const failed: Array<XtreamCatalogSectionUpdate["section"]> = [];
  inFlight = beginXtreamCatalogLoad(connection, (update) => {
    if (update.status === "ready") {
      useLibraryStore.getState().setCatalogSection(update.section, update.items, "ready");
    } else if (update.status === "error") {
      failed.push(update.section);
    }
  })
    .then((load) => load.completion)
    .then(() => {
      if (failed.length > 0) {
        throw new Error("Parte da lista não pôde ser atualizada. Tente novamente mais tarde.");
      }
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}
