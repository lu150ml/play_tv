export function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds) {
    return "Live";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatPlaybackTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatRemainingTime(totalSeconds?: number): string | undefined {
  if (totalSeconds === undefined) {
    return undefined;
  }

  const minutes = Math.ceil(totalSeconds / 60);

  if (minutes <= 0) {
    return "watched";
  }

  if (minutes < 60) {
    return `${minutes} min restantes`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h restantes`;
  }

  return `${hours}h ${remainingMinutes}min restantes`;
}
