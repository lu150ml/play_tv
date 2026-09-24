import { registerPlugin } from "@capacitor/core";

import type { XtreamConnection } from "../stores/libraryStore";
import { isNativeAndroid } from "./platformInfo";

const WEB_KEY = "play-tv-remembered-connection";

interface SecureCredentialsPlugin {
  save(options: XtreamConnection): Promise<void>;
  load(): Promise<{ value?: XtreamConnection }>;
  clear(): Promise<void>;
}

const SecureCredentials = registerPlugin<SecureCredentialsPlugin>("SecureCredentials");

export const credentialVault = {
  async save(connection: XtreamConnection): Promise<void> {
    if (isNativeAndroid()) {
      await SecureCredentials.save(connection);
      return;
    }

    window.localStorage.setItem(WEB_KEY, JSON.stringify(connection));
  },

  async load(): Promise<XtreamConnection | undefined> {
    if (isNativeAndroid()) {
      return (await SecureCredentials.load()).value;
    }

    const raw = window.localStorage.getItem(WEB_KEY);
    if (!raw) return undefined;

    try {
      return JSON.parse(raw) as XtreamConnection;
    } catch {
      window.localStorage.removeItem(WEB_KEY);
      return undefined;
    }
  },

  async clear(): Promise<void> {
    if (isNativeAndroid()) {
      await SecureCredentials.clear();
      return;
    }

    window.localStorage.removeItem(WEB_KEY);
  }
};
