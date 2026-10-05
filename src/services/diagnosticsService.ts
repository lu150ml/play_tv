/**
 * Serviço leve de diagnóstico para rastrear requisições Xtream em memória.
 * Não envia dados para nenhum servidor — é apenas para depuração local via
 * painel "Diagnóstico" no menu Opções.
 */

export interface DiagEvent {
  /** Nome da ação Xtream (ex: "get_vod_streams"). */
  action: string;
  /** Número da tentativa (1 = primeira). */
  attempt: number;
  /** Duração total em ms até sucesso ou falha definitiva. */
  durationMs: number;
  /** Status HTTP retornado (undefined se erro de rede/timeout). */
  status?: number;
  /** Mensagem de erro, se houver. */
  error?: string;
  /** Timestamp ISO da requisição. */
  timestamp: string;
}

const MAX_EVENTS = 100;
const STORAGE_KEY = "play-tv:diagnostics";

class DiagnosticsService {
  private events: DiagEvent[] = [];

  constructor() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) this.events = JSON.parse(raw) as DiagEvent[];
    } catch {
      /* ignora erro de parse */
    }
  }

  record(entry: Omit<DiagEvent, "timestamp">): void {
    const event: DiagEvent = { ...entry, timestamp: new Date().toISOString() };
    this.events = [event, ...this.events].slice(0, MAX_EVENTS);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch {
      /* quota cheia — ignora */
    }
  }

  getAll(): DiagEvent[] {
    return this.events;
  }

  clear(): void {
    this.events = [];
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignora */
    }
  }

  /** Resumo por seção para exibição rápida. */
  getSectionSummary(): { section: string; lastDurationMs: number; attempts: number; error?: string; ok: boolean }[] {
    const sections = ["get_vod_streams", "get_series", "get_live_streams"];
    return sections.map((action) => {
      const sectionEvents = this.events.filter((e) => e.action === action);
      if (sectionEvents.length === 0) return { section: labelFor(action), lastDurationMs: 0, attempts: 0, ok: false };
      const last = sectionEvents[0];
      const totalAttempts = sectionEvents.filter(
        (e) => new Date(e.timestamp).getTime() >= new Date(last.timestamp).getTime() - 120_000
      ).length;
      return {
        section: labelFor(action),
        lastDurationMs: last.durationMs,
        attempts: totalAttempts,
        error: last.error,
        ok: !last.error && last.status !== undefined && last.status < 400
      };
    });
  }
}

function labelFor(action: string): string {
  if (action === "get_vod_streams") return "Filmes";
  if (action === "get_series") return "Séries";
  if (action === "get_live_streams") return "TV ao vivo";
  return action;
}

export const diagnostics = new DiagnosticsService();
