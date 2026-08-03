export function getChannelStreamCandidates(url?: string): string[] {
  if (!url) return [];
  const candidates = [url];
  if (/\.m3u8(?:$|\?)/i.test(url)) candidates.push(url.replace(/\.m3u8(?=$|\?)/i, ".ts"));
  else if (/\.ts(?:$|\?)/i.test(url)) candidates.push(url.replace(/\.ts(?=$|\?)/i, ".m3u8"));
  return Array.from(new Set(candidates));
}

export function getOnDemandStreamCandidates(url?: string): string[] {
  if (!url) return [];
  const replaceExtension = (extension: string) =>
    url.replace(/\.[a-z0-9]+(?=([?#]|$))/i, `.${extension}`);
  const extension = url.match(/\.([a-z0-9]+)(?=([?#]|$))/i)?.[1]?.toLowerCase();
  if (!extension) return [url];

  const candidates = extension === "mkv"
    ? [replaceExtension("mp4"), replaceExtension("m3u8"), url]
    : extension === "mp4"
      ? [url, replaceExtension("m3u8")]
      : extension === "m3u8"
        ? [url, replaceExtension("mp4")]
        : [url, replaceExtension("mp4"), replaceExtension("m3u8")];
  return Array.from(new Set(candidates));
}

export function formatResolution(width?: number, height?: number): string | undefined {
  if (!height) return undefined;
  if (height >= 2160) return `4K (${width ?? "?"}x${height})`;
  return `${height}p${width ? ` (${width}x${height})` : ""}`;
}
