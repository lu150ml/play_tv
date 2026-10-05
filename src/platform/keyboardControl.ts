import { registerPlugin } from "@capacitor/core";

import { isNativeAndroid } from "./platformInfo";

interface KeyboardControlPlugin {
  hide(): Promise<{ hidden: boolean }>;
}

const KeyboardControl = registerPlugin<KeyboardControlPlugin>("KeyboardControl");

export async function hideNativeKeyboard(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const result = await KeyboardControl.hide();
    return result.hidden;
  } catch {
    return false;
  }
}
