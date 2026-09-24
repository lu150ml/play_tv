import { Preferences } from "@capacitor/preferences";
import type { StateStorage } from "zustand/middleware";

import { isNativeAndroid } from "./platformInfo";

export const platformStorage: StateStorage = {
  getItem(name) {
    if (isNativeAndroid()) {
      return Preferences.get({ key: name }).then(({ value }) => value);
    }

    return window.localStorage.getItem(name);
  },

  setItem(name, value) {
    if (isNativeAndroid()) {
      return Preferences.set({ key: name, value });
    }

    window.localStorage.setItem(name, value);
  },

  removeItem(name) {
    if (isNativeAndroid()) {
      return Preferences.remove({ key: name });
    }

    window.localStorage.removeItem(name);
  }
};
