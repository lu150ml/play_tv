import { Capacitor } from "@capacitor/core";

export type AppPlatform = "web" | "android";

export function getAppPlatform(): AppPlatform {
  return Capacitor.getPlatform() === "android" ? "android" : "web";
}

export function isNativeAndroid(): boolean {
  return getAppPlatform() === "android" && Capacitor.isNativePlatform();
}

export function isLikelyTv(): boolean {
  return isNativeAndroid() && window.matchMedia("(min-width: 960px) and (hover: none)").matches;
}
