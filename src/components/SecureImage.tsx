import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { useSecureImageUrl } from "../hooks/useSecureImageUrl";

type SecureImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string };

export function SecureImage({ src, onError, ...props }: SecureImageProps) {
  const secureUrl = useSecureImageUrl(src);
  const [failed, setFailed] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  useEffect(() => setFailed(false), [secureUrl]);
  useEffect(() => setUseOriginal(false), [src]);
  const imageUrl = useOriginal && src ? src : secureUrl;
  if (!imageUrl || failed) return null;
  return (
    <img
      {...props}
      src={imageUrl}
      onError={(event) => {
        if (!useOriginal && src && imageUrl !== src) {
          setUseOriginal(true);
          return;
        }
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
