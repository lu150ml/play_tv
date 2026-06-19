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
}

export async function connectServerSession(request: LoginRequest): Promise<Session> {
  const result = await loadXtreamCatalog(request);

  return {
    displayName: request.username.trim() || "Editor Pro",
    serverUrl: request.serverUrl.trim() || "mock://server-xtreme",
    connectedAt: new Date().toISOString(),
    catalog: result.catalog,
    source: "xtream"
  };
}
