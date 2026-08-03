import "./desktopService";

const WEB_KEY = "server-xtreme-remembered-secret";

export async function saveRememberedPassword(password: string): Promise<void> {
  if (window.serverXtreme) {
    await window.serverXtreme.credentials.save(password);
    return;
  }
  window.localStorage.setItem(WEB_KEY, password);
}

export async function loadRememberedPassword(): Promise<string | undefined> {
  if (window.serverXtreme) return window.serverXtreme.credentials.load();
  return window.localStorage.getItem(WEB_KEY) ?? undefined;
}

export async function clearRememberedPassword(): Promise<void> {
  if (window.serverXtreme) await window.serverXtreme.credentials.clear();
  window.localStorage.removeItem(WEB_KEY);
}
