import type { ContentItem } from "../types/catalog";
import {
  loadXtreamCatalog,
  normalizeXtreamCredentials,
  type XtreamCredentials
} from "./xtreamService";

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
  connection: XtreamCredentials;
}

export async function connectServerSession(request: LoginRequest): Promise<Session> {
  const connection = normalizeXtreamCredentials(request);
  const result = await loadXtreamCatalog(connection);

  return {
    displayName: connection.username,
    serverUrl: connection.serverUrl,
    connectedAt: new Date().toISOString(),
    catalog: result.catalog,
    source: "xtream",
    connection
  };
}
