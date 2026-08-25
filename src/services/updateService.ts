import { App } from "@capacitor/app";
import { registerPlugin } from "@capacitor/core";

import { httpClient } from "../platform/httpClient";
import { isNativeAndroid } from "../platform/platformInfo";

const DEFAULT_MANIFEST_URL =
  "https://raw.githubusercontent.com/lu150ml/play_tv/refs/heads/codex/android-capacitor/android-update.json";

export interface AndroidUpdateManifest {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  sha256: string;
  releaseNotes?: string;
}

interface AndroidUpdaterPlugin {
  install(options: { apkUrl: string; sha256: string }): Promise<{ installerOpened: boolean }>;
}

const AndroidUpdater = registerPlugin<AndroidUpdaterPlugin>("AndroidUpdater");

export function isNewerBuild(currentBuild: number, candidateBuild: number): boolean {
  return Number.isInteger(candidateBuild) && candidateBuild > currentBuild;
}

export async function checkForAndroidUpdate(): Promise<AndroidUpdateManifest | undefined> {
  if (!isNativeAndroid()) return undefined;

  const info = await App.getInfo();
  const currentBuild = Number.parseInt(info.build, 10);
  const manifestUrl =
    import.meta.env.VITE_ANDROID_UPDATE_MANIFEST_URL?.trim() || DEFAULT_MANIFEST_URL;
  const separator = manifestUrl.includes("?") ? "&" : "?";
  const response = await httpClient.get<AndroidUpdateManifest>(
    `${manifestUrl}${separator}checkedAt=${Date.now()}`
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error("Não foi possível consultar as atualizações.");
  }

  const manifest = response.data;
  if (
    !Number.isInteger(manifest.versionCode) ||
    !manifest.versionName ||
    !manifest.apkUrl?.startsWith("https://") ||
    !/^[a-f\d]{64}$/i.test(manifest.sha256)
  ) {
    throw new Error("O servidor retornou uma atualização inválida.");
  }

  return isNewerBuild(Number.isFinite(currentBuild) ? currentBuild : 0, manifest.versionCode)
    ? manifest
    : undefined;
}

export async function installAndroidUpdate(update: AndroidUpdateManifest): Promise<void> {
  if (!isNativeAndroid()) return;
  await AndroidUpdater.install({ apkUrl: update.apkUrl, sha256: update.sha256 });
}
