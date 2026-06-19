interface BufferedRangeLike {
  length: number;
  start(index: number): number;
  end(index: number): number;
}

export function getBufferedAheadSeconds(buffered: BufferedRangeLike, currentTime: number): number {
  for (let index = 0; index < buffered.length; index += 1) {
    const start = buffered.start(index);
    const end = buffered.end(index);

    if (currentTime >= start && currentTime <= end) {
      return Math.max(end - currentTime, 0);
    }
  }

  return 0;
}

export function hasEnoughStartupBuffer(
  buffered: BufferedRangeLike,
  currentTime: number,
  minimumSeconds: number
): boolean {
  return getBufferedAheadSeconds(buffered, currentTime) >= minimumSeconds;
}
