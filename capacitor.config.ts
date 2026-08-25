import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.playtv.app",
  appName: "Play TV",
  webDir: "dist",
  android: {
    allowMixedContent: true,
    captureInput: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: false
    }
  }
};

export default config;
