import type { ContentItem } from "../types/catalog";
import { loadXtreamCatalog } from "./xtreamService";

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

export async function connectServerSession(request: LoginRequest): Promise<Session> {
  const result = await loadXtreamCatalog(request);

  return {
    displayName: request.username.trim() || "Editor Pro",
    serverUrl: result.serverUrl,
    connectedAt: new Date().toISOString(),
    catalog: result.catalog,
    source: "xtream",
    warnings: result.warnings
  };
}
