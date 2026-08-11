import type { ContentItem } from "../types/catalog";
import { loadXtreamCatalog } from "./xtreamService";
import type { XtreamCatalogSectionUpdate } from "./xtreamService";

export interface LoginRequest {
  serverUrl: string;
  username: string;
  password: string;
  remember: boolean;
}

export interface Session {
  displayName: string;
  serverUrl: string;
  connectedAt: string;
  catalog: ContentItem[];
  source: "xtream";
  warnings: string[];
}

export interface SessionLoadOptions {
  onAuthenticated?: (session: Omit<Session, "catalog" | "warnings">) => void | Promise<void>;
  onSection?: (update: XtreamCatalogSectionUpdate) => void;
}

export async function connectServerSession(
  request: LoginRequest,
  options: SessionLoadOptions = {}
): Promise<Session> {
  const connectedAt = new Date().toISOString();
  const result = await loadXtreamCatalog(request, {
    onAuthenticated: ({ serverUrl }) => options.onAuthenticated?.({
      displayName: request.username.trim() || "Editor Pro",
      serverUrl,
      connectedAt,
      source: "xtream"
    }),
    onSection: options.onSection
  });

  return {
    displayName: request.username.trim() || "Editor Pro",
    serverUrl: result.serverUrl,
    connectedAt,
    catalog: result.catalog,
    source: "xtream",
    warnings: result.warnings
  };
}
