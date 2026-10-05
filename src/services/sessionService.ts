import type { ContentItem } from "../types/catalog";
import {
  beginXtreamCatalogLoad,
  loadXtreamCatalog,
  normalizeXtreamCredentials,
  type XtreamCatalogSectionUpdate,
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

export interface ProgressiveSession extends Omit<Session, "catalog"> {
  catalog: ContentItem[];
  catalogReady: Promise<ContentItem[]>;
}

const activeLoads = new Map<string, Promise<ProgressiveSession>>();

function connectionKey(connection: XtreamCredentials): string {
  return `${connection.serverUrl}\n${connection.username}`;
}

export function startServerSession(
  request: LoginRequest,
  onSection: (update: XtreamCatalogSectionUpdate) => void
): Promise<ProgressiveSession> {
  const connection = normalizeXtreamCredentials(request);
  const key = connectionKey(connection);
  const existing = activeLoads.get(key);
  if (existing) return existing;

  const load = beginXtreamCatalogLoad(connection, onSection).then((result) => ({
    displayName: connection.username,
    serverUrl: connection.serverUrl,
    connectedAt: new Date().toISOString(),
    catalog: [],
    source: "xtream" as const,
    connection,
    catalogReady: result.completion.finally(() => activeLoads.delete(key))
  }));
  activeLoads.set(key, load);
  void load.catch(() => activeLoads.delete(key));
  return load;
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
