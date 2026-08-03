import { useEffect, useState } from "react";
import { getDesktopBridge } from "../services/desktopService";

export function useSecureImageUrl(src?: string) {
  const [secureUrl, setSecureUrl] = useState<string | undefined>();
  useEffect(() => {
    let cancelled = false;
    if (!src) { setSecureUrl(undefined); return; }
    const bridge = getDesktopBridge();
    if (!bridge?.media) { setSecureUrl(src); return; }
    setSecureUrl(undefined);
    void bridge.media.registerImage(src).then((url) => { if (!cancelled) setSecureUrl(url); }).catch(() => { if (!cancelled) setSecureUrl(undefined); });
    return () => { cancelled = true; };
  }, [src]);
  return secureUrl;
}
