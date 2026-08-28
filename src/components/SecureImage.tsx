import { useEffect, useState } from "react";
import { resolveSecureImage } from "../platform/mediaAssets";

interface SecureImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  candidates: Array<string | undefined>;
}

export function SecureImage({ candidates, onError, ...props }: SecureImageProps) {
  const [source, setSource] = useState<string | undefined>(() => candidates.find(Boolean));
  const candidateKey = candidates.filter(Boolean).join("\n");

  useEffect(() => {
    let active = true;
    void resolveSecureImage(candidateKey.split("\n")).then((value) => {
      if (active && value) setSource(value);
    });
    return () => { active = false; };
  }, [candidateKey]);

  if (!source) return null;
  return <img {...props} src={source} onError={(event) => { setSource(undefined); onError?.(event); }} />;
}
