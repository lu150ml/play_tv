import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { useSecureImageUrl } from "../hooks/useSecureImageUrl";

type SecureImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string };

export function SecureImage({ src, onError, ...props }: SecureImageProps) {
  const secureUrl = useSecureImageUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [secureUrl]);
  if (!secureUrl || failed) return null;
  return <img {...props} src={secureUrl} onError={(event) => { setFailed(true); onError?.(event); }} />;
}
