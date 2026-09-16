import { beforeEach, describe, expect, it } from "vitest";

import { diagnostics } from "./diagnosticsService";

beforeEach(() => {
  diagnostics.clear();
});

describe("diagnosticsService", () => {
  it("registra evento e retorna no getAll", () => {
    diagnostics.record({ action: "get_vod_streams", attempt: 1, durationMs: 3200, status: 200 });
    const events = diagnostics.getAll();
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.action).toBe("get_vod_streams");
    expect(events[0]?.durationMs).toBe(3200);
  });

  it("limita a 100 eventos", () => {
    for (let i = 0; i < 120; i++) {
      diagnostics.record({ action: "auth", attempt: 1, durationMs: i });
    }
    expect(diagnostics.getAll()).toHaveLength(100);
  });

  it("clear remove todos os eventos", () => {
    diagnostics.record({ action: "get_series", attempt: 1, durationMs: 500 });
    diagnostics.clear();
    expect(diagnostics.getAll()).toHaveLength(0);
  });

  it("getSectionSummary retorna entradas para as 3 seções", () => {
    diagnostics.record({ action: "get_vod_streams", attempt: 1, durationMs: 4000, status: 200 });
    diagnostics.record({ action: "get_series", attempt: 2, durationMs: 8000, status: 200 });
    const summary = diagnostics.getSectionSummary();
    expect(summary).toHaveLength(3);
    const vod = summary.find((s) => s.section === "Filmes");
    expect(vod?.lastDurationMs).toBe(4000);
    expect(vod?.ok).toBe(true);
  });

  it("getSectionSummary marca erro quando há campo error", () => {
    diagnostics.record({ action: "get_vod_streams", attempt: 3, durationMs: 92000, error: "timeout" });
    const summary = diagnostics.getSectionSummary();
    const vod = summary.find((s) => s.section === "Filmes");
    expect(vod?.ok).toBe(false);
    expect(vod?.error).toBe("timeout");
  });
});
