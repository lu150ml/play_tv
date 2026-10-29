// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSeekStep, usePlayerKeyboard } from "./usePlayerKeyboard";

function createVideo(currentTime = 100, volume = 0.5): HTMLVideoElement {
  const video = document.createElement("video");
  video.currentTime = currentTime;
  video.volume = volume;
  document.body.appendChild(video);
  return video;
}

function press(key: string, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function setup(
  video: HTMLVideoElement,
  overrides: { enabled?: boolean; canSeek?: boolean; volume?: number; muted?: boolean } = {}
) {
  const onSeek = vi.fn();
  const onVolumeChange = vi.fn();
  const onTogglePlay = vi.fn();
  const onActivity = vi.fn();
  const onToggleFullscreen = vi.fn();
  const onToggleMute = vi.fn();
  const hook = renderHook(() =>
    usePlayerKeyboard({
      videoRef: { current: video },
      enabled: overrides.enabled ?? true,
      canSeek: overrides.canSeek ?? true,
      durationSeconds: 1000,
      volume: overrides.volume ?? 0.5,
      muted: overrides.muted ?? false,
      onSeek,
      onVolumeChange,
      onTogglePlay,
      onToggleFullscreen,
      onToggleMute,
      onActivity
    })
  );
  return { onSeek, onVolumeChange, onTogglePlay, onToggleFullscreen, onToggleMute, onActivity, hook };
}

describe("getSeekStep", () => {
  it("uses 5s for a single press and 10s for quick repeats", () => {
    expect(getSeekStep(1000, undefined, false)).toBe(5);
    expect(getSeekStep(1300, 1000, true)).toBe(10);
    expect(getSeekStep(1300, 1000, false)).toBe(5);
    expect(getSeekStep(2000, 1000, true)).toBe(5);
  });
});

describe("usePlayerKeyboard", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeks 5s on one press and 10s on a quick second press", () => {
    const video = createVideo(100);
    const { onSeek } = setup(video);

    press("ArrowRight");
    expect(onSeek).toHaveBeenLastCalledWith(105);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    press("ArrowRight");
    expect(onSeek).toHaveBeenLastCalledWith(110);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    press("ArrowLeft");
    expect(onSeek).toHaveBeenLastCalledWith(95);
  });

  it("does not seek live channels", () => {
    const { onSeek } = setup(createVideo(), { canSeek: false });
    press("ArrowRight");
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("steps the volume by 10% within 0-1", () => {
    const high = setup(createVideo(), { volume: 0.95 });
    press("ArrowUp");
    expect(high.onVolumeChange).toHaveBeenLastCalledWith(1);
    expect(high.hook.result.current?.text).toBe("Volume 100%");
    high.hook.unmount();

    const low = setup(createVideo(), { volume: 0.3 });
    press("ArrowDown");
    expect(low.onVolumeChange).toHaveBeenLastCalledWith(0.2);
    low.hook.unmount();

    const muted = setup(createVideo(), { volume: 0 });
    press("ArrowDown");
    expect(muted.onVolumeChange).toHaveBeenLastCalledWith(0);
  });

  it("toggles play once with space, even with a button focused", () => {
    const { onTogglePlay } = setup(createVideo());
    const button = document.createElement("button");
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    document.body.appendChild(button);
    button.focus();

    const event = press(" ", button);

    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("toggles fullscreen with F", () => {
    const { onToggleFullscreen } = setup(createVideo(), { canSeek: false });
    press("f");
    press("F");
    expect(onToggleFullscreen).toHaveBeenCalledTimes(2);
  });

  it("toggles mute with M and shows the new state", () => {
    const unmuted = setup(createVideo());
    press("m");
    expect(unmuted.onToggleMute).toHaveBeenCalledTimes(1);
    expect(unmuted.hook.result.current?.text).toBe("Mudo");
    unmuted.hook.unmount();

    const muted = setup(createVideo(), { muted: true });
    press("M");
    expect(muted.hook.result.current?.text).toBe("Som ativado");
  });

  it("keeps arrows away from the remote navigation listener", () => {
    setup(createVideo());
    const documentListener = vi.fn();
    document.addEventListener("keydown", documentListener);

    press("ArrowDown");

    expect(documentListener).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentListener);
  });

  it("ignores keys in text inputs", () => {
    const { onSeek } = setup(createVideo(100));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    press("ArrowRight", input);
    press("f", input);
    press("m", input);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const { onSeek, onTogglePlay } = setup(createVideo(100), { enabled: false });
    press("ArrowRight");
    press(" ");
    expect(onSeek).not.toHaveBeenCalled();
    expect(onTogglePlay).not.toHaveBeenCalled();
  });
});
